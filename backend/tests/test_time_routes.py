"""Backend tests for the Time module (routes/time_routes.py).

Covers the three surfaces that were previously untested:
  * time-entry management (CRUD) — payroll-adjacent, gated to admin/supervisor/hr;
  * the PIN-gated kiosk clock-in/out flow (public, no session, per-action PIN);
  * per-employee pay config.

The focus is real behaviour and its guards: RBAC (dispatcher must never manage
time), 404 on unknown employees/entries, wrong-PIN rejection, the already-clocked-in
/ not-clocked-in conflicts, and pay-config upsert.

Run: pytest backend/tests/test_time_routes.py -v
"""

from models import db, Employee, TimeEntry


# ── helpers ──────────────────────────────────────────────────────────────────

def _employee(first="Pat", last="Worker", number="E1", active=True, pin=None):
    emp = Employee(first_name=first, last_name=last, employee_number=number, is_active=active)
    if pin is not None:
        emp.set_kiosk_pin(pin)
    db.session.add(emp)
    db.session.commit()
    return emp


# ── time-entry management: RBAC ──────────────────────────────────────────────

def test_dispatcher_cannot_manage_time_entries(clients, app):
    emp = _employee()
    r = clients["dispatcher"].get(f"/api/employees/{emp.id}/time-entries")
    assert r.status_code == 403


def test_anonymous_cannot_list_time_entries(anon, app):
    emp = _employee()
    r = anon.get(f"/api/employees/{emp.id}/time-entries")
    assert r.status_code == 401


def test_hr_and_admin_may_manage_time_entries(clients, app):
    emp = _employee()
    for role in ("admin", "supervisor", "hr"):
        assert clients[role].get(f"/api/employees/{emp.id}/time-entries").status_code == 200


# ── time-entry CRUD ──────────────────────────────────────────────────────────

def test_create_get_patch_delete_time_entry(clients, app):
    emp = _employee()
    api = clients["admin"]

    created = api.post(f"/api/employees/{emp.id}/time-entries",
                       json={"clock_in": "2026-08-25T08:00:00",
                             "clock_out": "2026-08-25T16:00:00", "break_minutes": 30})
    assert created.status_code == 201
    entry_id = created.get_json()["id"]

    listed = api.get(f"/api/employees/{emp.id}/time-entries").get_json()
    assert [e["id"] for e in listed] == [entry_id]

    patched = api.patch(f"/api/time-entries/{entry_id}",
                        json={"status": "approved", "approved_by": 1})
    assert patched.status_code == 200
    assert patched.get_json()["approved_at"]  # stamped on approval

    assert api.delete(f"/api/time-entries/{entry_id}").status_code == 200
    assert api.get(f"/api/employees/{emp.id}/time-entries").get_json() == []


def test_create_time_entry_for_unknown_employee_is_404(clients, app):
    assert clients["admin"].post("/api/employees/999999/time-entries", json={}).status_code == 404


def test_patch_and_delete_unknown_entry_is_404(clients, app):
    assert clients["admin"].patch("/api/time-entries/999999", json={}).status_code == 404
    assert clients["admin"].delete("/api/time-entries/999999").status_code == 404


def test_time_entries_date_range_filter(clients, app):
    emp = _employee()
    api = clients["admin"]
    for day in ("2026-08-01", "2026-08-15", "2026-08-31"):
        api.post(f"/api/employees/{emp.id}/time-entries", json={"clock_in": f"{day}T08:00:00"})
    got = api.get(f"/api/employees/{emp.id}/time-entries"
                  "?date_from=2026-08-10&date_to=2026-08-20").get_json()
    assert [e["clock_in"][:10] for e in got] == ["2026-08-15"]


# ── kiosk: employee list (public) ────────────────────────────────────────────

def test_kiosk_employee_list_only_active_and_flags_pin(clients, anon, app):
    _employee(first="Ann", number="A1", pin="1234")
    _employee(first="Bob", number="B1", active=False)   # inactive -> excluded
    _employee(first="Cy", number="C1")                  # active, no pin
    names = {(e["name"], e["has_pin"]) for e in anon.get("/api/kiosk/employees").get_json()}
    assert ("Ann Worker", True) in names
    assert ("Cy Worker", False) in names
    assert all("Bob" not in n for n, _ in names)


# ── kiosk: PIN verification ──────────────────────────────────────────────────

def test_verify_pin_requires_employee_id(anon, app):
    assert anon.post("/api/kiosk/verify-pin", json={"pin": "1234"}).status_code == 400


def test_verify_pin_wrong_and_right(anon, app):
    emp = _employee(pin="4321")
    assert anon.post("/api/kiosk/verify-pin", json={"employee_id": emp.id, "pin": "0000"}).status_code == 403
    assert anon.post("/api/kiosk/verify-pin", json={"employee_id": emp.id, "pin": "4321"}).status_code == 200


# ── kiosk: clock in / out ────────────────────────────────────────────────────

def test_clock_in_wrong_pin_rejected(anon, app):
    emp = _employee(pin="1111")
    assert anon.post("/api/kiosk/clock-in", json={"employee_id": emp.id, "pin": "2222"}).status_code == 403


def test_clock_in_then_double_clock_in_conflicts(anon, app):
    emp = _employee(pin="1111")
    first = anon.post("/api/kiosk/clock-in", json={"employee_id": emp.id, "pin": "1111"})
    assert first.status_code == 201
    again = anon.post("/api/kiosk/clock-in", json={"employee_id": emp.id, "pin": "1111"})
    assert again.status_code == 409
    assert "entry_id" in again.get_json()


def test_clock_out_requires_being_clocked_in(anon, app):
    emp = _employee(pin="1111")
    # not clocked in yet
    assert anon.post("/api/kiosk/clock-out", json={"employee_id": emp.id, "pin": "1111"}).status_code == 409
    anon.post("/api/kiosk/clock-in", json={"employee_id": emp.id, "pin": "1111"})
    assert anon.post("/api/kiosk/clock-out", json={"employee_id": emp.id, "pin": "1111"}).status_code == 200


def test_kiosk_status_reflects_clock_state(anon, app):
    emp = _employee(pin="1111")
    assert anon.get(f"/api/kiosk/status/{emp.id}").get_json()["clocked_in"] is False
    anon.post("/api/kiosk/clock-in", json={"employee_id": emp.id, "pin": "1111"})
    status = anon.get(f"/api/kiosk/status/{emp.id}").get_json()
    assert status["clocked_in"] is True and status["entry_id"]


# ── pay config ───────────────────────────────────────────────────────────────

def test_pay_config_upsert_roundtrip(clients, app):
    emp = _employee()
    api = clients["hr"]
    assert api.get(f"/api/employees/{emp.id}/pay-config").get_json() is None

    put = api.put(f"/api/employees/{emp.id}/pay-config",
                  json={"pay_type": "hourly", "hourly_rate": 28.5, "overtime_after": 40})
    assert put.status_code == 200 and put.get_json()["hourly_rate"] == 28.5

    got = api.get(f"/api/employees/{emp.id}/pay-config").get_json()
    assert got["hourly_rate"] == 28.5 and got["overtime_after"] == 40


def test_pay_config_dispatcher_forbidden(clients, app):
    emp = _employee()
    assert clients["dispatcher"].get(f"/api/employees/{emp.id}/pay-config").status_code == 403
