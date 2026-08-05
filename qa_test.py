"""
EMS Workflow System - live functional QA runner.

Runs as a real signed-in tester against a **disposable** backend: by default it
boots its own throwaway backend on a temp SQLite database (torn down on exit), so
it can never seed into or delete real dev/production data. Every request is made
through a genuinely authenticated session (session cookie + CSRF header), one per
role, exercising the real auth path rather than the retired ``X-User-*`` headers.

Usage:
    python qa_test.py                     # boots its own disposable backend
    EMS_QA_BASE=http://127.0.0.1:5099 \\   # or target an external backend that
        python qa_test.py                 #   reports qa_mode=true (else refused)

Exit code is non-zero if any check fails, so CI can gate on it.
"""

import statistics
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta

from qa_harness import ApiSession, QaHarness, role_sessions

TODAY = datetime.now().strftime("%Y-%m-%d")
TOMORROW = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
YESTERDAY = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")

# Populated in main() once the harness is up.
BASE = None
S = None          # admin session
SUP = DISP = HR = None
SESSIONS = {}

PASS = 0
FAIL = 0
WARNS = []


def ok(label):
    global PASS
    PASS += 1
    print(f"  [PASS]  {label}")


def fail(label, detail=""):
    global FAIL
    FAIL += 1
    print(f"  [FAIL]  {label}" + (f"  ->  {detail}" if detail else ""))


def warn(label, detail=""):
    WARNS.append(label)
    print(f"  [warn]  {label}" + (f"  ->  {detail}" if detail else ""))


def section(title):
    print(f"\n{'-'*66}\n  {title}\n{'-'*66}")


def rstr(n=5):
    import random
    import string
    return "".join(random.choices(string.ascii_uppercase, k=n))


created = {"vehicles": [], "crew_units": [], "patients": [], "calls": [], "tasks": [], "employees": []}


# ─── VEHICLES ────────────────────────────────────────────────────────────────
def test_vehicles():
    section("VEHICLES - CRUD + edge cases")

    r = S.post(f"{BASE}/api/vehicles", json={"unitName": "TestAmbu", "unitNumber": f"T{rstr(3)}", "unitType": "ALS"})
    if r.status_code == 201:
        vid = r.json()["id"]
        created["vehicles"].append(vid)
        ok("POST /api/vehicles - happy path -> 201")
    else:
        fail("POST /api/vehicles - happy path", f"{r.status_code}: {r.text[:100]}")
        vid = None

    r = S.post(f"{BASE}/api/vehicles", json={"unitName": "NoNumber"})
    (ok if r.status_code == 400 else fail)("POST /api/vehicles - missing unitNumber -> 400" + ("" if r.status_code == 400 else f" (got {r.status_code})"))

    r = S.post(f"{BASE}/api/vehicles", json={"unitName": "NoType", "unitNumber": "999X"})
    (ok if r.status_code == 400 else fail)("POST /api/vehicles - missing unitType -> 400" + ("" if r.status_code == 400 else f" (got {r.status_code})"))

    if vid:
        dup_num = next((v["unitNumber"] for v in S.get(f"{BASE}/api/vehicles").json() if v["id"] == vid), None)
        r = S.post(f"{BASE}/api/vehicles", json={"unitName": "Dupe", "unitNumber": dup_num, "unitType": "BLS"})
        (ok if r.status_code == 409 else fail)("POST /api/vehicles - duplicate unitNumber -> 409" + ("" if r.status_code == 409 else f" (got {r.status_code})"))

        all_v = S.get(f"{BASE}/api/vehicles").json()
        orig = next((v["isActive"] for v in all_v if v["id"] == vid), True)
        r = S.patch(f"{BASE}/api/vehicles/{vid}/toggle-active")
        (ok if r.status_code == 200 and r.json()["isActive"] != orig else fail)("PATCH /api/vehicles/:id/toggle-active - flips isActive")

    r = S.patch(f"{BASE}/api/vehicles/99999/toggle-active")
    (ok if r.status_code == 404 else fail)("PATCH /api/vehicles/99999/toggle-active -> 404" + ("" if r.status_code == 404 else f" (got {r.status_code})"))

    if vid:
        r = S.put(f"{BASE}/api/vehicles/{vid}", json={"unitName": "Updated", "unitNumber": f"U{rstr(3)}", "unitType": "BLS"})
        (ok if r.status_code == 200 and r.json()["unitType"] == "BLS" else fail)("PUT /api/vehicles/:id - update unitType")
        r = S.delete(f"{BASE}/api/vehicles/{vid}")
        if r.status_code == 200:
            ok("DELETE /api/vehicles/:id -> 200")
            created["vehicles"].remove(vid)
        else:
            fail("DELETE /api/vehicles/:id", f"got {r.status_code}")

    r = S.delete(f"{BASE}/api/vehicles/99999")
    (ok if r.status_code == 404 else fail)("DELETE /api/vehicles/99999 -> 404" + ("" if r.status_code == 404 else f" (got {r.status_code})"))

    # Authorization: a dispatcher may not create vehicles (fleet is admin/supervisor).
    r = DISP.post(f"{BASE}/api/vehicles", json={"unitName": "x", "unitNumber": f"Z{rstr(3)}", "unitType": "BLS"})
    (ok if r.status_code == 403 else fail)("POST /api/vehicles (dispatcher) -> 403" + ("" if r.status_code == 403 else f" (got {r.status_code})"))

    # No auth at all -> 401 (fail-closed).
    import requests as _rq
    r = _rq.get(f"{BASE}/api/vehicles")
    (ok if r.status_code == 401 else fail)("GET /api/vehicles (no session) -> 401" + ("" if r.status_code == 401 else f" (got {r.status_code})"))


# ─── CREW UNITS ──────────────────────────────────────────────────────────────
def test_crew_units():
    section("CREW UNITS - shift timing + edge cases")

    base_payload = {
        "shiftDate": TODAY, "truckNumber": f"QA{rstr(3)}", "startTime": "08:00",
        "patientOrder": [{"name": "on call", "time": "", "callId": None}],
    }

    r = S.post(f"{BASE}/api/crew-units", json=base_payload)
    if r.status_code == 201:
        uid = r.json()["id"]
        created["crew_units"].append(uid)
        (ok if r.json()["plannedEndTime"] is None else fail)("POST /crew-units - no duration -> plannedEndTime=null")
    else:
        fail("POST /crew-units - basic create", f"{r.status_code}: {r.text[:100]}")
        uid = None

    p = {**base_payload, "truckNumber": f"QA{rstr(3)}", "shiftDurationHours": "custom"}
    r = S.post(f"{BASE}/api/crew-units", json=p)
    if r.status_code == 201 and r.json().get("shiftDurationHours") is None:
        ok("POST /crew-units - shiftDurationHours='custom' -> null, no 500")
        created["crew_units"].append(r.json()["id"])
    else:
        fail("POST /crew-units - 'custom' duration", f"{r.status_code}: {r.text[:120]}")

    p = {**base_payload, "truckNumber": f"QA{rstr(3)}", "shiftDurationHours": 8}
    r = S.post(f"{BASE}/api/crew-units", json=p)
    if r.status_code == 201:
        created["crew_units"].append(r.json()["id"])
        (ok if r.json().get("plannedEndTime") == "16:00" else fail)("POST /crew-units - 08:00 + 8h -> 16:00")
    else:
        fail("POST /crew-units - valid duration", r.text[:100])

    # Midnight crossover: 22:00 + 10h = 08:00 next day, and NOT flagged overdue today.
    p = {**base_payload, "truckNumber": f"QA{rstr(3)}", "startTime": "22:00", "shiftDurationHours": 10}
    r = S.post(f"{BASE}/api/crew-units", json=p)
    if r.status_code == 201:
        d = r.json()
        created["crew_units"].append(d["id"])
        (ok if d.get("plannedEndTime") == "08:00" else fail)("POST /crew-units - 22:00+10h -> 08:00 (crossover)")
        alerts = S.get(f"{BASE}/api/crew-units/alerts?date={TODAY}").json()
        (ok if d["id"] not in [a["unitId"] for a in alerts] else fail)("GET /alerts - crossover unit NOT flagged overdue")
    else:
        fail("POST /crew-units - midnight crossover", r.text[:100])

    r = S.post(f"{BASE}/api/crew-units", json={"startTime": "08:00", "patientOrder": []})
    (ok if r.status_code == 400 else fail)("POST /crew-units - missing shiftDate -> 400" + ("" if r.status_code == 400 else f" (got {r.status_code})"))

    if uid:
        r = S.put(f"{BASE}/api/crew-units/{uid}", json={"unitType": "ALS", "patientOrder": []})
        (ok if r.status_code == 400 else fail)("PUT /crew-units/:id - missing shiftDate -> 400" + ("" if r.status_code == 400 else f" (got {r.status_code})"))


# ─── SHIFT ALERTS ────────────────────────────────────────────────────────────
def test_shift_alerts():
    section("SHIFT ALERTS - alert logic")

    r = S.get(f"{BASE}/api/crew-units/alerts?date={YESTERDAY}")
    (ok if r.status_code == 200 else fail)(f"GET /alerts?date={YESTERDAY} -> 200 (no crash on past date)")

    r = S.get(f"{BASE}/api/crew-units/alerts?date=not-a-date")
    (ok if r.status_code == 200 and r.json() == [] else fail)("GET /alerts?date=not-a-date -> [] (graceful)")

    early = (datetime.now() - timedelta(hours=10)).strftime("%H:%M")
    p = {"shiftDate": TODAY, "truckNumber": f"AL{rstr(3)}", "startTime": early,
         "shiftDurationHours": 4, "shiftStatus": "completed",
         "patientOrder": [{"name": "on call", "time": "", "callId": None}]}
    r = S.post(f"{BASE}/api/crew-units", json=p)
    if r.status_code == 201:
        uid_done = r.json()["id"]
        created["crew_units"].append(uid_done)
        alerts = S.get(f"{BASE}/api/crew-units/alerts?date={TODAY}").json()
        (ok if not any(a["unitId"] == uid_done for a in alerts) else fail)("GET /alerts - completed unit suppressed")


# ─── DISPATCH BOARD ──────────────────────────────────────────────────────────
def test_dispatch_board():
    section("DISPATCH BOARD - data + concurrency")

    r = S.get(f"{BASE}/api/dispatch/board?date={TODAY}")
    if r.status_code == 200:
        ok(f"GET /dispatch/board?date={TODAY} -> 200")
        units = r.json().get("units", [])
        for u in units[:3]:
            missing = [f for f in ("shiftDurationHours", "shiftStatus", "plannedEndTime", "delayMinutes") if f not in u]
            (ok if not missing else fail)(f"Unit {u.get('truckNumber')} has all shift fields" + (f" - missing {missing}" if missing else ""))
    else:
        fail("GET /dispatch/board", f"{r.status_code}: {r.text[:80]}")

    # 50 concurrent authenticated reads.
    worker = ApiSession(BASE, "admin", "admin")
    times, errors = [], 0

    def hit(_):
        t0 = time.perf_counter()
        try:
            rr = worker.get(f"{BASE}/api/crew-units/alerts?date={TODAY}", timeout=5)
            return (time.perf_counter() - t0) * 1000, rr.status_code == 200
        except Exception:
            return 999, False

    with ThreadPoolExecutor(max_workers=10) as pool:
        for f in as_completed([pool.submit(hit, i) for i in range(50)]):
            t, good = f.result()
            times.append(t)
            errors += 0 if good else 1
    if errors == 0:
        ok(f"GET /alerts - 50 concurrent: avg={statistics.mean(times):.1f}ms err=0")
    else:
        fail(f"GET /alerts - concurrent: {errors}/50 errors")


# ─── NOTIFICATIONS (session-scoped) ──────────────────────────────────────────
def test_notifications():
    section("NOTIFICATIONS - session-scoped bell system")

    # Identity comes from the session now; no client user_id is trusted.
    r = S.get(f"{BASE}/api/notifications")
    (ok if r.status_code == 200 and "notifications" in r.json() else fail)("GET /notifications -> 200 (own, from session)")

    r = S.get(f"{BASE}/api/notifications/prefs")
    if r.status_code == 200 and isinstance(r.json(), dict) and r.json():
        ok(f"GET /notifications/prefs -> 200 ({len(r.json())} types)")
        bad = [t for t, v in r.json().items() if not isinstance(v, dict) or "enabled" not in v or not v.get("label")]
        (ok if not bad else fail)("GET /notifications/prefs - every type has enabled + label" + (f" - bad {bad}" if bad else ""))
    else:
        fail("GET /notifications/prefs", f"{r.status_code}: {r.text[:120]}")

    # Structure holds for every role, each from its own session.
    results = {}
    for role, sess in SESSIONS.items():
        rr = sess.get(f"{BASE}/api/notifications/prefs")
        results[role] = (rr.status_code == 200 and isinstance(rr.json(), dict)
                         and all(isinstance(v, dict) and isinstance(v.get("enabled"), bool) and v.get("label")
                                 for v in rr.json().values()))
    bad_roles = [r for r, good in results.items() if not good]
    (ok if not bad_roles else fail)("GET /notifications/prefs - valid across roles: " + ", ".join(sorted(SESSIONS)) + (f" - failed {bad_roles}" if bad_roles else ""))

    r = S.post(f"{BASE}/api/notifications/999999/read", json={})
    (ok if r.status_code in (404, 400) else warn)("POST /notifications/999999/read -> 404 (not 500)" + ("" if r.status_code in (404, 400) else f" (got {r.status_code})"))


# ─── DATA INTEGRITY ──────────────────────────────────────────────────────────
def test_data_integrity():
    section("DATA INTEGRITY - no partial writes")

    r = S.post(f"{BASE}/api/patients", json={"first_name": f"QART{rstr(4)}", "last_name": "Roundtrip", "dob": "1985-05-05"})
    if r.status_code == 201:
        pid = r.json()["id"]
        created["patients"].append(pid)
        rc = S.post(f"{BASE}/api/calls", json={
            "patient_id": pid, "dispatcher_name": "QATester", "date_of_call": TODAY, "trip_date": TODAY,
            "pickup_time": "10:00", "pickup_address": "100 QA St", "dropoff_address": "200 Hospital Dr",
            "service_level": "BLS", "call_type": "Appointment"})
        if rc.status_code == 201:
            cid = rc.json()["id"]
            created["calls"].append(cid)
            ok(f"POST /api/calls -> 201 (call #{cid})")
            ru = S.put(f"{BASE}/api/calls/{cid}", json={"status": "completed"})
            (ok if ru.status_code == 200 else warn)("PUT /api/calls/:id status -> 200" + ("" if ru.status_code == 200 else f" ({ru.status_code})"))
        else:
            warn("POST /api/calls", str(rc.status_code))
    else:
        warn("create patient for round-trip", str(r.status_code))

    S.post(f"{BASE}/api/crew-units", json={
        "shiftDate": TODAY, "truckNumber": "BADINPUT", "startTime": "08:00",
        "shiftDurationHours": "notanumber", "patientOrder": [{"name": "t", "time": "", "callId": None}]})
    units = S.get(f"{BASE}/api/crew-units?shift_date={TODAY}").json()
    bad = [u for u in units if u.get("truckNumber") == "BADINPUT" and u.get("shiftDurationHours") == "notanumber"]
    (ok if not bad else fail)("DB integrity - invalid shiftDurationHours not persisted")


# ─── EDGE CASES ──────────────────────────────────────────────────────────────
def test_edge_cases():
    section("EDGE CASES - boundary inputs + injection")

    p = {"shiftDate": TODAY, "truckNumber": "Амбу-1", "startTime": "09:00",
         "patientOrder": [{"name": "t", "time": "", "callId": None}]}
    r = S.post(f"{BASE}/api/crew-units", json=p)
    if r.status_code == 201:
        created["crew_units"].append(r.json()["id"])
        ok("POST /crew-units - unicode truckNumber accepted")
    else:
        warn("POST /crew-units - unicode truckNumber", f"got {r.status_code}")

    p = {"shiftDate": TODAY, "truckNumber": "' OR '1'='1", "startTime": "09:00",
         "patientOrder": [{"name": "t", "time": "", "callId": None}]}
    r = S.post(f"{BASE}/api/crew-units", json=p)
    if r.status_code in (201, 400):
        if r.status_code == 201:
            created["crew_units"].append(r.json()["id"])
        ok("POST /crew-units - SQL injection probe -> safe (ORM escapes)")
    else:
        fail("POST /crew-units - SQL injection probe", f"{r.status_code}: {r.text[:80]}")

    p = {"shiftDate": "bad-date", "truckNumber": f"ED{rstr(3)}", "startTime": "99:99",
         "patientOrder": [{"name": "t", "time": "", "callId": None}]}
    r = S.post(f"{BASE}/api/crew-units", json=p)
    (ok if r.status_code == 400 else fail)("POST /crew-units - invalid shiftDate/startTime -> 400" + ("" if r.status_code == 400 else f" (got {r.status_code})"))

    r = S.get(f"{BASE}/api/audit?page=abc")
    (ok if r.status_code != 500 else fail)(f"GET /api/audit?page=abc -> {r.status_code} (not 500)")

    r = S.post(f"{BASE}/api/calls", json={"trip_date": TODAY, "quality_score": 150})
    (ok if r.status_code == 400 else fail)("POST /calls - quality_score out of range -> 400" + ("" if r.status_code == 400 else f" (got {r.status_code})"))

    r = S.post(f"{BASE}/api/vehicles", json={"unitName": f"EV{rstr(3)}", "unitNumber": f"E{rstr(4)}", "unitType": "whatever"})
    (ok if r.status_code == 400 else fail)("POST /vehicles - invalid unitType -> 400" + ("" if r.status_code == 400 else f" (got {r.status_code})"))
    if r.status_code == 201:
        created["vehicles"].append(r.json()["id"])

    r = S.put(f"{BASE}/api/crew-units/alerts")
    (ok if r.status_code == 405 else warn)("PUT /crew-units/alerts -> 405" + ("" if r.status_code == 405 else f" (got {r.status_code})"))


# ─── PATIENTS ────────────────────────────────────────────────────────────────
def test_patients():
    section("PATIENTS - dedup, archive, alerts, contacts")

    dup_name = f"QADup{rstr(4)}"
    p1 = {"first_name": dup_name, "last_name": "Patient", "dob": "1990-01-01"}
    r1 = S.post(f"{BASE}/api/patients", json=p1)
    if r1.status_code != 201:
        fail("POST /patients", f"{r1.status_code}: {r1.text[:120]}")
        return
    pid = r1.json()["id"]
    created["patients"].append(pid)
    ok(f"POST /patients -> 201 (#{pid})")

    r2 = S.post(f"{BASE}/api/patients", json=p1)
    (ok if r2.status_code == 409 else fail)("POST /patients - exact duplicate -> 409" + ("" if r2.status_code == 409 else f" (got {r2.status_code})"))

    rc = S.post(f"{BASE}/api/calls", json={"patient_id": pid, "trip_date": TODAY,
                                           "pickup_address": "1 QA St", "dropoff_address": "2 QA Ave"})
    cid = rc.json().get("id") if rc.status_code == 201 else None
    if cid:
        created["calls"].append(cid)

    ra = S.delete(f"{BASE}/api/patient/{pid}", json={"reason": "QA archive"})
    (ok if ra.status_code == 200 and ra.json().get("patient", {}).get("is_archived") else fail)("DELETE /patient/:id - archives (not hard delete)")

    rl = S.get(f"{BASE}/api/patients?name={dup_name}")
    (ok if not any(p["id"] == pid for p in rl.json().get("items", [])) else fail)("GET /patients - archived hidden from active search")
    rla = S.get(f"{BASE}/api/patients?show_archived=1&name={dup_name}")
    (ok if any(p["id"] == pid for p in rla.json().get("items", [])) else fail)("GET /patients?show_archived=1 - archived visible")

    rr = S.post(f"{BASE}/api/patient/{pid}/restore")
    (ok if rr.status_code == 200 and not rr.json().get("patient", {}).get("is_archived") else fail)("POST /patient/:id/restore - active again")
    rr2 = S.post(f"{BASE}/api/patient/{pid}/restore")
    (ok if rr2.status_code == 409 else fail)("POST /patient/:id/restore (already active) -> 409" + ("" if rr2.status_code == 409 else f" (got {rr2.status_code})"))

    ral = S.post(f"{BASE}/api/patient/{pid}/alerts", json={"category": "bogus", "severity": "info", "title": "x"})
    (ok if ral.status_code == 400 else fail)("POST alerts - invalid category -> 400" + ("" if ral.status_code == 400 else f" (got {ral.status_code})"))
    ral = S.post(f"{BASE}/api/patient/{pid}/alerts", json={"category": "transport", "severity": "warning", "title": "Stretcher"})
    if ral.status_code == 201:
        aid = ral.json()["id"]
        ok(f"POST /patient/:id/alerts -> 201 (#{aid})")
        rres = S.post(f"{BASE}/api/patient/{pid}/alerts/{aid}/resolve", json={"reason": "handled"})
        (ok if rres.status_code == 200 and rres.json().get("status") == "resolved" else fail)("POST alerts/:id/resolve -> resolved")
    else:
        fail("POST /patient/:id/alerts", f"got {ral.status_code}")

    rct = S.post(f"{BASE}/api/patient/{pid}/contacts", json={"name": "Jane", "relationship": "Daughter", "phone": "555-1234"})
    if rct.status_code == 201:
        ctid = rct.json()["id"]
        ok(f"POST /patient/:id/contacts -> 201 (#{ctid})")
        ru = S.put(f"{BASE}/api/patient/{pid}/contacts/{ctid}", json={"phone": "555-9999"})
        (ok if ru.status_code == 200 and ru.json().get("phone") == "555-9999" else fail)("PUT contact -> updated")
        rd = S.delete(f"{BASE}/api/patient/{pid}/contacts/{ctid}")
        (ok if rd.status_code == 200 else fail)("DELETE contact -> 200")
    else:
        fail("POST /patient/:id/contacts", f"got {rct.status_code}")

    r_long = S.post(f"{BASE}/api/patients", json={"first_name": f"QALong{rstr(4)}", "last_name": "P", "dob": "1991-01-01", "notes": "x" * 6000})
    (ok if r_long.status_code == 400 else fail)("POST /patients - notes over limit -> 400" + ("" if r_long.status_code == 400 else f" (got {r_long.status_code})"))
    if r_long.status_code == 201:
        created["patients"].append(r_long.json()["id"])


# ─── TASKS ───────────────────────────────────────────────────────────────────
def test_tasks():
    section("TASKS - CRUD, permission matrix, comments, activity")

    r_emp = S.post(f"{BASE}/api/employees", json={"firstName": f"QATask{rstr(4)}", "lastName": "Emp", "role": "EMT"})
    if r_emp.status_code != 201:
        fail("POST /employees - task fixture", f"{r_emp.status_code}: {r_emp.text[:120]}")
        return
    emp_id = r_emp.json()["id"]
    created["employees"].append(emp_id)

    r = S.post(f"{BASE}/api/tasks", json={"title": f"QA Task {rstr(4)}", "task_type": "General Task", "priority": "High"})
    if r.status_code != 201:
        fail("POST /tasks", f"{r.status_code}: {r.text[:120]}")
        return
    task_id = r.json()["id"]
    created["tasks"].append(task_id)
    ok(f"POST /tasks -> 201 (#{task_id}), status defaults to New" if r.json().get("status") == "New" else "")
    if r.json().get("status") != "New":
        fail("POST /tasks - default status", f"got {r.json().get('status')}")

    for body, label in (({"task_type": "General Task"}, "missing title"),
                        ({"title": "x", "task_type": "Not A Real Type"}, "invalid task_type"),
                        ({"title": "x", "priority": "Meh"}, "invalid priority")):
        rr = S.post(f"{BASE}/api/tasks", json=body)
        (ok if rr.status_code == 400 else fail)(f"POST /tasks - {label} -> 400" + ("" if rr.status_code == 400 else f" (got {rr.status_code})"))

    r_assign = S.patch(f"{BASE}/api/tasks/{task_id}/assign", json={"assigned_to_employee_id": emp_id})
    (ok if r_assign.status_code == 200 and r_assign.json().get("status") == "Assigned" else fail)("PATCH /tasks/:id/assign -> status auto-bumps to Assigned")

    r_c = S.patch(f"{BASE}/api/tasks/{task_id}/status", json={"status": "Completed"})
    (ok if r_c.status_code == 200 and r_c.json().get("completed_at") else fail)("PATCH status -> Completed sets completed_at")
    r_o = S.patch(f"{BASE}/api/tasks/{task_id}/status", json={"status": "In Progress"})
    (ok if r_o.status_code == 200 and r_o.json().get("completed_at") is None else fail)("PATCH status -> leaving Completed clears completed_at")

    r_cm = S.post(f"{BASE}/api/tasks/{task_id}/comments", json={"comment_text": "QA comment"})
    (ok if r_cm.status_code == 201 else fail)("POST /tasks/:id/comments -> 201" + ("" if r_cm.status_code == 201 else f" ({r_cm.status_code})"))
    r_cm2 = S.post(f"{BASE}/api/tasks/{task_id}/comments", json={"comment_text": ""})
    (ok if r_cm2.status_code == 400 else fail)("POST /tasks/:id/comments - empty -> 400" + ("" if r_cm2.status_code == 400 else f" (got {r_cm2.status_code})"))

    r_act = S.get(f"{BASE}/api/tasks/{task_id}/activity")
    types = {a["action_type"] for a in r_act.json()} if r_act.status_code == 200 else set()
    (ok if {"created", "assigned", "status_changed", "commented"}.issubset(types) else fail)("GET /tasks/:id/activity - logs created/assigned/status/comment" + ("" if {"created", "assigned", "status_changed", "commented"}.issubset(types) else f" - got {types}"))

    # Permission matrix - dispatcher cannot create / assign / archive / view others'.
    for rr, label in ((DISP.post(f"{BASE}/api/tasks", json={"title": "x"}), "POST /tasks (dispatcher)"),
                      (DISP.patch(f"{BASE}/api/tasks/{task_id}/assign", json={"assigned_to_employee_id": emp_id}), "PATCH assign (dispatcher)"),
                      (DISP.delete(f"{BASE}/api/tasks/{task_id}"), "DELETE (dispatcher)"),
                      (DISP.get(f"{BASE}/api/tasks/{task_id}"), "GET (dispatcher, not their task)")):
        (ok if rr.status_code == 403 else fail)(f"{label} -> 403" + ("" if rr.status_code == 403 else f" (got {rr.status_code})"))

    # HR restricted to HR task types.
    r_hrbad = HR.post(f"{BASE}/api/tasks", json={"title": "x", "task_type": "General Task"})
    (ok if r_hrbad.status_code == 403 else fail)("POST /tasks (hr, non-HR type) -> 403" + ("" if r_hrbad.status_code == 403 else f" (got {r_hrbad.status_code})"))
    r_hrok = HR.post(f"{BASE}/api/tasks", json={"title": "QA HR", "task_type": "HR Task"})
    (ok if r_hrok.status_code == 201 else fail)("POST /tasks (hr, HR type) -> 201" + ("" if r_hrok.status_code == 201 else f" ({r_hrok.status_code})"))
    if r_hrok.status_code == 201:
        created["tasks"].append(r_hrok.json()["id"])

    # Supervisor archive.
    r_sup = SUP.delete(f"{BASE}/api/tasks/{task_id}")
    (ok if r_sup.status_code == 200 and r_sup.json().get("task", {}).get("is_archived") else fail)("DELETE /tasks/:id (supervisor) -> archived")
    r_ld = S.get(f"{BASE}/api/tasks")
    (ok if not any(t["id"] == task_id for t in r_ld.json()["items"]) else fail)("GET /tasks - archived excluded from default")


# ─── LOAD ────────────────────────────────────────────────────────────────────
def test_load():
    section("LOAD - concurrent authenticated reads + writes")

    import random
    READ = [f"{BASE}/api/dispatch/board?date={TODAY}", f"{BASE}/api/crew-units/alerts?date={TODAY}",
            f"{BASE}/api/notifications", f"{BASE}/api/patients", f"{BASE}/api/calls?status=new",
            f"{BASE}/api/employees", f"{BASE}/api/vehicles"]
    res = {"ok": 0, "err": 0, "times": []}

    def worker(wid):
        s = ApiSession(BASE, "admin", "admin")
        out = []
        for i in range(12):
            t0 = time.perf_counter()
            try:
                if i % 8 == 0:
                    rv = s.post(f"{BASE}/api/vehicles", json={"unitName": f"LT{wid}", "unitNumber": f"LT{wid}{i}", "unitType": "BLS"})
                    if rv.status_code == 201:
                        s.delete(f"{BASE}/api/vehicles/{rv.json()['id']}")
                    good = rv.status_code in (201, 409)
                else:
                    good = s.get(random.choice(READ), timeout=8).status_code < 500
            except Exception:
                good = False
            out.append(((time.perf_counter() - t0) * 1000, good))
        return out

    t0 = time.perf_counter()
    with ThreadPoolExecutor(max_workers=15) as pool:
        for f in as_completed([pool.submit(worker, w) for w in range(15)]):
            for elapsed, good in f.result():
                res["times"].append(elapsed)
                res["ok" if good else "err"] += 1
    total = res["ok"] + res["err"]
    times = sorted(res["times"])
    p95 = times[int(len(times) * 0.95)]
    rps = total / (time.perf_counter() - t0)
    print(f"  15 workers x 12 req = {total} in {time.perf_counter()-t0:.1f}s | {rps:.0f} req/s | P95={p95:.0f}ms | errors={res['err']}")
    (ok if res["err"] == 0 else fail)(f"Load - {total} requests, {res['err']} errors, P95={p95:.0f}ms")


def run_all():
    test_vehicles()
    test_crew_units()
    test_shift_alerts()
    test_dispatch_board()
    test_notifications()
    test_data_integrity()
    test_edge_cases()
    test_patients()
    test_tasks()
    test_load()


def _selftest():
    """Deterministic exit-code check that needs no backend.

    ``--selftest-pass`` registers a passing check and must exit 0;
    ``--selftest-fail`` registers a failing check and must exit non-zero. This is
    what test_qa_runner.py drives to prove the runner actually gates on failures.
    """
    if "--selftest-fail" in sys.argv:
        fail("forced failure (selftest)")
    else:
        ok("forced pass (selftest)")
    sys.exit(1 if FAIL else 0)


def main():
    global BASE, S, SUP, DISP, HR, SESSIONS
    if "--selftest-pass" in sys.argv or "--selftest-fail" in sys.argv:
        _selftest()

    print("\nEMS Workflow System - live functional QA runner")
    print(f"Started: {datetime.now().strftime('%H:%M:%S')}")

    with QaHarness() as base:
        BASE = base
        print(f"QA backend (disposable): {BASE}")
        SESSIONS = role_sessions(BASE)
        S = SESSIONS["admin"]
        SUP, DISP, HR = SESSIONS["supervisor"], SESSIONS["dispatcher"], SESSIONS["hr"]
        run_all()

    print(f"\n{'='*66}")
    print(f"  RESULTS:  {PASS} passed   {FAIL} failed   {len(WARNS)} warnings")
    print(f"{'='*66}")
    for w in WARNS:
        print(f"    [warn]  {w}")
    print(f"Finished: {datetime.now().strftime('%H:%M:%S')}")

    # Non-zero exit on any failure so CI can gate on it.
    sys.exit(1 if FAIL else 0)


if __name__ == "__main__":
    main()
