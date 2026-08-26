#!/usr/bin/env python3
"""Reproducible API benchmark against a *running* EMS backend.

Unlike ``stress_test.py`` (which spins a disposable SQLite backend for a quick
local smoke), this points at an already-running stack via ``--base-url`` — the
intended target is the production Docker stack (PostgreSQL + Redis + Gunicorn +
Nginx). It fixes the methodology so runs are comparable: a fixed seeded dataset,
a warm-up, N repetitions, a weighted read/write scenario mix at a fixed
concurrency, and full latency percentiles.

IMPORTANT — comparability rules:
  * Only compare runs from the *same* configuration (same DB engine, worker count,
    hardware, dataset). A SQLite number is NOT a PostgreSQL number.
  * A single local run is not a scalability claim. Report the environment.

Reproduce (PostgreSQL):
  1. Bring up the prod stack (see docs/BENCHMARK.md), seed demo data.
  2. python scripts/pg_benchmark.py --base-url http://localhost:8080 \
         --reps 3 --warmup 30 --concurrency 20 --requests-per-rep 400 \
         --out benchmark-postgres.json
  3. Record the printed environment block alongside the numbers.

Requires the seeded demo accounts (admin/admin) unless overridden.
"""
import argparse
import json
import platform
import random
import statistics
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

sys.path.insert(0, ".")
from qa_harness import ApiSession  # noqa: E402


# Weighted, mostly-idempotent scenario mix. Writes are a small, clearly-labelled
# fraction so a benchmark run does not balloon the dataset.
def _scenarios(base_url):
    today = datetime.now().strftime("%Y-%m-%d")
    return [
        ("patient_search",   6, lambda s: s.get(f"{s.base}/api/patients?name=a")),
        ("calls_list",       5, lambda s: s.get(f"{s.base}/api/calls?trip_date={today}&page=1&per_page=50")),
        ("dispatch_board",   5, lambda s: s.get(f"{s.base}/api/dispatch/board?date={today}")),
        ("employee_list",    3, lambda s: s.get(f"{s.base}/api/employees")),
        ("notifications",    3, lambda s: s.get(f"{s.base}/api/notifications")),
        ("tasks_summary",    2, lambda s: s.get(f"{s.base}/api/tasks/summary")),
        ("health",           1, lambda s: s.get(f"{s.base}/api/health")),
    ]


def _weighted_pick(scenarios):
    bag = [sc for sc in scenarios for _ in range(sc[1])]
    return random.choice(bag)


def _one_request(session, scenario):
    name, _w, fn = scenario
    t0 = time.perf_counter()
    ok = False
    try:
        r = fn(session)
        ok = r.status_code < 400
    except Exception:
        ok = False
    return name, (time.perf_counter() - t0) * 1000.0, ok


def _pct(values, p):
    if not values:
        return 0.0
    values = sorted(values)
    k = max(0, min(len(values) - 1, int(round((p / 100.0) * (len(values) - 1)))))
    return round(values[k], 1)


def _summarize(latencies, errors, elapsed_s):
    n = len(latencies)
    return {
        "requests": n,
        "errors": errors,
        "success_rate": round(100.0 * (n - errors) / n, 2) if n else 0.0,
        "rps": round(n / elapsed_s, 1) if elapsed_s else 0.0,
        "avg_ms": round(statistics.mean(latencies), 1) if latencies else 0.0,
        "median_ms": round(statistics.median(latencies), 1) if latencies else 0.0,
        "p95_ms": _pct(latencies, 95),
        "p99_ms": _pct(latencies, 99),
        "max_ms": round(max(latencies), 1) if latencies else 0.0,
    }


def _run_batch(sessions, scenarios, total, concurrency):
    latencies, errors = [], 0
    start = time.perf_counter()
    with ThreadPoolExecutor(max_workers=concurrency) as pool:
        futures = [pool.submit(_one_request, sessions[i % len(sessions)], _weighted_pick(scenarios))
                   for i in range(total)]
        for f in as_completed(futures):
            _name, ms, ok = f.result()
            latencies.append(ms)
            if not ok:
                errors += 1
    return latencies, errors, time.perf_counter() - start


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--base-url", required=True)
    ap.add_argument("--user", default="admin")
    ap.add_argument("--password", default="admin")
    ap.add_argument("--reps", type=int, default=3)
    ap.add_argument("--warmup", type=int, default=30)
    ap.add_argument("--concurrency", type=int, default=20)
    ap.add_argument("--requests-per-rep", type=int, default=400)
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    base = args.base_url.rstrip("/")
    scenarios = _scenarios(base)
    # One authenticated session per concurrent worker (a Session is not thread-safe
    # to share for cookie writes, and each carries its own CSRF token).
    sessions = [ApiSession(base, args.user, args.password) for _ in range(args.concurrency)]

    env = {
        "timestamp": datetime.now().isoformat(timespec="seconds"),
        "base_url": base,
        "python": platform.python_version(),
        "platform": platform.platform(),
        "reps": args.reps, "warmup": args.warmup,
        "concurrency": args.concurrency, "requests_per_rep": args.requests_per_rep,
        "note": "DB engine / worker count / dataset are properties of the target — record them from the running stack.",
    }
    print("=== ENVIRONMENT ===")
    print(json.dumps(env, indent=2))

    print(f"\n=== WARM-UP ({args.warmup} requests) ===")
    _run_batch(sessions, scenarios, args.warmup, args.concurrency)

    reps = []
    for i in range(1, args.reps + 1):
        lat, err, elapsed = _run_batch(sessions, scenarios, args.requests_per_rep, args.concurrency)
        summ = _summarize(lat, err, elapsed)
        reps.append(summ)
        print(f"\n=== REP {i}/{args.reps} ===")
        print(json.dumps(summ, indent=2))

    # Aggregate across reps (median of each metric — robust to a single noisy rep).
    agg = {k: round(statistics.median([r[k] for r in reps]), 2)
           for k in ("rps", "avg_ms", "median_ms", "p95_ms", "p99_ms", "max_ms", "success_rate")}
    print("\n=== AGGREGATE (median across reps) ===")
    print(json.dumps(agg, indent=2))

    result = {"environment": env, "reps": reps, "aggregate": agg}
    if args.out:
        with open(args.out, "w") as f:
            json.dump(result, f, indent=2)
        print(f"\nWrote {args.out}")

    # Non-zero exit if any rep had errors, so CI/scripts can gate on it.
    sys.exit(1 if any(r["errors"] for r in reps) else 0)


if __name__ == "__main__":
    main()
