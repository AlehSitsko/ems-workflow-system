"""
EMS Workflow System — Performance & Stress Test Suite
Run from project root: python stress_test.py
Requires backend running at http://127.0.0.1:5050
"""

import requests
import time
import json
import random
import string
import statistics
import os
import sys
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed

BASE = "http://127.0.0.1:5050"
SESSION = requests.Session()
SESSION.headers.update({"Content-Type": "application/json", "X-User-Id": "1", "X-User-Name": "StressTest"})

RESULTS = {}
CREATED_IDS = {"patients": [], "calls": [], "employees": []}

# ── Utility ───────────────────────────────────────────────────────────────────

def rstr(n=6):
    return "".join(random.choices(string.ascii_uppercase, k=n))

def measure(name, fn, n=1):
    times = []
    errors = 0
    for _ in range(n):
        t0 = time.perf_counter()
        try:
            r = fn()
            if hasattr(r, "status_code") and r.status_code >= 500:
                errors += 1
        except Exception:
            errors += 1
        times.append((time.perf_counter() - t0) * 1000)
    avg = statistics.mean(times)
    p95 = sorted(times)[int(len(times) * 0.95)] if len(times) > 1 else times[0]
    mn, mx = min(times), max(times)
    RESULTS[name] = {"avg_ms": round(avg, 1), "p95_ms": round(p95, 1),
                     "min_ms": round(mn, 1), "max_ms": round(mx, 1),
                     "errors": errors, "n": n}
    status = "✅" if errors == 0 and avg < 500 else ("⚠️" if avg < 2000 else "❌")
    print(f"  {status} {name:50s} avg={avg:7.1f}ms  p95={p95:7.1f}ms  err={errors}/{n}")
    return RESULTS[name]

def section(title):
    print(f"\n{'='*65}")
    print(f"  {title}")
    print(f"{'='*65}")

# ── 1. Seed data ──────────────────────────────────────────────────────────────

def seed_patients(count=500):
    section(f"SEEDING: {count} patients")
    LAST_NAMES = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia",
                  "Miller", "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez",
                  "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson"]
    INSURANCE = ["Medicare", "Medicaid", "Blue Cross", "Aetna", "UnitedHealth", "Cigna", "Humana"]
    SERVICE = ["BLS", "ALS", "Stretcher", "Wheelchair"]

    t0 = time.perf_counter()
    ok = 0
    for i in range(count):
        ln = random.choice(LAST_NAMES)
        fn = f"Test{rstr(4)}"
        dob_year = random.randint(1940, 2000)
        dob = f"{dob_year}-{random.randint(1,12):02d}-{random.randint(1,28):02d}"
        r = SESSION.post(f"{BASE}/api/patients", json={
            "first_name": fn,
            "last_name": ln,
            "dob": dob,
            "phone": f"555-{random.randint(1000,9999)}",
            "address": f"{random.randint(100,9999)} {rstr(8)} St",
            "city": "Springfield",
            "state": "IL",
            "zip_code": f"{random.randint(60000,62999)}",
            "insurance": random.choice(INSURANCE),
            "default_service_level": random.choice(SERVICE),
        })
        if r.status_code == 201:
            CREATED_IDS["patients"].append(r.json()["id"])
            ok += 1
    elapsed = time.perf_counter() - t0
    rate = ok / elapsed
    print(f"  Created {ok}/{count} patients in {elapsed:.1f}s  ({rate:.0f}/s)")
    return ok


def seed_calls(count=300):
    section(f"SEEDING: {count} calls")
    if not CREATED_IDS["patients"]:
        print("  No patients — skipping")
        return 0
    STATUSES = ["new", "new", "new", "assigned", "completed", "cancelled"]
    SERVICE = ["BLS", "ALS", "Stretcher"]
    t0 = time.perf_counter()
    ok = 0
    base_date = datetime.now()
    for i in range(count):
        trip_date = (base_date + timedelta(days=random.randint(-30, 7))).strftime("%Y-%m-%d")
        pickup_h = random.randint(7, 18)
        pickup_m = random.choice([0, 15, 30, 45])
        r = SESSION.post(f"{BASE}/api/calls", json={
            "patient_id": random.choice(CREATED_IDS["patients"]),
            "dispatcher_name": "StressTest",
            "date_of_call": trip_date,
            "trip_date": trip_date,
            "pickup_time": f"{pickup_h:02d}:{pickup_m:02d}",
            "appointment_time": f"{pickup_h+1:02d}:{pickup_m:02d}",
            "pickup_address": f"{random.randint(100,9999)} Main St, Springfield IL",
            "dropoff_address": f"{random.randint(100,9999)} Hospital Dr, Springfield IL",
            "service_level": random.choice(SERVICE),
            "call_type": "Appointment",
            "caller_type": random.choice(["Facility", "Family", "Other"]),
            "caller_phone": f"555-{random.randint(1000,9999)}",
            "status": random.choice(STATUSES),
            "quality_score": random.randint(60, 100),
        })
        if r.status_code == 201:
            CREATED_IDS["calls"].append(r.json()["id"])
            ok += 1
    elapsed = time.perf_counter() - t0
    rate = ok / elapsed
    print(f"  Created {ok}/{count} calls in {elapsed:.1f}s  ({rate:.0f}/s)")
    return ok


def seed_employees(count=100):
    section(f"SEEDING: {count} employees")
    ROLES = ["EMT", "Paramedic", "Driver", "Dispatcher", "Supervisor"]
    t0 = time.perf_counter()
    ok = 0
    for i in range(count):
        r = SESSION.post(f"{BASE}/api/employees", json={
            "firstName": f"Emp{rstr(3)}",
            "lastName": f"Test{rstr(4)}",
            "phone": f"555-{random.randint(1000,9999)}",
            "email": f"emp{i}@test.com",
            "employeeNumber": f"EMP{1000+i}",
            "hireDate": f"202{random.randint(0,4)}-{random.randint(1,12):02d}-01",
            "role": random.choice(ROLES),
            "status": "active",
            "isActive": True,
        })
        if r.status_code == 201:
            CREATED_IDS["employees"].append(r.json()["id"])
            ok += 1
    elapsed = time.perf_counter() - t0
    rate = ok / elapsed
    print(f"  Created {ok}/{count} employees in {elapsed:.1f}s  ({rate:.0f}/s)")
    return ok


# ── 2. Read performance under load ────────────────────────────────────────────

def run_read_benchmarks():
    section("READ BENCHMARKS (single-threaded, N repetitions)")

    measure("GET /api/patients (default page, no filter)",
            lambda: SESSION.get(f"{BASE}/api/patients"), n=20)
    measure("GET /api/patients?per_page=100",
            lambda: SESSION.get(f"{BASE}/api/patients?per_page=100"), n=20)
    measure("GET /api/patients?name=Smith",
            lambda: SESSION.get(f"{BASE}/api/patients?name=Smith"), n=20)
    measure("GET /api/patients?name=Z (no results)",
            lambda: SESSION.get(f"{BASE}/api/patients?name=ZZZQQQXXX"), n=10)

    measure("GET /api/calls (default page)",
            lambda: SESSION.get(f"{BASE}/api/calls"), n=20)
    measure("GET /api/calls?per_page=100",
            lambda: SESSION.get(f"{BASE}/api/calls?per_page=100"), n=20)
    measure("GET /api/calls?status=new",
            lambda: SESSION.get(f"{BASE}/api/calls?status=new"), n=20)

    today = datetime.now().strftime("%Y-%m-%d")
    measure("GET /api/dispatch/board (today)",
            lambda: SESSION.get(f"{BASE}/api/dispatch/board?date={today}"), n=20)

    measure("GET /api/employees (all)",
            lambda: SESSION.get(f"{BASE}/api/employees"), n=20)

    measure("GET /api/notifications?user_id=1",
            lambda: SESSION.get(f"{BASE}/api/notifications?user_id=1"), n=20)

    measure("GET /api/audit",
            lambda: SESSION.get(f"{BASE}/api/audit"), n=20)

    if CREATED_IDS["patients"]:
        pid = CREATED_IDS["patients"][0]
        measure(f"GET /api/patient/{pid}",
                lambda: SESSION.get(f"{BASE}/api/patient/{pid}"), n=20)
        measure(f"GET /api/patient/{pid}/calls",
                lambda: SESSION.get(f"{BASE}/api/patient/{pid}/calls"), n=20)

    measure("GET /api/payroll/periods",
            lambda: SESSION.get(f"{BASE}/api/payroll/periods"), n=10)

    measure("GET /api/documents/compliance",
            lambda: SESSION.get(f"{BASE}/api/documents/compliance"), n=10)


# ── 3. Concurrent load test ───────────────────────────────────────────────────

def run_concurrent_load(workers=20, requests_per_worker=10):
    section(f"CONCURRENT LOAD: {workers} workers × {requests_per_worker} requests = {workers*requests_per_worker} total")

    ENDPOINTS = [
        f"{BASE}/api/patients",
        f"{BASE}/api/patients?name=Smith",
        f"{BASE}/api/calls",
        f"{BASE}/api/employees",
        f"{BASE}/api/dispatch/board?date={datetime.now().strftime('%Y-%m-%d')}",
        f"{BASE}/api/notifications?user_id=1",
        f"{BASE}/api/audit",
    ]

    times = []
    errors = 0
    t0_global = time.perf_counter()

    def worker_fn(_):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json", "X-User-Id": "1"})
        results = []
        for _ in range(requests_per_worker):
            url = random.choice(ENDPOINTS)
            t0 = time.perf_counter()
            try:
                r = s.get(url, timeout=10)
                ok = r.status_code < 500
            except Exception:
                ok = False
            elapsed = (time.perf_counter() - t0) * 1000
            results.append((elapsed, ok))
        return results

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(worker_fn, i) for i in range(workers)]
        for f in as_completed(futures):
            for t, ok in f.result():
                times.append(t)
                if not ok:
                    errors += 1

    total_elapsed = time.perf_counter() - t0_global
    total_req = len(times)
    avg = statistics.mean(times)
    p50 = sorted(times)[int(len(times) * 0.50)]
    p95 = sorted(times)[int(len(times) * 0.95)]
    p99 = sorted(times)[int(len(times) * 0.99)]
    rps = total_req / total_elapsed

    print(f"  Total requests:  {total_req}")
    print(f"  Total time:      {total_elapsed:.2f}s")
    print(f"  Throughput:      {rps:.1f} req/s")
    print(f"  Avg latency:     {avg:.1f}ms")
    print(f"  P50:             {p50:.1f}ms")
    print(f"  P95:             {p95:.1f}ms")
    print(f"  P99:             {p99:.1f}ms")
    print(f"  Errors:          {errors}/{total_req}")

    status = "✅" if errors == 0 and p95 < 1000 else ("⚠️" if p95 < 3000 else "❌")
    print(f"  Result:          {status}")

    RESULTS["concurrent_load"] = {
        "workers": workers, "total_req": total_req, "elapsed_s": round(total_elapsed, 2),
        "rps": round(rps, 1), "avg_ms": round(avg, 1), "p50_ms": round(p50, 1),
        "p95_ms": round(p95, 1), "p99_ms": round(p99, 1), "errors": errors
    }


# ── 4. Dispatch board under load ──────────────────────────────────────────────

def run_dispatch_board_load(workers=10, each=15):
    section(f"DISPATCH BOARD: {workers} concurrent dispatchers × {each} polls")

    today = datetime.now().strftime("%Y-%m-%d")
    times = []
    errors = 0
    t0 = time.perf_counter()

    def dispatcher_session(_):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json", "X-User-Id": "1"})
        res = []
        for _ in range(each):
            t = time.perf_counter()
            try:
                r = s.get(f"{BASE}/api/dispatch/board?date={today}", timeout=10)
                ok = r.status_code == 200
            except Exception:
                ok = False
            res.append(((time.perf_counter() - t) * 1000, ok))
            time.sleep(0.05)  # simulate 50ms between polls
        return res

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(dispatcher_session, i) for i in range(workers)]
        for f in as_completed(futures):
            for t, ok in f.result():
                times.append(t)
                if not ok:
                    errors += 1

    elapsed = time.perf_counter() - t0
    avg = statistics.mean(times)
    p95 = sorted(times)[int(len(times) * 0.95)]
    print(f"  {workers} concurrent dispatchers polling board for {each} iterations each")
    print(f"  Total polls: {len(times)} in {elapsed:.1f}s")
    print(f"  Avg: {avg:.1f}ms  P95: {p95:.1f}ms  Errors: {errors}")
    status = "✅" if errors == 0 and p95 < 1500 else ("⚠️" if p95 < 4000 else "❌")
    print(f"  Result: {status}")
    RESULTS["dispatch_board_concurrent"] = {"avg_ms": round(avg,1), "p95_ms": round(p95,1), "errors": errors}


# ── 5. Write/mutation throughput ──────────────────────────────────────────────

def run_write_benchmarks():
    section("WRITE BENCHMARKS")

    measure("POST /api/patients (create)",
            lambda: SESSION.post(f"{BASE}/api/patients", json={
                "first_name": "WriteBench",
                "last_name": rstr(6),
                "dob": "1980-01-01",
                "phone": "555-0001",
                "address": "123 Write St",
            }), n=30)

    measure("POST /api/calls (create)",
            lambda: SESSION.post(f"{BASE}/api/calls", json={
                "patient_id": CREATED_IDS["patients"][0] if CREATED_IDS["patients"] else None,
                "dispatcher_name": "bench",
                "date_of_call": datetime.now().strftime("%Y-%m-%d"),
                "trip_date": datetime.now().strftime("%Y-%m-%d"),
                "pickup_time": "09:00",
                "pickup_address": "123 Main St",
                "dropoff_address": "456 Hospital Ave",
                "service_level": "BLS",
                "call_type": "Appointment",
            }), n=30)

    if CREATED_IDS["patients"]:
        pid = CREATED_IDS["patients"][0]
        measure(f"PUT /api/patient/{pid} (update)",
                lambda: SESSION.put(f"{BASE}/api/patient/{pid}", json={
                    "notes": f"bench update {rstr(4)}"
                }), n=30)


# ── 6. Pagination & large dataset scan ────────────────────────────────────────

def run_pagination_benchmarks():
    section("PAGINATION & LARGE DATASET SCAN")

    for page in [1, 5, 10, 20]:
        measure(f"GET /api/patients?page={page}&per_page=25",
                lambda p=page: SESSION.get(f"{BASE}/api/patients?page={p}&per_page=25"), n=5)

    measure("GET /api/patients?per_page=100 (max page)",
            lambda: SESSION.get(f"{BASE}/api/patients?per_page=100"), n=10)

    # Check response size
    r = SESSION.get(f"{BASE}/api/patients?per_page=100")
    body_size = len(r.content)
    total = r.json().get("total", 0)
    print(f"\n  Patients total in DB: {total}")
    print(f"  Response size (100 items): {body_size/1024:.1f} KB")

    r2 = SESSION.get(f"{BASE}/api/calls?per_page=100")
    calls_total = r2.json().get("total", 0) if r2.status_code == 200 else "?"
    print(f"  Calls total in DB: {calls_total}")


# ── 7. N+1 analysis (measure query counts via timing) ────────────────────────

def run_n1_analysis():
    section("N+1 QUERY DETECTION (via timing scaling)")

    # If N+1 exists, time to load dispatch board scales linearly with # units
    # We measure board with 0 units vs current (timing per-unit comparison)
    today = datetime.now().strftime("%Y-%m-%d")
    yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")

    t_today = []
    for _ in range(5):
        t0 = time.perf_counter()
        SESSION.get(f"{BASE}/api/dispatch/board?date={today}")
        t_today.append((time.perf_counter() - t0) * 1000)

    t_empty = []
    for _ in range(5):
        t0 = time.perf_counter()
        SESSION.get(f"{BASE}/api/dispatch/board?date={yesterday}")
        t_empty.append((time.perf_counter() - t0) * 1000)

    avg_today = statistics.mean(t_today)
    avg_empty = statistics.mean(t_empty)

    r = SESSION.get(f"{BASE}/api/dispatch/board?date={today}")
    units_count = len(r.json().get("units", [])) if r.status_code == 200 else 0
    calls_count = sum(len(u.get("assignedCalls", [])) for u in r.json().get("units", [])) if r.status_code == 200 else 0

    print(f"  Empty date (no units): avg {avg_empty:.1f}ms")
    print(f"  Today ({units_count} units, {calls_count} assigned calls): avg {avg_today:.1f}ms")

    if units_count > 0:
        overhead_per_unit = (avg_today - avg_empty) / units_count
        print(f"  Overhead per unit: {overhead_per_unit:.1f}ms")
        if overhead_per_unit > 50:
            print(f"  ⚠️  Possible N+1: {overhead_per_unit:.1f}ms per unit (>50ms indicates per-unit queries)")
        else:
            print(f"  ✅ No N+1 detected (overhead ≤50ms per unit)")

    # Check Call.to_dict() N+1: _patient_name() hits db per call
    t_calls = []
    for _ in range(5):
        t0 = time.perf_counter()
        SESSION.get(f"{BASE}/api/calls?per_page=50")
        t_calls.append((time.perf_counter() - t0) * 1000)
    avg_calls = statistics.mean(t_calls)
    print(f"\n  GET /api/calls?per_page=50: avg {avg_calls:.1f}ms")
    if avg_calls > 500:
        print(f"  ⚠️  Calls list slow — likely N+1 via _patient_name() (1 extra query per call)")
    else:
        print(f"  ✅ Calls list acceptable (<500ms)")


# ── 8. Stress: notification polling ──────────────────────────────────────────

def run_notification_stress(workers=15, seconds=10):
    section(f"NOTIFICATION POLLING: {workers} users polling for {seconds}s")

    stop_at = time.perf_counter() + seconds
    times = []
    errors = 0
    count = 0

    def poller(uid):
        nonlocal errors, count
        s = requests.Session()
        local_times = []
        local_errors = 0
        local_count = 0
        while time.perf_counter() < stop_at:
            t0 = time.perf_counter()
            try:
                r = s.get(f"{BASE}/api/notifications?user_id={uid}", timeout=5)
                ok = r.status_code == 200
            except Exception:
                ok = False
            elapsed = (time.perf_counter() - t0) * 1000
            local_times.append(elapsed)
            if not ok:
                local_errors += 1
            local_count += 1
            time.sleep(10)  # simulate 10s polling interval
        return local_times, local_errors, local_count

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(poller, (i % 3) + 1) for i in range(workers)]
        for f in as_completed(futures):
            lt, le, lc = f.result()
            times.extend(lt)
            errors += le
            count += lc

    if times:
        avg = statistics.mean(times)
        p95 = sorted(times)[int(len(times) * 0.95)] if len(times) > 1 else times[0]
        print(f"  Total polls: {len(times)} over {seconds}s")
        print(f"  Avg: {avg:.1f}ms  P95: {p95:.1f}ms  Errors: {errors}")
        status = "✅" if errors == 0 and avg < 200 else "⚠️"
        print(f"  Result: {status}")
        RESULTS["notification_polling"] = {"avg_ms": round(avg,1), "p95_ms": round(p95,1), "errors": errors}


# ── 9. Index analysis (schema inspection) ────────────────────────────────────

def run_index_analysis():
    section("DATABASE INDEX ANALYSIS (via SQLite schema)")

    db_path = os.path.join(os.path.dirname(__file__), "backend", "instance", "database.db")
    if not os.path.exists(db_path):
        print(f"  DB not found at {db_path}")
        return

    import sqlite3
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    cur.execute("SELECT name FROM sqlite_master WHERE type='index' ORDER BY name")
    all_indexes = [r[0] for r in cur.fetchall()]
    print(f"\n  Total indexes: {len(all_indexes)}")
    for idx in sorted(all_indexes):
        print(f"    {idx}")

    # Table row counts
    print("\n  Table row counts:")
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    tables = [r[0] for r in cur.fetchall()]
    for t in tables:
        try:
            cur.execute(f"SELECT COUNT(*) FROM [{t}]")
            cnt = cur.fetchone()[0]
            print(f"    {t:35s} {cnt:>6} rows")
        except Exception:
            pass

    # Check for missing critical indexes
    critical_missing = []
    expected = [
        ("call", "trip_date"),
        ("call", "status"),
        ("call", "patient_id"),
        ("patient", "last_name"),
        ("patient", "dob"),
        ("call_assignment", "unit_id"),
        ("call_assignment", "call_id"),
        ("call_assignment", "is_active"),
        ("daily_crew_unit", "shift_date"),
        ("notification_event", "created_at"),
        ("user_notification", "user_id"),
        ("user_notification", "is_read"),
        ("time_entry", "employee_id"),
        ("audit_log", "entity_type"),
        ("audit_log", "timestamp"),
        ("employee_document", "employee_id"),
        ("employee_document", "expiry_date"),
    ]

    print("\n  Critical index check:")
    for table, col in expected:
        # Check if any index covers this column
        cur.execute(f"SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='{table}' AND sql LIKE '%{col}%'")
        found = cur.fetchone()
        if not found:
            # Also check unique constraints that act as indexes
            cur.execute(f"PRAGMA index_list({table})")
            idxs = cur.fetchall()
            covered = False
            for idx_row in idxs:
                cur.execute(f"PRAGMA index_info({idx_row[1]})")
                cols = [r[2] for r in cur.fetchall()]
                if col in cols:
                    covered = True
                    break
            if not covered:
                critical_missing.append((table, col))
                print(f"    ❌ MISSING: {table}.{col}")
            else:
                print(f"    ✅ {table}.{col}")
        else:
            print(f"    ✅ {table}.{col} ({found[0]})")

    conn.close()
    RESULTS["missing_indexes"] = critical_missing
    return critical_missing


# ── 10. DB file size & fragmentation ─────────────────────────────────────────

def run_db_stats():
    section("DATABASE FILE STATS")

    db_path = os.path.join(os.path.dirname(__file__), "backend", "instance", "database.db")
    if not os.path.exists(db_path):
        print(f"  Not found: {db_path}")
        return

    size_mb = os.path.getsize(db_path) / 1024 / 1024
    print(f"  DB file size: {size_mb:.2f} MB")

    import sqlite3
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute("PRAGMA page_count")
    pages = cur.fetchone()[0]
    cur.execute("PRAGMA freelist_count")
    free = cur.fetchone()[0]
    cur.execute("PRAGMA page_size")
    page_size = cur.fetchone()[0]
    fragmentation = (free / pages * 100) if pages else 0
    print(f"  Pages: {pages}  Free pages: {free}  Page size: {page_size}B")
    print(f"  Fragmentation: {fragmentation:.1f}%")
    if fragmentation > 20:
        print(f"  ⚠️  High fragmentation — consider VACUUM")
    else:
        print(f"  ✅ Fragmentation OK")
    conn.close()


# ── Final report ──────────────────────────────────────────────────────────────

def print_report():
    print("\n")
    print("=" * 70)
    print("  PERFORMANCE REPORT SUMMARY")
    print("=" * 70)

    findings = []
    recommendations = []

    # Check read endpoints
    slow_reads = {k: v for k, v in RESULTS.items()
                  if isinstance(v, dict) and "avg_ms" in v and v["avg_ms"] > 300 and "concurrent" not in k}
    if slow_reads:
        for k, v in slow_reads.items():
            findings.append(f"SLOW READ: {k} avg={v['avg_ms']}ms")

    if "concurrent_load" in RESULTS:
        cl = RESULTS["concurrent_load"]
        if cl["p95_ms"] > 1000:
            findings.append(f"HIGH CONCURRENCY LATENCY: P95={cl['p95_ms']}ms under {cl['workers']} workers")
        if cl["errors"] > 0:
            findings.append(f"CONCURRENT ERRORS: {cl['errors']}/{cl['total_req']} requests failed")

    if "missing_indexes" in RESULTS and RESULTS["missing_indexes"]:
        for table, col in RESULTS["missing_indexes"]:
            findings.append(f"MISSING INDEX: {table}.{col}")
            recommendations.append(f"db.Index('ix_{table}_{col}', {table.title().replace('_','')}.{col})")

    print(f"\n  FINDINGS ({len(findings)} issues):")
    if findings:
        for f in findings:
            print(f"    ❌  {f}")
    else:
        print("    ✅  No critical issues found")

    print(f"\n  INDEX RECOMMENDATIONS:")
    if "missing_indexes" in RESULTS and RESULTS["missing_indexes"]:
        print("  Add to models.py (inside each model class or at module level):\n")
        idx_lines = []
        for table, col in RESULTS["missing_indexes"]:
            model = "".join(w.title() for w in table.split("_"))
            idx_lines.append(f"    db.Index('ix_{table}_{col}', {model}.{col})")
        for line in idx_lines:
            print(line)
    else:
        print("    ✅  All critical indexes present")

    print(f"\n  KEY METRICS:")
    if "concurrent_load" in RESULTS:
        cl = RESULTS["concurrent_load"]
        print(f"    Throughput:           {cl['rps']} req/s")
        print(f"    Concurrent P95:       {cl['p95_ms']}ms ({cl['workers']} workers)")
        print(f"    Error rate:           {cl['errors']}/{cl['total_req']}")
    if "dispatch_board_concurrent" in RESULTS:
        db_ = RESULTS["dispatch_board_concurrent"]
        print(f"    Dispatch board P95:   {db_['p95_ms']}ms (concurrent)")

    print("\n" + "=" * 70)


# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print(f"\nEMS Workflow System — Stress Test Suite")
    print(f"Target: {BASE}")
    print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    # Verify backend is up
    try:
        r = requests.get(f"{BASE}/api/auth/users", timeout=3)
        print(f"Backend: ✅ responding (HTTP {r.status_code})")
    except Exception as e:
        print(f"Backend: ❌ not reachable — {e}")
        sys.exit(1)

    # Phase 1: index analysis (before seed, to get baseline)
    run_index_analysis()
    run_db_stats()

    # Phase 2: seed data
    p_count = seed_patients(500)
    e_count = seed_employees(100)
    c_count = seed_calls(300)

    # Phase 3: benchmarks
    run_read_benchmarks()
    run_pagination_benchmarks()
    run_write_benchmarks()
    run_n1_analysis()

    # Phase 4: concurrent load
    run_concurrent_load(workers=20, requests_per_worker=10)
    run_dispatch_board_load(workers=10, each=15)
    run_notification_stress(workers=15, seconds=12)

    # Phase 5: post-seed db stats
    run_db_stats()

    # Report
    print_report()

    print(f"\nFinished: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
