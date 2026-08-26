# Reproducible API Benchmark

This documents how to run a **comparable** load benchmark against the app's HTTP
API. It exists so performance numbers are reproducible and honest, and so a
SQLite smoke is never mistaken for a PostgreSQL capacity claim.

## Two tools, two purposes

| Tool | Backend | Purpose |
|---|---|---|
| `stress_test.py` | disposable **SQLite** (self-booted) | quick local smoke — seeds 500/100/300, read/write timings, an index sanity check. **Not** a production benchmark. |
| `scripts/pg_benchmark.py` | any **running** stack via `--base-url` (intended: the prod **PostgreSQL** Docker stack) | the reproducible benchmark below. |

## Comparability rules (read first)

- **Only compare runs from the same configuration.** DB engine, Gunicorn worker
  count, Redis presence, hardware, and dataset size all change the numbers. A
  SQLite result is not a PostgreSQL result.
- **A single run is not a scalability claim.** Report the environment block the
  script prints, and take the median across ≥ 3 reps after a warm-up.
- **Never benchmark against production data.** Use a fresh, seeded test stack.

## PostgreSQL benchmark — reproduction steps

1. **Bring up the production stack** (PostgreSQL + Redis + Gunicorn + Nginx + MinIO):

   ```bash
   SECRET_KEY=bench POSTGRES_PASSWORD=bench \
   EMS_MASTER_KEY=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8= \
   BASE_DOMAIN=ems.example.com SESSION_COOKIE_SECURE=0 \
   docker compose -f docker-compose.prod.yml up -d --build --wait
   ```

2. **Seed the fixed dataset** (demo accounts + a representative dataset):

   ```bash
   docker compose -f docker-compose.prod.yml exec -T backend flask --app app seed-demo
   # For a larger dataset (>= 500 patients / 100 employees / 300 calls), run the
   # stress_test seeders against the running stack, or extend seed-demo.
   ```

3. **Run the benchmark** (3 reps, warm-up, fixed concurrency):

   ```bash
   python scripts/pg_benchmark.py --base-url http://localhost:8080 \
     --reps 3 --warmup 30 --concurrency 20 --requests-per-rep 400 \
     --out benchmark-postgres.json
   ```

4. **Record the environment block** the script prints, plus the Gunicorn worker
   count and PostgreSQL/Redis versions from the running stack, next to the numbers.

## What it measures

A weighted, mostly-idempotent scenario mix (patient search, calls list, dispatch
board reads, employee list, notifications, tasks summary, health), run at a fixed
concurrency. Per rep and aggregated (median across reps) it reports: total
requests, errors, success rate, requests/sec, and avg / median / P95 / P99 / max
latency. Exit code is non-zero if any rep saw request errors.

## Investigating slow queries

If a scenario is slow, capture the actual query and its plan on PostgreSQL before
changing anything:

```sql
-- in the postgres container
EXPLAIN (ANALYZE, BUFFERS) <the slow query>;
```

Add an index only when it demonstrably speeds a real read, and check its write
cost and that it does not duplicate an existing index. Do not add indexes blind.

## Status in this repository

- **Script + method: ready** (`scripts/pg_benchmark.py`, this doc). Smoke-verified
  against a local SQLite backend (functional check only — those numbers are not a
  benchmark).
- **Actual PostgreSQL run: BLOCKED** in the current environment — Docker/PostgreSQL
  are not available locally. Run the steps above where a Docker host is available
  (the CI Docker job already boots the same prod stack).
