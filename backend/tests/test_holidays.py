"""Per-org holidays: HR CRUD, staff read, and that a holiday inside a leave range
does not spend PTO.
"""

from models import db, Employee, Holiday, EmployeeLeaveRequest
from utils import pto


def test_hr_creates_and_lists_holidays(clients):
    resp = clients["hr"].post("/api/holidays", json={"date": "2026-07-04", "name": "Independence Day"})
    assert resp.status_code == 201
    rows = clients["dispatcher"].get("/api/holidays").get_json()   # any staff role may read
    assert any(h["date"] == "2026-07-04" and h["name"] == "Independence Day" for h in rows)


def test_duplicate_date_is_refused(clients):
    clients["hr"].post("/api/holidays", json={"date": "2026-12-25", "name": "Christmas"})
    dup = clients["hr"].post("/api/holidays", json={"date": "2026-12-25", "name": "Xmas"})
    assert dup.status_code == 409


def test_bad_date_is_rejected(clients):
    assert clients["hr"].post("/api/holidays", json={"date": "2026-13-40", "name": "X"}).status_code == 400


def test_only_hr_can_write(clients):
    assert clients["dispatcher"].post("/api/holidays", json={"date": "2026-01-01", "name": "NY"}).status_code == 403


def test_delete_removes_a_holiday(clients):
    hid = clients["hr"].post("/api/holidays", json={"date": "2026-05-25", "name": "Memorial Day"}).get_json()["id"]
    assert clients["hr"].delete(f"/api/holidays/{hid}").status_code == 200
    assert clients["hr"].get("/api/holidays").get_json() == []


def test_a_holiday_reduces_a_leaves_pto_cost(app, clients):
    emp = Employee(first_name="Pat", last_name="R", role="EMT", status="active",
                   is_active=True, hire_date="2026-01-01", pto_annual_days=12.0)
    db.session.add(emp)
    db.session.add(Holiday(date="2026-08-11", name="Company day"))   # a Tuesday
    db.session.commit()

    # Mon–Wed vacation with Tue a holiday → 2 chargeable days, not 3.
    lv = EmployeeLeaveRequest(employee_id=emp.id, leave_type="vacation",
                              start_date="2026-08-10", end_date="2026-08-12", status="pending")
    db.session.add(lv)
    db.session.commit()
    assert pto.business_days(lv) == 2.0
