"""
EMS Workflow System - performance & stress runner.

Like qa_test.py, this runs against a **disposable** backend: by default it boots
its own throwaway backend on a temp SQLite database (deleted on exit), so seeding
hundreds of patients/calls/employees can never touch real dev/production data and
needs no cleanup. Every request is genuinely authenticated (session + CSRF); the
retired ``X-User-*`` headers are gone.

Usage:
    python stress_test.py                 # boots its own disposable backend
    EMS_QA_BASE=http://127.0.0.1:5099 \\   # or an external backend that reports
        python stress_test.py             #   qa_mode=true (else refused)

Exits non-zero if the concurrent load produced request errors.
"""

import os
import random
import statistics
import string
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta

from qa_harness import ApiSession, QaHarness

BASE = None
SESSION = None      # authenticated admin session
RESULTS = {}
CREATED = {"patients": [], "calls": [], "employees": []}
LOAD_ERRORS = 0


def rstr(n=6):
    return "".join(random.choices(string.ascii_uppercase, k=n))


def measure(name, fn, n=1):
    times, errors = [], 0
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
    RESULTS[name] = {"avg_ms": round(avg, 1), "p95_ms": round(p95, 1), "errors": errors, "n": n}
    status = "OK " if errors == 0 and avg < 500 else ("slow" if avg < 2000 else "SLOW")
    print(f"  [{status}] {name:52s} avg={avg:7.1f}ms  p95={p95:7.1f}ms  err={errors}/{n}")
    return RESULTS[name]


def section(title):
    print(f"\n{'='*66}\n  {title}\n{'='*66}")


# ── Seeding ───────────────────────────────────────────────────────────────────
def seed_patients(count=500):
    section(f"SEEDING: {count} patients")
    LAST = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez"]
    INS = ["Medicare", "Medicaid", "Blue Cross", "Aetna", "UnitedHealth"]
    SVC = ["BLS", "ALS", "Stretcher", "Wheelchair"]
    t0 = time.perf_counter()
    ok = 0
    for _ in range(count):
        r = SESSION.post(f"{BASE}/api/patients", json={
            "first_name": f"Test{rstr(4)}", "last_name": random.choice(LAST),
            "dob": f"{random.randint(1940,2000)}-{random.randint(1,12):02d}-{random.randint(1,28):02d}",
            "phone": f"555-{random.randint(1000,9999)}", "address": f"{random.randint(100,9999)} {rstr(8)} St",
            "city": "Springfield", "state": "IL", "zip_code": f"{random.randint(60000,62999)}",
            "insurance": random.choice(INS), "default_service_level": random.choice(SVC),
        })
        if r.status_code == 201:
            CREATED["patients"].append(r.json()["id"])
            ok += 1
    dt = time.perf_counter() - t0
    print(f"  Created {ok}/{count} patients in {dt:.1f}s ({ok/dt:.0f}/s)")
    return ok


def seed_employees(count=100):
    section(f"SEEDING: {count} employees")
    ROLES = ["EMT", "Paramedic", "Driver", "Dispatcher", "Supervisor"]
    t0 = time.perf_counter()
    ok = 0
    for i in range(count):
        r = SESSION.post(f"{BASE}/api/employees", json={
            "firstName": f"Emp{rstr(3)}", "lastName": f"Test{rstr(4)}", "phone": f"555-{random.randint(1000,9999)}",
            "email": f"emp{i}_{rstr(3)}@test.com", "employeeNumber": f"EMP{1000+i}",
            "hireDate": f"202{random.randint(0,4)}-{random.randint(1,12):02d}-01",
            "role": random.choice(ROLES), "status": "active", "isActive": True,
        })
        if r.status_code == 201:
            CREATED["employees"].append(r.json()["id"])
            ok += 1
    dt = time.perf_counter() - t0
    print(f"  Created {ok}/{count} employees in {dt:.1f}s ({ok/dt:.0f}/s)")
    return ok


def seed_calls(count=300):
    section(f"SEEDING: {count} calls")
    if not CREATED["patients"]:
        print("  No patients - skipping")
        return 0
    STATUSES = ["new", "new", "new", "assigned", "completed", "cancelled"]
    SVC = ["BLS", "ALS", "Stretcher"]
    t0 = time.perf_counter()
    ok = 0
    base = datetime.now()
    for _ in range(count):
        td = (base + timedelta(days=random.randint(-30, 7))).strftime("%Y-%m-%d")
        h, m = random.randint(7, 18), random.choice([0, 15, 30, 45])
        r = SESSION.post(f"{BASE}/api/calls", json={
            "patient_id": random.choice(CREATED["patients"]), "dispatcher_name": "StressTest",
            "date_of_call": td, "trip_date": td, "pickup_time": f"{h:02d}:{m:02d}",
            "appointment_time": f"{h+1:02d}:{m:02d}", "pickup_address": f"{random.randint(100,9999)} Main St",
            "dropoff_address": f"{random.randint(100,9999)} Hospital Dr", "service_level": random.choice(SVC),
            "call_type": "Appointment", "status": random.choice(STATUSES), "quality_score": random.randint(60, 100),
        })
        if r.status_code == 201:
            CREATED["calls"].append(r.json()["id"])
            ok += 1
    dt = time.perf_counter() - t0
    print(f"  Created {ok}/{count} calls in {dt:.1f}s ({ok/dt:.0f}/s)")
    return ok


# ── Benchmarks ────────────────────────────────────────────────────────────────
def run_read_benchmarks():
    section("READ BENCHMARKS")
    today = datetime.now().strftime("%Y-%m-%d")
    measure("GET /api/patients (default page)", lambda: SESSION.get(f"{BASE}/api/patients"), n=20)
    measure("GET /api/patients?per_page=100", lambda: SESSION.get(f"{BASE}/api/patients?per_page=100"), n=20)
    measure("GET /api/patients?name=Smith", lambda: SESSION.get(f"{BASE}/api/patients?name=Smith"), n=20)
    measure("GET /api/calls (default page)", lambda: SESSION.get(f"{BASE}/api/calls"), n=20)
    measure("GET /api/calls?per_page=100", lambda: SESSION.get(f"{BASE}/api/calls?per_page=100"), n=20)
    measure("GET /api/calls?status=new", lambda: SESSION.get(f"{BASE}/api/calls?status=new"), n=20)
    measure("GET /api/dispatch/board (today)", lambda: SESSION.get(f"{BASE}/api/dispatch/board?date={today}"), n=20)
    measure("GET /api/employees (all)", lambda: SESSION.get(f"{BASE}/api/employees"), n=20)
    measure("GET /api/notifications", lambda: SESSION.get(f"{BASE}/api/notifications"), n=20)
    measure("GET /api/audit", lambda: SESSION.get(f"{BASE}/api/audit"), n=20)


def run_write_benchmarks():
    section("WRITE BENCHMARKS")
    measure("POST /api/patients (create)", lambda: SESSION.post(f"{BASE}/api/patients", json={
        "first_name": "WriteBench", "last_name": rstr(6), "dob": "1980-01-01", "phone": "555-0001"}), n=30)
    if CREATED["patients"]:
        pid = CREATED["patients"][0]
        measure(f"PUT /api/patient/{pid} (update)", lambda: SESSION.put(f"{BASE}/api/patient/{pid}", json={
            "notes": f"bench {rstr(4)}"}), n=30)


def run_concurrent_load(workers=20, per_worker=10):
    global LOAD_ERRORS
    section(f"CONCURRENT LOAD: {workers} workers x {per_worker} = {workers*per_worker} requests")
    today = datetime.now().strftime("%Y-%m-%d")
    ENDPOINTS = [f"{BASE}/api/patients", f"{BASE}/api/patients?name=Smith", f"{BASE}/api/calls",
                 f"{BASE}/api/employees", f"{BASE}/api/dispatch/board?date={today}",
                 f"{BASE}/api/notifications", f"{BASE}/api/audit"]
    times, errors = [], 0
    t0 = time.perf_counter()

    def wf(_):
        s = ApiSession(BASE, "admin", "admin")
        out = []
        for _ in range(per_worker):
            u = random.choice(ENDPOINTS)
            tt = time.perf_counter()
            try:
                good = s.get(u, timeout=10).status_code < 500
            except Exception:
                good = False
            out.append(((time.perf_counter() - tt) * 1000, good))
        return out

    with ThreadPoolExecutor(max_workers=workers) as pool:
        for f in as_completed([pool.submit(wf, i) for i in range(workers)]):
            for t, good in f.result():
                times.append(t)
                errors += 0 if good else 1
    dt = time.perf_counter() - t0
    times.sort()
    p95 = times[int(len(times) * 0.95)]
    p99 = times[int(len(times) * 0.99)]
    LOAD_ERRORS += errors
    print(f"  {len(times)} req in {dt:.2f}s | {len(times)/dt:.1f} req/s | "
          f"avg={statistics.mean(times):.1f}ms P95={p95:.1f}ms P99={p99:.1f}ms | errors={errors}")
    RESULTS["concurrent_load"] = {"rps": round(len(times)/dt, 1), "p95_ms": round(p95, 1), "errors": errors}


# ── DB inspection (on the DISPOSABLE db only) ─────────────────────────────────
def run_index_analysis(db_path):
    section("DATABASE INDEX ANALYSIS (disposable QA db)")
    if not db_path or not os.path.exists(db_path):
        print("  No local disposable DB to inspect (external target) - skipped")
        return
    import sqlite3
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='index'")
    print(f"  Total indexes: {len(cur.fetchall())}")
    print("\n  Table row counts:")
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    for (t,) in cur.fetchall():
        try:
            cur.execute(f"SELECT COUNT(*) FROM [{t}]")
            print(f"    {t:35s} {cur.fetchone()[0]:>6} rows")
        except Exception:
            pass
    # patient.dob is encrypted at rest (Text, no plaintext index by design). Exact
    # search and duplicate detection go through the blind index patient.dob_bidx, and
    # the birthday calendar filters on the derived patient.dob_month_day — both indexed.
    # Do NOT expect an index on plaintext patient.dob; that would defeat the encryption.
    expected = [("call", "trip_date"), ("call", "status"), ("call", "patient_id"),
                ("patient", "last_name"), ("patient", "dob_bidx"), ("patient", "dob_month_day"),
                ("call_assignment", "unit_id"),
                ("daily_crew_unit", "shift_date"), ("user_notification", "user_id"),
                ("time_entry", "employee_id"), ("audit_log", "timestamp"),
                ("employee_document", "employee_id"), ("employee_document", "expiry_date")]
    print("\n  Critical index check:")
    missing = []
    for table, col in expected:
        cur.execute("PRAGMA index_list([%s])" % table)
        covered = False
        for row in cur.fetchall():
            cur.execute("PRAGMA index_info([%s])" % row[1])
            if col in [r[2] for r in cur.fetchall()]:
                covered = True
                break
        print(f"    {'OK ' if covered else 'MISSING'} {table}.{col}")
        if not covered:
            missing.append((table, col))
    conn.close()
    RESULTS["missing_indexes"] = missing
    return missing


def print_report():
    print("\n" + "=" * 66)
    print("  PERFORMANCE SUMMARY")
    print("=" * 66)
    slow = {k: v for k, v in RESULTS.items() if isinstance(v, dict) and v.get("avg_ms", 0) > 300 and "concurrent" not in k}
    if slow:
        for k, v in slow.items():
            print(f"  SLOW READ: {k} avg={v['avg_ms']}ms")
    else:
        print("  No slow reads (>300ms).")
    if RESULTS.get("missing_indexes"):
        for table, col in RESULTS["missing_indexes"]:
            print(f"  MISSING INDEX: {table}.{col}")
    if "concurrent_load" in RESULTS:
        cl = RESULTS["concurrent_load"]
        print(f"  Throughput: {cl['rps']} req/s | Concurrent P95: {cl['p95_ms']}ms | Errors: {cl['errors']}")


def main():
    global BASE, SESSION
    print("\nEMS Workflow System - stress runner")
    print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    harness = QaHarness()
    with harness as base:
        BASE = base
        print(f"QA backend (disposable): {BASE}")
        SESSION = ApiSession(BASE, "admin", "admin")

        # Seed then benchmark.
        seed_patients(500)
        seed_employees(100)
        seed_calls(300)
        run_read_benchmarks()
        run_write_benchmarks()
        run_concurrent_load(workers=20, per_worker=10)
        # Inspect the disposable DB (the harness exposes its temp path; never the
        # real dev DB the old version read by a hardcoded path).
        run_index_analysis(harness.db_path)

    print_report()
    print(f"\nFinished: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    sys.exit(1 if LOAD_ERRORS else 0)


if __name__ == "__main__":
    main()
