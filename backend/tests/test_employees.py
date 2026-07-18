from models import db, Employee, DailyCrewUnit


def _make(app, **kw):
    emp = Employee(first_name=kw.get("first_name", "Jane"),
                   last_name=kw.get("last_name", "Doe"),
                   role=kw.get("role", "EMT"))
    db.session.add(emp)
    db.session.commit()
    return emp


def test_get_employee_returns_the_record(client, app):
    emp = _make(app, first_name="Sarah", last_name="Collins", role="Paramedic")
    resp = client.get(f"/api/employees/{emp.id}")
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["firstName"] == "Sarah"
    assert body["lastName"] == "Collins"
    assert body["role"] == "Paramedic"
    # Nested certification blocks come back shaped for the workspace.
    assert set(body["cpr"]) == {"hasLicense", "licenseName", "expirationDate"}


def test_get_employee_404_for_unknown_id(client):
    resp = client.get("/api/employees/999999")
    assert resp.status_code == 404
    assert "error" in resp.get_json()


def _shift(emp, slot, date, **kw):
    unit = DailyCrewUnit(shift_date=date, unit_type="BLS", truck_number="101",
                         start_time="08:00", **{slot: emp.id})
    db.session.add(unit)
    db.session.commit()
    return unit


def test_employee_shifts_reports_role_across_slots(client, app):
    emp = _make(app, first_name="Nina", last_name="Brooks")
    _shift(emp, "driver_id", "2026-06-01")
    _shift(emp, "medical_id", "2026-06-03")
    _shift(emp, "assist1_id", "2026-06-02")
    # A shift the employee is not on must not appear.
    other = _make(app, first_name="Other", last_name="Person")
    _shift(other, "driver_id", "2026-06-04")

    resp = client.get(f"/api/employees/{emp.id}/shifts")
    assert resp.status_code == 200
    shifts = resp.get_json()
    assert len(shifts) == 3
    # Newest first.
    assert [s["shiftDate"] for s in shifts] == ["2026-06-03", "2026-06-02", "2026-06-01"]
    roles = {s["shiftDate"]: s["role"] for s in shifts}
    assert roles == {"2026-06-03": "Medical", "2026-06-02": "Assist", "2026-06-01": "Driver"}


def test_employee_shifts_404_for_unknown_id(client):
    resp = client.get("/api/employees/999999/shifts")
    assert resp.status_code == 404
