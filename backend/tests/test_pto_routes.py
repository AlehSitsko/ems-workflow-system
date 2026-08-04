"""PTO API + the leave-decision wiring: approving vacation spends PTO, denying or
cancelling gives it back, and only HR can read/adjust balances or run accrual.
"""

from models import db, Employee, PtoLedgerEntry, EmployeeLeaveRequest


def mk_employee(hire_date="2026-01-15", annual=12.0):
    e = Employee(first_name="Pat", last_name="Rider", role="EMT", status="active",
                 is_active=True, hire_date=hire_date, pto_annual_days=annual)
    db.session.add(e)
    db.session.commit()
    return e


def mk_leave(emp, start, end, leave_type="vacation"):
    lv = EmployeeLeaveRequest(employee_id=emp.id, leave_type=leave_type,
                              start_date=start, end_date=end, status="pending",
                              submitted_at="2026-01-01T00:00:00")
    db.session.add(lv)
    db.session.commit()
    return lv


def _decide(clients, leave_id, status):
    return clients["hr"].patch(f"/api/leave-requests/{leave_id}/decision", json={"status": status})


# ── Accrual + balance API ─────────────────────────────────────────────────────

def test_run_accrual_then_read_balance(app, clients):
    emp = mk_employee(hire_date="2026-01-15", annual=12.0)
    posted = clients["hr"].post("/api/pto/run-accrual").get_json()
    assert posted["posted"] >= 1

    body = clients["hr"].get(f"/api/pto/employees/{emp.id}").get_json()
    assert body["balance"] > 0
    assert body["annualDays"] == 12.0
    assert len(body["ledger"]) == posted["posted"]


def test_manual_adjustment_moves_the_balance(app, clients):
    emp = mk_employee()
    clients["hr"].post(f"/api/pto/employees/{emp.id}/adjust",
                       json={"deltaDays": 3, "note": "carryover import"})
    assert clients["hr"].get(f"/api/pto/employees/{emp.id}").get_json()["balance"] == 3.0


def test_pto_endpoints_are_hr_only(app, clients):
    emp = mk_employee()
    assert clients["dispatcher"].get(f"/api/pto/employees/{emp.id}").status_code == 403
    assert clients["dispatcher"].post("/api/pto/run-accrual").status_code == 403


# ── Leave decision wiring ─────────────────────────────────────────────────────

def test_approving_vacation_spends_pto_and_warns_on_overdraw(app, clients):
    emp = mk_employee()
    lv = mk_leave(emp, "2026-08-10", "2026-08-12")   # Mon–Wed = 3 days, balance is 0
    resp = _decide(clients, lv.id, "approved")
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["ptoSpent"] == 3.0
    assert body["ptoBalance"] == -3.0
    assert "balanceWarning" in body           # over budget → advisory warning


def test_denying_a_previously_approved_leave_restores_pto(app, clients):
    emp = mk_employee()
    lv = mk_leave(emp, "2026-08-10", "2026-08-12")
    _decide(clients, lv.id, "approved")
    assert PtoLedgerEntry.query.filter_by(leave_request_id=lv.id).count() == 1
    _decide(clients, lv.id, "denied")
    assert PtoLedgerEntry.query.filter_by(leave_request_id=lv.id).count() == 0


def test_cancelling_an_approved_leave_restores_pto(app, clients):
    emp = mk_employee()
    lv = mk_leave(emp, "2026-08-10", "2026-08-12")
    _decide(clients, lv.id, "approved")
    clients["hr"].patch(f"/api/leave-requests/{lv.id}/cancel")
    assert PtoLedgerEntry.query.filter_by(leave_request_id=lv.id).count() == 0


def test_sick_leave_never_touches_pto(app, clients):
    emp = mk_employee()
    lv = mk_leave(emp, "2026-08-10", "2026-08-12", leave_type="sick")
    body = _decide(clients, lv.id, "approved").get_json()
    assert "ptoSpent" not in body
    assert PtoLedgerEntry.query.filter_by(employee_id=emp.id).count() == 0
