"""
EMS Workflow System — Functional QA Test Suite (June 2026 audit fixes)
Runs as real tester: happy path + edge cases + regression checks.
python qa_test.py
"""
import requests
import time
import json
import random
import string
import statistics
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed

BASE = "http://127.0.0.1:5050"
TODAY = datetime.now().strftime("%Y-%m-%d")
TOMORROW = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
YESTERDAY = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")

S = requests.Session()
S.headers.update({"Content-Type": "application/json", "X-User-Id": "1", "X-User-Role": "admin"})

PASS = 0
FAIL = 0
WARNS = []

def ok(label):
    global PASS
    PASS += 1
    print(f"  ✅  {label}")

def fail(label, detail=""):
    global FAIL
    FAIL += 1
    msg = f"  ❌  {label}"
    if detail:
        msg += f"  →  {detail}"
    print(msg)

def warn(label, detail=""):
    WARNS.append(label)
    print(f"  ⚠️   {label}" + (f"  →  {detail}" if detail else ""))

def section(title):
    print(f"\n{'─'*65}")
    print(f"  {title}")
    print(f"{'─'*65}")

def rstr(n=5):
    return "".join(random.choices(string.ascii_uppercase, k=n))

created = {"vehicles": [], "crew_units": [], "patients": [], "calls": []}


# ─── SECTION 1: VEHICLES ──────────────────────────────────────────────────────
def test_vehicles():
    section("VEHICLES — CRUD + edge cases")

    # 1.1 Create vehicle — happy path
    r = S.post(f"{BASE}/api/vehicles", json={"unitName": "TestAmbu", "unitNumber": f"T{rstr(3)}", "unitType": "ALS"})
    if r.status_code == 201:
        vid = r.json()["id"]
        created["vehicles"].append(vid)
        ok("POST /api/vehicles — happy path → 201")
    else:
        fail("POST /api/vehicles — happy path", r.text[:100])
        vid = None

    # 1.2 Missing unitNumber → 400
    r = S.post(f"{BASE}/api/vehicles", json={"unitName": "NoNumber"})
    if r.status_code == 400:
        ok("POST /api/vehicles — missing unitNumber → 400")
    else:
        fail("POST /api/vehicles — missing unitNumber → expected 400", f"got {r.status_code}")

    # 1.3 Missing unitType → 400
    r = S.post(f"{BASE}/api/vehicles", json={"unitName": "NoType", "unitNumber": "999X"})
    if r.status_code == 400:
        ok("POST /api/vehicles — missing unitType → 400")
    else:
        fail("POST /api/vehicles — missing unitType", f"got {r.status_code}")

    # 1.4 Duplicate unitNumber → 409 (fix M2)
    if vid:
        dup_num = S.get(f"{BASE}/api/vehicles").json()
        dup_num = next((v["unitNumber"] for v in dup_num if v["id"] == vid), None)
        r = S.post(f"{BASE}/api/vehicles", json={"unitName": "Dupe", "unitNumber": dup_num, "unitType": "BLS"})
        if r.status_code == 409:
            ok("POST /api/vehicles — duplicate unitNumber → 409 (M2 fix)")
        else:
            fail("POST /api/vehicles — duplicate unitNumber", f"got {r.status_code}: {r.text[:80]}")

    # 1.5 Toggle active
    if vid:
        all_v = S.get(f"{BASE}/api/vehicles").json()
        orig = next((v["isActive"] for v in all_v if v["id"] == vid), True)
        r = S.patch(f"{BASE}/api/vehicles/{vid}/toggle-active")
        if r.status_code == 200 and r.json()["isActive"] != orig:
            ok("PATCH /api/vehicles/:id/toggle-active — flips isActive")
        else:
            fail("PATCH toggle-active", r.text[:80])

    # 1.6 Toggle non-existent → 404
    r = S.patch(f"{BASE}/api/vehicles/99999/toggle-active")
    if r.status_code == 404:
        ok("PATCH /api/vehicles/99999/toggle-active → 404")
    else:
        fail("PATCH toggle non-existent", f"got {r.status_code}")

    # 1.7 PUT update — change type, check no cross-contamination
    if vid:
        r = S.put(f"{BASE}/api/vehicles/{vid}", json={"unitName": "TestAmbu-Updated", "unitNumber": f"U{rstr(3)}", "unitType": "BLS"})
        if r.status_code == 200 and r.json()["unitType"] == "BLS":
            ok("PUT /api/vehicles/:id — update unitType")
        else:
            fail("PUT /api/vehicles/:id", r.text[:80])

    # 1.8 DELETE
    if vid:
        r = S.delete(f"{BASE}/api/vehicles/{vid}")
        if r.status_code == 200:
            ok("DELETE /api/vehicles/:id → 200")
            created["vehicles"].remove(vid)
        else:
            fail("DELETE /api/vehicles/:id", f"got {r.status_code}")

    # 1.9 DELETE non-existent → 404
    r = S.delete(f"{BASE}/api/vehicles/99999")
    if r.status_code == 404:
        ok("DELETE /api/vehicles/99999 → 404")
    else:
        fail("DELETE non-existent", f"got {r.status_code}")


# ─── SECTION 2: CREW UNITS — shift timing ─────────────────────────────────────
def test_crew_units():
    section("CREW UNITS — shift timing + edge cases")

    base_payload = {
        "shiftDate": TODAY,
        "truckNumber": f"QA{rstr(3)}",
        "startTime": "08:00",
        "patientOrder": [{"name": "on call", "time": "", "callId": None}],
    }

    # 2.1 Create unit — no shift duration
    r = S.post(f"{BASE}/api/crew-units", json=base_payload)
    if r.status_code == 201:
        uid = r.json()["id"]
        created["crew_units"].append(uid)
        if r.json()["plannedEndTime"] is None:
            ok("POST /crew-units — no shiftDurationHours → plannedEndTime=null")
        else:
            fail("POST /crew-units — plannedEndTime should be null when no duration set")
    else:
        fail("POST /crew-units — basic create", r.text[:100])
        uid = None

    # 2.2 shiftDurationHours = "custom" → must NOT 500 (M1 fix)
    p = {**base_payload, "truckNumber": f"QA{rstr(3)}", "shiftDurationHours": "custom"}
    r = S.post(f"{BASE}/api/crew-units", json=p)
    if r.status_code in (201,):
        data = r.json()
        if data.get("shiftDurationHours") is None:
            ok("POST /crew-units — shiftDurationHours='custom' → null (M1 fix), no 500")
            created["crew_units"].append(data["id"])
        else:
            warn("POST /crew-units — 'custom' not coerced to null", str(data.get("shiftDurationHours")))
    else:
        fail(f"POST /crew-units — shiftDurationHours='custom' → {r.status_code} (expected 201)", r.text[:120])

    # 2.3 shiftDurationHours = -5 → must be null
    p = {**base_payload, "truckNumber": f"QA{rstr(3)}", "shiftDurationHours": -5}
    r = S.post(f"{BASE}/api/crew-units", json=p)
    if r.status_code == 201 and r.json().get("shiftDurationHours") is None:
        ok("POST /crew-units — shiftDurationHours=-5 → null (M1 fix)")
        created["crew_units"].append(r.json()["id"])
    elif r.status_code == 201:
        fail("POST /crew-units — negative duration should be null", str(r.json().get("shiftDurationHours")))
    else:
        fail("POST /crew-units — negative duration", f"got {r.status_code}")

    # 2.4 Valid duration → plannedEndTime computed
    p = {**base_payload, "truckNumber": f"QA{rstr(3)}", "shiftDurationHours": 8}
    r = S.post(f"{BASE}/api/crew-units", json=p)
    if r.status_code == 201:
        d = r.json()
        created["crew_units"].append(d["id"])
        if d.get("plannedEndTime") == "16:00":
            ok("POST /crew-units — 08:00 + 8h → plannedEndTime=16:00 ✓")
        else:
            fail("POST /crew-units — plannedEndTime wrong", f"got {d.get('plannedEndTime')}")
    else:
        fail("POST /crew-units — valid duration", r.text[:100])

    # 2.5 Midnight crossover: 22:00 + 10h = 08:00 NEXT DAY (H5 fix)
    p = {**base_payload, "truckNumber": f"QA{rstr(3)}", "startTime": "22:00", "shiftDurationHours": 10}
    r = S.post(f"{BASE}/api/crew-units", json=p)
    if r.status_code == 201:
        d = r.json()
        uid2 = d["id"]
        created["crew_units"].append(uid2)
        if d.get("plannedEndTime") == "08:00":
            ok("POST /crew-units — midnight crossover 22:00+10h → plannedEndTime=08:00 ✓")
        else:
            fail("POST /crew-units — midnight crossover plannedEndTime", f"got {d.get('plannedEndTime')}")
        # This unit must NOT appear in alerts as critical (it ends tomorrow)
        r_alerts = S.get(f"{BASE}/api/crew-units/alerts?date={TODAY}")
        alert_ids = [a["unitId"] for a in r_alerts.json()]
        if uid2 not in alert_ids:
            ok("GET /alerts — midnight crossover unit NOT flagged as overdue (H5 fix) ✓")
        else:
            fail("GET /alerts — midnight crossover unit wrongly flagged as overdue", f"alert: {[a for a in r_alerts.json() if a['unitId']==uid2]}")
    else:
        fail("POST /crew-units — midnight crossover", r.text[:100])

    # 2.6 Missing required fields → 400
    r = S.post(f"{BASE}/api/crew-units", json={"startTime": "08:00", "patientOrder": []})
    if r.status_code == 400:
        ok("POST /crew-units — missing shiftDate → 400")
    else:
        fail("POST /crew-units — missing shiftDate", f"got {r.status_code}")

    # 2.7 PUT missing required fields → 400 (M3 fix)
    if uid:
        r = S.put(f"{BASE}/api/crew-units/{uid}", json={"unitType": "ALS", "patientOrder": []})
        if r.status_code == 400:
            ok("PUT /crew-units/:id — missing shiftDate → 400 (M3 fix)")
        else:
            fail("PUT /crew-units/:id — missing required field", f"got {r.status_code}: {r.text[:80]}")

    # 2.8 make-night copies shift_duration_hours (H6 fix)
    p = {**base_payload, "truckNumber": f"QA{rstr(3)}", "shiftDurationHours": 12}
    r = S.post(f"{BASE}/api/crew-units", json=p)
    if r.status_code == 201:
        src_id = r.json()["id"]
        created["crew_units"].append(src_id)
        r_night = S.post(f"{BASE}/api/crew-units/{src_id}/make-night",
                         json={"startTime": "22:00", "endDate": TOMORROW})
        if r_night.status_code == 201:
            night = r_night.json()
            created["crew_units"].append(night["id"])
            if night.get("shiftDurationHours") == 12.0:
                ok("make-night — copies shiftDurationHours from source (H6 fix) ✓")
            else:
                fail("make-night — shiftDurationHours NOT copied", f"got {night.get('shiftDurationHours')}")
        else:
            fail("make-night POST", r_night.text[:80])
    else:
        fail("POST /crew-units — for make-night test", r.text[:80])


# ─── SECTION 3: SHIFT ALERTS ──────────────────────────────────────────────────
def test_shift_alerts():
    section("SHIFT ALERTS — alert logic")

    # 3.1 Unit with future end → no alert
    # Stay within today's hours to avoid date ambiguity: pick +2h if that fits before 23:00
    now_h = datetime.now().hour
    if now_h + 3 < 23:
        future_start = f"{now_h + 2:02d}:{datetime.now().minute:02d}"
        alert_date = TODAY
    else:
        future_start = "08:00"
        alert_date = TOMORROW
    p = {
        "shiftDate": alert_date,
        "truckNumber": f"AL{rstr(3)}",
        "startTime": future_start,
        "shiftDurationHours": 8,
        "patientOrder": [{"name": "on call", "time": "", "callId": None}],
    }
    r = S.post(f"{BASE}/api/crew-units", json=p)
    if r.status_code == 201:
        uid_fut = r.json()["id"]
        created["crew_units"].append(uid_fut)
        alerts = S.get(f"{BASE}/api/crew-units/alerts?date={TODAY}").json()
        if not any(a["unitId"] == uid_fut for a in alerts):
            ok(f"GET /alerts — future shift (starts {future_start}) produces no alert ✓")
        else:
            fail("GET /alerts — future shift wrongly flagged")

    # 3.2 Past date alerts don't use current time for "today" computation
    r = S.get(f"{BASE}/api/crew-units/alerts?date={YESTERDAY}")
    if r.status_code == 200:
        ok(f"GET /alerts?date={YESTERDAY} → 200 (no crash on past date)")
    else:
        fail("GET /alerts — past date crashed", r.text[:80])

    # 3.3 Bad date → returns empty array (not 500)
    r = S.get(f"{BASE}/api/crew-units/alerts?date=not-a-date")
    if r.status_code == 200 and r.json() == []:
        ok("GET /alerts?date=not-a-date → [] (graceful empty)")
    else:
        fail("GET /alerts — bad date param", f"{r.status_code}: {r.text[:80]}")

    # 3.4 Completed unit → no alert even if overdue
    early_start = (datetime.now() - timedelta(hours=10)).strftime("%H:%M")
    p2 = {
        "shiftDate": TODAY,
        "truckNumber": f"AL{rstr(3)}",
        "startTime": early_start,
        "shiftDurationHours": 4,
        "shiftStatus": "completed",
        "patientOrder": [{"name": "on call", "time": "", "callId": None}],
    }
    r = S.post(f"{BASE}/api/crew-units", json=p2)
    if r.status_code == 201:
        uid_done = r.json()["id"]
        created["crew_units"].append(uid_done)
        alerts = S.get(f"{BASE}/api/crew-units/alerts?date={TODAY}").json()
        if not any(a["unitId"] == uid_done for a in alerts):
            ok("GET /alerts — completed unit suppressed ✓")
        else:
            fail("GET /alerts — completed unit still in alerts")


# ─── SECTION 4: DISPATCH BOARD INTEGRATION ───────────────────────────────────
def test_dispatch_board():
    section("DISPATCH BOARD — shift data propagation")

    # 4.1 Units appear in dispatch board with shiftDurationHours
    r = S.get(f"{BASE}/api/dispatch/board?date={TODAY}")
    if r.status_code == 200:
        ok(f"GET /dispatch/board?date={TODAY} → 200")
        units = r.json().get("units", [])
        units_with_shift = [u for u in units if u.get("shiftDurationHours")]
        units_with_planned = [u for u in units if u.get("plannedEndTime")]
        ok(f"Dispatch board: {len(units)} units total, {len(units_with_shift)} with shift duration, {len(units_with_planned)} with plannedEndTime")

        # Check fields are present on all units
        required_fields = ["shiftDurationHours", "shiftStatus", "plannedEndTime", "delayMinutes"]
        for u in units[:3]:  # sample first 3
            missing = [f for f in required_fields if f not in u]
            if missing:
                fail(f"Unit {u.get('truckNumber')} missing fields: {missing}")
            else:
                ok(f"Unit {u.get('truckNumber')} has all shift fields in board response")
    else:
        fail("GET /dispatch/board", f"{r.status_code}: {r.text[:80]}")

    # 4.2 Shift alerts endpoint concurrent access
    times = []
    errors = 0
    def hit_alerts(_):
        try:
            t0 = time.perf_counter()
            r = requests.get(f"{BASE}/api/crew-units/alerts?date={TODAY}", timeout=5)
            elapsed = (time.perf_counter() - t0) * 1000
            return elapsed, r.status_code == 200
        except Exception:
            return 999, False

    with ThreadPoolExecutor(max_workers=10) as pool:
        futures = [pool.submit(hit_alerts, i) for i in range(50)]
        for f in as_completed(futures):
            t, success = f.result()
            times.append(t)
            if not success:
                errors += 1

    avg_t = statistics.mean(times)
    p95_t = sorted(times)[int(len(times) * 0.95)]
    if errors == 0:
        ok(f"GET /alerts — 50 concurrent requests: avg={avg_t:.1f}ms p95={p95_t:.1f}ms errors=0")
    else:
        fail(f"GET /alerts — concurrent: {errors}/50 errors")


# ─── SECTION 5: NOTIFICATIONS ─────────────────────────────────────────────────
def test_notifications():
    section("NOTIFICATIONS — bell system")

    # 5.1 Get notifications for user 1
    r = S.get(f"{BASE}/api/notifications?user_id=1")
    if r.status_code == 200:
        data = r.json()
        count = len(data.get("notifications", []))
        unread = data.get("unread_count", 0)
        ok(f"GET /notifications?user_id=1 → 200  ({count} items, {unread} unread)")
    else:
        fail("GET /notifications", f"{r.status_code}: {r.text[:80]}")

    # 5.2 Missing user_id → 400
    r = S.get(f"{BASE}/api/notifications")
    if r.status_code == 400:
        ok("GET /notifications — no user_id → 400")
    else:
        fail("GET /notifications — no user_id", f"got {r.status_code}")

    # 5.3 Mark non-existent as read → not 500
    r = S.post(f"{BASE}/api/notifications/999999/read", json={"user_id": 1})
    if r.status_code in (404, 400):
        ok("POST /notifications/999999/read → 404 (not 500)")
    else:
        warn("POST /notifications/999999/read", f"got {r.status_code}: {r.text[:80]}")

    # 5.4 GET /notifications/prefs — regression test for NOTIFICATION_LABELS NameError (500)
    r = S.get(f"{BASE}/api/notifications/prefs?user_id=1")
    if r.status_code == 200:
        data = r.json()
        if isinstance(data, dict) and len(data) > 0:
            ok(f"GET /notifications/prefs?user_id=1 → 200 ({len(data)} notification types)")
        else:
            fail("GET /notifications/prefs?user_id=1", "200 but empty/non-dict body")
        # Every entry must carry a real label (not just the raw type echoed back),
        # and an enabled flag — this is the exact shape the Settings page depends on.
        bad = [t for t, v in data.items() if not isinstance(v, dict) or "enabled" not in v or not v.get("label")]
        if not bad:
            ok("GET /notifications/prefs — every type has enabled + non-empty label")
        else:
            fail("GET /notifications/prefs — malformed entries", f"{bad}")
    else:
        fail("GET /notifications/prefs?user_id=1", f"{r.status_code}: {r.text[:120]}")

    # 5.5 Missing user_id → 400
    r = S.get(f"{BASE}/api/notifications/prefs")
    if r.status_code == 400:
        ok("GET /notifications/prefs — no user_id → 400")
    else:
        fail("GET /notifications/prefs — no user_id", f"got {r.status_code}")

    # 5.6 Nonexistent user_id → 404 (not 500, not a silent 400 mislabel)
    r = S.get(f"{BASE}/api/notifications/prefs?user_id=999999")
    if r.status_code == 404:
        ok("GET /notifications/prefs?user_id=999999 → 404")
    else:
        fail("GET /notifications/prefs?user_id=999999", f"got {r.status_code}")

    # 5.7 Cross-role check — response structure must hold for every seeded user,
    # without hardcoding a specific type list per role (types are role-dependent).
    r = S.get(f"{BASE}/api/auth/users")
    if r.status_code == 200:
        users = r.json()
        role_results = []
        for u in users:
            ru = S.get(f"{BASE}/api/notifications/prefs?user_id={u['id']}")
            valid = (
                ru.status_code == 200
                and isinstance(ru.json(), dict)
                and all(
                    isinstance(v, dict) and isinstance(v.get("enabled"), bool) and v.get("label")
                    for v in ru.json().values()
                )
            )
            role_results.append((u["role"], valid))
        if all(valid for _, valid in role_results):
            roles_checked = ", ".join(sorted({r for r, _ in role_results}))
            ok(f"GET /notifications/prefs — valid structure across roles: {roles_checked}")
        else:
            bad_roles = [r for r, valid in role_results if not valid]
            fail("GET /notifications/prefs — role structure check", f"failed for: {bad_roles}")
    else:
        warn("GET /auth/users unavailable — skipped cross-role prefs check")


# ─── SECTION 6: DATA INTEGRITY ────────────────────────────────────────────────
def test_data_integrity():
    section("DATA INTEGRITY — db rollback + no partial writes")

    # 6.1 Valid call round-trip (create a dedicated patient so this never depends
    # on leftover data from other test runs).
    r_new_patient = S.post(f"{BASE}/api/patients", json={
        "first_name": f"QART{rstr(4)}",
        "last_name": "Roundtrip",
        "dob": "1985-05-05",
    })
    if r_new_patient.status_code == 201:
        pid = r_new_patient.json()["id"]
        created.setdefault("patients", []).append(pid)
        r_call = S.post(f"{BASE}/api/calls", json={
            "patient_id": pid,
            "dispatcher_name": "QATester",
            "date_of_call": TODAY,
            "trip_date": TODAY,
            "pickup_time": "10:00",
            "pickup_address": "100 QA St, Springfield IL",
            "dropoff_address": "200 Hospital Dr, Springfield IL",
            "service_level": "BLS",
            "call_type": "Appointment",
        })
        if r_call.status_code == 201:
            call_id = r_call.json()["id"]
            created.setdefault("calls", []).append(call_id)
            ok(f"POST /api/calls → 201 (call #{call_id})")
            # Update status via the real call update endpoint (admin/supervisor only)
            r_upd = S.put(f"{BASE}/api/calls/{call_id}", json={"status": "completed"})
            if r_upd.status_code == 200:
                ok("PUT /api/calls/:id status update → 200")
            else:
                warn("PUT /api/calls/:id status update", f"{r_upd.status_code}: {r_upd.text[:80]}")
        else:
            warn("POST /api/calls", f"{r_call.status_code}")
    else:
        warn("Could not create patient for call round-trip test", f"{r_new_patient.status_code}")

    # 6.2 Verify crew unit DB state after rollback test
    # Send invalid payload → should get error, not partial record
    bad_r = S.post(f"{BASE}/api/crew-units", json={
        "shiftDate": TODAY,
        "truckNumber": "BADINPUT",
        "startTime": "08:00",
        "shiftDurationHours": "notanumber",
        "patientOrder": [{"name": "test", "time": "", "callId": None}],
    })
    r_check = S.get(f"{BASE}/api/crew-units?shift_date={TODAY}")
    if r_check.status_code == 200:
        units = r_check.json()
        bad_units = [u for u in units if u.get("truckNumber") == "BADINPUT" and u.get("shiftDurationHours") == "notanumber"]
        if not bad_units:
            ok("DB integrity — no partial write with invalid shiftDurationHours ✓")
        else:
            fail("DB integrity — bad shiftDurationHours written to DB", str(bad_units[0]))


# ─── SECTION 7: LOAD TEST ────────────────────────────────────────────────────
def test_load():
    section("LOAD TEST — concurrent reads + writes (simulating peak hour)")

    READ_ENDPOINTS = [
        f"{BASE}/api/dispatch/board?date={TODAY}",
        f"{BASE}/api/crew-units/alerts?date={TODAY}",
        f"{BASE}/api/notifications?user_id=1",
        f"{BASE}/api/patients",
        f"{BASE}/api/calls?status=new",
        f"{BASE}/api/employees",
        f"{BASE}/api/vehicles",
    ]

    results = {"ok": 0, "err": 0, "times": []}

    def mixed_worker(worker_id):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json", "X-User-Id": "1"})
        local = []
        for i in range(15):
            t0 = time.perf_counter()
            try:
                if i % 8 == 0:
                    # Write: create vehicle (then immediately delete)
                    rv = s.post(f"{BASE}/api/vehicles",
                                json={"unitName": f"LT{worker_id}", "unitNumber": f"LT{worker_id}{i}", "unitType": "BLS"})
                    if rv.status_code == 201:
                        s.delete(f"{BASE}/api/vehicles/{rv.json()['id']}")
                    ok_ = rv.status_code in (201, 409)
                else:
                    r = s.get(random.choice(READ_ENDPOINTS), timeout=8)
                    ok_ = r.status_code < 500
            except Exception:
                ok_ = False
            elapsed = (time.perf_counter() - t0) * 1000
            local.append((elapsed, ok_))
        return local

    t_start = time.perf_counter()
    with ThreadPoolExecutor(max_workers=25) as pool:
        futures = [pool.submit(mixed_worker, wid) for wid in range(25)]
        for f in as_completed(futures):
            for elapsed, success in f.result():
                results["times"].append(elapsed)
                if success:
                    results["ok"] += 1
                else:
                    results["err"] += 1

    total_time = time.perf_counter() - t_start
    total = results["ok"] + results["err"]
    times = sorted(results["times"])
    avg_t = statistics.mean(times)
    p50_t = times[int(len(times) * 0.50)]
    p95_t = times[int(len(times) * 0.95)]
    p99_t = times[int(len(times) * 0.99)]
    rps = total / total_time
    err_pct = results["err"] / total * 100 if total else 0

    print(f"\n  25 workers × 15 requests = {total} total in {total_time:.1f}s")
    print(f"  Throughput:   {rps:.1f} req/s")
    print(f"  Avg latency:  {avg_t:.1f}ms")
    print(f"  P50:          {p50_t:.1f}ms")
    print(f"  P95:          {p95_t:.1f}ms")
    print(f"  P99:          {p99_t:.1f}ms")
    print(f"  Errors:       {results['err']}/{total} ({err_pct:.1f}%)")

    if results["err"] == 0 and p95_t < 1000:
        ok(f"Load test PASSED — P95={p95_t:.0f}ms, 0 errors")
    elif results["err"] == 0:
        warn(f"Load test OK but slow — P95={p95_t:.0f}ms")
    else:
        fail(f"Load test — {results['err']} errors ({err_pct:.1f}%)")


# ─── SECTION 8: EDGE CASES ────────────────────────────────────────────────────
def test_edge_cases():
    section("EDGE CASES — boundary inputs")

    # 8.1 Very long string in notes
    long_notes = "x" * 10_000
    p = {
        "shiftDate": TODAY,
        "truckNumber": f"ED{rstr(3)}",
        "startTime": "09:00",
        "notes": long_notes,
        "patientOrder": [{"name": "test", "time": "", "callId": None}],
    }
    r = S.post(f"{BASE}/api/crew-units", json=p)
    if r.status_code in (201, 400):
        if r.status_code == 201:
            created["crew_units"].append(r.json()["id"])
            ok("POST /crew-units — 10k char notes → accepted (stored)")
        else:
            ok("POST /crew-units — 10k char notes → 400 (rejected at validation)")
    else:
        fail("POST /crew-units — 10k notes", f"got {r.status_code}")

    # 8.2 Unicode in truck number
    p = {**{
        "shiftDate": TODAY,
        "truckNumber": "Амбу-1",
        "startTime": "09:00",
        "patientOrder": [{"name": "test", "time": "", "callId": None}],
    }}
    r = S.post(f"{BASE}/api/crew-units", json=p)
    if r.status_code == 201:
        created["crew_units"].append(r.json()["id"])
        ok("POST /crew-units — unicode truckNumber 'Амбу-1' → accepted")
    else:
        warn("POST /crew-units — unicode truckNumber", f"got {r.status_code}")

    # 8.3 shiftDurationHours = 0 → null
    p = {
        "shiftDate": TODAY,
        "truckNumber": f"ED{rstr(3)}",
        "startTime": "09:00",
        "shiftDurationHours": 0,
        "patientOrder": [{"name": "test", "time": "", "callId": None}],
    }
    r = S.post(f"{BASE}/api/crew-units", json=p)
    if r.status_code == 201:
        d = r.json()
        created["crew_units"].append(d["id"])
        if d.get("shiftDurationHours") is None:
            ok("POST /crew-units — shiftDurationHours=0 → null (not stored) ✓")
        else:
            fail("POST /crew-units — shiftDurationHours=0 should be null", str(d.get("shiftDurationHours")))
    else:
        fail("POST /crew-units — shiftDurationHours=0", f"got {r.status_code}")

    # 8.4 shiftDurationHours = 24.5 (fractional > 24)
    p = {
        "shiftDate": TODAY,
        "truckNumber": f"ED{rstr(3)}",
        "startTime": "00:00",
        "shiftDurationHours": 24.5,
        "patientOrder": [{"name": "test", "time": "", "callId": None}],
    }
    r = S.post(f"{BASE}/api/crew-units", json=p)
    if r.status_code == 201:
        d = r.json()
        created["crew_units"].append(d["id"])
        ok(f"POST /crew-units — shiftDurationHours=24.5 → stored as {d.get('shiftDurationHours')}, plannedEnd={d.get('plannedEndTime')}")
    else:
        fail("POST /crew-units — fractional duration", f"got {r.status_code}")

    # 8.5 SQL injection probe in truckNumber
    p = {
        "shiftDate": TODAY,
        "truckNumber": "' OR '1'='1",
        "startTime": "09:00",
        "patientOrder": [{"name": "test", "time": "", "callId": None}],
    }
    r = S.post(f"{BASE}/api/crew-units", json=p)
    if r.status_code in (201, 400):
        if r.status_code == 201:
            created["crew_units"].append(r.json()["id"])
        ok("POST /crew-units — SQL injection in truckNumber → safe (ORM escapes)")
    else:
        fail("POST /crew-units — SQL injection probe", f"got {r.status_code}: {r.text[:80]}")

    # 8.7 Invalid crew employee id → 400, not 500
    p = {
        "shiftDate": TODAY,
        "truckNumber": f"ED{rstr(3)}",
        "startTime": "09:00",
        "crew": {"driver": "abc"},
        "patientOrder": [{"name": "test", "time": "", "callId": None}],
    }
    r = S.post(f"{BASE}/api/crew-units", json=p)
    if r.status_code == 400:
        ok("POST /crew-units — invalid crew employee id → 400 (not 500)")
    else:
        fail("POST /crew-units — invalid crew employee id", f"got {r.status_code}")

    # 8.8 Invalid shiftDate / startTime → 400, not silently accepted
    p = {
        "shiftDate": "bad-date",
        "truckNumber": f"ED{rstr(3)}",
        "startTime": "99:99",
        "patientOrder": [{"name": "test", "time": "", "callId": None}],
    }
    r = S.post(f"{BASE}/api/crew-units", json=p)
    if r.status_code == 400:
        ok("POST /crew-units — invalid shiftDate/startTime → 400")
    else:
        fail("POST /crew-units — invalid shiftDate/startTime", f"got {r.status_code}")

    # 8.9 Invalid audit page/per_page → not 500
    r = S.get(f"{BASE}/api/audit?page=abc")
    if r.status_code != 500:
        ok(f"GET /api/audit?page=abc → {r.status_code} (not 500)")
    else:
        fail("GET /api/audit?page=abc", "got 500")

    r = S.get(f"{BASE}/api/audit?per_page=abc")
    if r.status_code != 500:
        ok(f"GET /api/audit?per_page=abc → {r.status_code} (not 500)")
    else:
        fail("GET /api/audit?per_page=abc", "got 500")

    # 8.10 Invalid quality_score → 400
    r = S.post(f"{BASE}/api/calls", json={"trip_date": TODAY, "quality_score": "notnum"})
    if r.status_code == 400:
        ok("POST /calls — invalid quality_score → 400")
    else:
        fail("POST /calls — invalid quality_score", f"got {r.status_code}")

    r = S.post(f"{BASE}/api/calls", json={"trip_date": TODAY, "quality_score": 150})
    if r.status_code == 400:
        ok("POST /calls — quality_score out of range (150) → 400")
    else:
        fail("POST /calls — quality_score out of range", f"got {r.status_code}")

    # 8.11 Invalid vehicle unitType → 400
    r = S.post(f"{BASE}/api/vehicles", json={
        "unitName": f"EdgeVeh{rstr(3)}", "unitNumber": f"E{rstr(4)}", "unitType": "whatever",
    })
    if r.status_code == 400:
        ok("POST /vehicles — invalid unitType → 400")
    else:
        fail("POST /vehicles — invalid unitType", f"got {r.status_code}")
        if r.status_code == 201:
            created["vehicles"].append(r.json()["id"])

    # 8.6 Wrong HTTP method on alerts → 405
    r = S.put(f"{BASE}/api/crew-units/alerts")
    if r.status_code == 405:
        ok("PUT /crew-units/alerts → 405 Method Not Allowed")
    else:
        warn("PUT /crew-units/alerts", f"got {r.status_code}")


# ─── SECTION 9: PATIENT MODULE ────────────────────────────────────────────────
def test_patients():
    section("PATIENT MODULE — duplicate prevention, archive, alerts, contacts")

    # 9.1 Create + exact duplicate → 409
    dup_name = f"QADup{rstr(4)}"
    p1 = {"first_name": dup_name, "last_name": "Patient", "dob": "1990-01-01"}
    r1 = S.post(f"{BASE}/api/patients", json=p1)
    if r1.status_code == 201:
        pid = r1.json()["id"]
        created["patients"].append(pid)
        ok(f"POST /patients → 201 (patient #{pid})")

        r2 = S.post(f"{BASE}/api/patients", json=p1)
        if r2.status_code == 409:
            ok("POST /patients — exact duplicate (name+dob) → 409")
        else:
            fail("POST /patients — duplicate prevention", f"got {r2.status_code}")
    else:
        fail("POST /patients", f"got {r1.status_code}: {r1.text[:120]}")
        return

    # 9.2 Archive replaces hard delete; existing calls keep a valid patient reference
    r_call = S.post(f"{BASE}/api/calls", json={
        "patient_id": pid, "trip_date": TODAY,
        "pickup_address": "1 QA St", "dropoff_address": "2 QA Ave",
    })
    call_id = r_call.json().get("id") if r_call.status_code == 201 else None
    if call_id:
        created["calls"].append(call_id)

    r_arch = S.delete(f"{BASE}/api/patient/{pid}", json={"reason": "QA archive test"})
    if r_arch.status_code == 200 and r_arch.json().get("patient", {}).get("is_archived"):
        ok("DELETE /patient/:id → archives instead of hard delete")
    else:
        fail("DELETE /patient/:id — archive", f"got {r_arch.status_code}: {r_arch.text[:120]}")

    r_list = S.get(f"{BASE}/api/patients?per_page=200")
    archived_still_listed = any(p["id"] == pid for p in r_list.json().get("items", []))
    if not archived_still_listed:
        ok("GET /patients (default) — archived patient hidden from active search")
    else:
        fail("GET /patients — archived patient leaked into default list")

    r_list_all = S.get(f"{BASE}/api/patients?show_archived=1&per_page=200")
    if any(p["id"] == pid for p in r_list_all.json().get("items", [])):
        ok("GET /patients?show_archived=1 — archived patient visible")
    else:
        fail("GET /patients?show_archived=1 — archived patient missing")

    if call_id:
        r_calls = S.get(f"{BASE}/api/calls?per_page=200")
        match = next((c for c in r_calls.json().get("items", []) if c["id"] == call_id), None)
        if match and match.get("patient_name"):
            ok(f"GET /calls — call for archived patient still resolves patient_name ('{match['patient_name']}')")
        else:
            fail("GET /calls — archived patient's call lost patient_name", str(match))

    # 9.3 Restore
    r_restore = S.post(f"{BASE}/api/patient/{pid}/restore")
    if r_restore.status_code == 200 and not r_restore.json().get("patient", {}).get("is_archived"):
        ok("POST /patient/:id/restore — patient active again")
    else:
        fail("POST /patient/:id/restore", f"got {r_restore.status_code}")

    r_restore_again = S.post(f"{BASE}/api/patient/{pid}/restore")
    if r_restore_again.status_code == 409:
        ok("POST /patient/:id/restore (already active) → 409")
    else:
        fail("POST /patient/:id/restore twice", f"got {r_restore_again.status_code}")

    # 9.4 dispatch_comment
    comment = "Call daughter before pickup. Use side entrance."
    r_dc = S.put(f"{BASE}/api/patient/{pid}", json={"dispatch_comment": comment})
    if r_dc.status_code == 200 and r_dc.json().get("dispatch_comment") == comment:
        ok("PUT /patient/:id — dispatch_comment saved and returned")
    else:
        fail("PUT /patient/:id — dispatch_comment", f"got {r_dc.status_code}")

    # 9.5 Alerts: create, invalid category/severity, list, resolve
    r_bad_cat = S.post(f"{BASE}/api/patient/{pid}/alerts", json={
        "category": "bogus", "severity": "info", "title": "x"})
    if r_bad_cat.status_code == 400:
        ok("POST /patient/:id/alerts — invalid category → 400")
    else:
        fail("POST alerts — invalid category", f"got {r_bad_cat.status_code}")

    r_bad_sev = S.post(f"{BASE}/api/patient/{pid}/alerts", json={
        "category": "safety", "severity": "bogus", "title": "x"})
    if r_bad_sev.status_code == 400:
        ok("POST /patient/:id/alerts — invalid severity → 400")
    else:
        fail("POST alerts — invalid severity", f"got {r_bad_sev.status_code}")

    r_alert = S.post(f"{BASE}/api/patient/{pid}/alerts", json={
        "category": "transport", "severity": "warning", "title": "Requires stretcher"})
    if r_alert.status_code == 201:
        alert_id = r_alert.json()["id"]
        ok(f"POST /patient/:id/alerts → 201 (alert #{alert_id})")
    else:
        fail("POST /patient/:id/alerts", f"got {r_alert.status_code}")
        alert_id = None

    if alert_id:
        r_active = S.get(f"{BASE}/api/patient/{pid}/alerts")
        if r_active.status_code == 200 and any(a["id"] == alert_id for a in r_active.json()):
            ok("GET /patient/:id/alerts — active alert listed")
        else:
            fail("GET /patient/:id/alerts — active alert missing")

        r_resolve = S.post(f"{BASE}/api/patient/{pid}/alerts/{alert_id}/resolve", json={"reason": "handled"})
        if r_resolve.status_code == 200 and r_resolve.json().get("status") == "resolved":
            ok("POST /patient/:id/alerts/:id/resolve — alert resolved")
        else:
            fail("POST alerts resolve", f"got {r_resolve.status_code}")

        r_after = S.get(f"{BASE}/api/patient/{pid}/alerts")
        if r_after.status_code == 200 and not any(a["id"] == alert_id for a in r_after.json()):
            ok("GET /patient/:id/alerts (active only) — resolved alert excluded")
        else:
            fail("GET /patient/:id/alerts — resolved alert still showing as active")

        r_resolve_again = S.post(f"{BASE}/api/patient/{pid}/alerts/{alert_id}/resolve")
        if r_resolve_again.status_code == 409:
            ok("POST alerts resolve (already resolved) → 409")
        else:
            fail("POST alerts resolve twice", f"got {r_resolve_again.status_code}")

    # 9.6 Contacts: create, update, delete
    r_contact = S.post(f"{BASE}/api/patient/{pid}/contacts", json={
        "name": "Jane Doe", "relationship": "Daughter", "phone": "555-1234",
        "can_authorize_transport": True,
    })
    if r_contact.status_code == 201:
        contact_id = r_contact.json()["id"]
        ok(f"POST /patient/:id/contacts → 201 (contact #{contact_id})")

        r_upd_contact = S.put(f"{BASE}/api/patient/{pid}/contacts/{contact_id}", json={"phone": "555-9999"})
        if r_upd_contact.status_code == 200 and r_upd_contact.json().get("phone") == "555-9999":
            ok("PUT /patient/:id/contacts/:id — updated")
        else:
            fail("PUT contact update", f"got {r_upd_contact.status_code}")

        r_del_contact = S.delete(f"{BASE}/api/patient/{pid}/contacts/{contact_id}")
        if r_del_contact.status_code == 200:
            ok("DELETE /patient/:id/contacts/:id → 200")
        else:
            fail("DELETE contact", f"got {r_del_contact.status_code}")
    else:
        fail("POST /patient/:id/contacts", f"got {r_contact.status_code}")

    # 9.7 last-trip-template excludes stale scheduling fields
    if call_id:
        r_template = S.get(f"{BASE}/api/patient/{pid}/last-trip-template")
        tpl = r_template.json().get("template") if r_template.status_code == 200 else None
        if tpl and tpl.get("pickup_address") == "1 QA St" and "status" not in tpl and "trip_date" not in tpl:
            ok("GET /patient/:id/last-trip-template — returns reusable fields only")
        else:
            fail("GET /patient/:id/last-trip-template", str(tpl))

    # 9.8 Field length limit
    r_long = S.post(f"{BASE}/api/patients", json={
        "first_name": f"QALong{rstr(4)}", "last_name": "Patient",
        "dob": "1991-01-01", "notes": "x" * 6000,
    })
    if r_long.status_code == 400:
        ok("POST /patients — notes over length limit → 400")
    else:
        fail("POST /patients — notes length limit", f"got {r_long.status_code}")
        if r_long.status_code == 201:
            created["patients"].append(r_long.json()["id"])


# ─── CLEANUP ──────────────────────────────────────────────────────────────────
def cleanup():
    section("CLEANUP — removing QA test data")
    for uid in created["crew_units"]:
        S.delete(f"{BASE}/api/crew-units/{uid}")
    for vid in created["vehicles"]:
        S.delete(f"{BASE}/api/vehicles/{vid}")
    for pid in created["patients"]:
        S.delete(f"{BASE}/api/patient/{pid}")  # archives — patients are never hard-deleted
    print(f"  Removed {len(created['crew_units'])} crew units, {len(created['vehicles'])} vehicles, "
          f"archived {len(created['patients'])} patients")


# ─── MAIN ─────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print(f"\nEMS Workflow System — Functional QA Suite")
    print(f"Target: {BASE}  |  Date: {TODAY}")
    print(f"Started: {datetime.now().strftime('%H:%M:%S')}\n")

    try:
        r = requests.get(f"{BASE}/api/health", timeout=3)
        if r.status_code == 200:
            print(f"Backend: ✅ healthy")
        else:
            print(f"Backend: ⚠️  responded {r.status_code}")
    except Exception as e:
        print(f"Backend: ❌ not reachable — {e}")
        exit(1)

    test_vehicles()
    test_crew_units()
    test_shift_alerts()
    test_dispatch_board()
    test_notifications()
    test_data_integrity()
    test_edge_cases()
    test_patients()
    test_load()
    cleanup()

    print(f"\n{'='*65}")
    print(f"  RESULTS:  ✅ {PASS} passed   ❌ {FAIL} failed   ⚠️  {len(WARNS)} warnings")
    print(f"{'='*65}")
    if WARNS:
        print(f"\n  Warnings:")
        for w in WARNS:
            print(f"    ⚠️   {w}")
    print(f"\nFinished: {datetime.now().strftime('%H:%M:%S')}")
