"""PTO engine (utils/pto.py): business-day counting, the ledger balance, monthly
accrual with carryover, and holiday-aware deduction. No org context in the test
app, so the org defaults apply (15 days/year, carryover cap 5)."""

from datetime import date
from types import SimpleNamespace

from models import db, Employee, Holiday, EmployeeLeaveRequest, PtoLedgerEntry
from utils import pto


def _leave(start, end, start_time=None, end_time=None, leave_type="vacation"):
    return SimpleNamespace(start_date=start, end_date=end, start_time=start_time,
                           end_time=end_time, leave_type=leave_type)


def mk_employee(hire_date="2026-01-15", annual=12.0):
    e = Employee(first_name="Pat", last_name="Rider", role="EMT", status="active",
                 is_active=True, hire_date=hire_date, pto_annual_days=annual)
    db.session.add(e)
    db.session.commit()
    return e


def mk_leave_row(emp, start, end, leave_type="vacation", start_time=None, end_time=None):
    lv = EmployeeLeaveRequest(employee_id=emp.id, leave_type=leave_type,
                              start_date=start, end_date=end,
                              start_time=start_time, end_time=end_time, status="approved")
    db.session.add(lv)
    db.session.commit()
    return lv


# ── business_days ─────────────────────────────────────────────────────────────

def test_counts_weekdays_only(app):
    # Fri 2026-08-07 through Mon 2026-08-10 → Fri + Mon (weekend skipped).
    assert pto.business_days(_leave("2026-08-07", "2026-08-10"), holidays=set()) == 2.0


def test_a_holiday_inside_the_range_is_free(app):
    # Mon–Wed with Tue a holiday → 2 working days.
    assert pto.business_days(_leave("2026-08-10", "2026-08-12"),
                             holidays={"2026-08-11"}) == 2.0


def test_a_single_partial_day_is_half(app):
    assert pto.business_days(_leave("2026-08-10", "2026-08-10", start_time="09:00"),
                             holidays=set()) == 0.5


# ── balance = sum of ledger ───────────────────────────────────────────────────

def test_balance_is_the_sum_of_deltas(app):
    emp = mk_employee()
    for delta, kind in ((5, "accrual"), (-2, "used"), (1.5, "adjustment")):
        db.session.add(PtoLedgerEntry(employee_id=emp.id, delta_days=delta, kind=kind,
                                      effective_date="2026-08-01"))
    db.session.commit()
    assert pto.pto_balance(emp.id) == 4.5


# ── accrual ───────────────────────────────────────────────────────────────────

def test_monthly_accrual_and_idempotence(app):
    emp = mk_employee(hire_date="2026-01-15", annual=12.0)   # 1.0 / month
    posted = pto.accrue_through(today=date(2026, 6, 10))
    assert len(posted) == 6                    # Jan..Jun
    assert pto.pto_balance(emp.id) == 6.0
    # Re-running posts nothing new.
    assert pto.accrue_through(today=date(2026, 6, 10)) == []
    assert pto.pto_balance(emp.id) == 6.0


def test_year_end_carryover_trims_to_the_cap(app):
    emp = mk_employee(hire_date="2025-01-10", annual=24.0)   # 2.0 / month
    pto.accrue_through(today=date(2025, 12, 31))             # 12 months → 24.0
    assert pto.pto_balance(emp.id) == 24.0

    pto.accrue_through(today=date(2026, 1, 31))              # carryover trims 24→5, + Jan 2.0
    assert pto.pto_balance(emp.id) == 7.0
    assert PtoLedgerEntry.query.filter_by(employee_id=emp.id, kind="carryover").count() == 1


def test_employee_without_a_hire_date_does_not_accrue(app):
    emp = mk_employee(hire_date=None)
    assert pto.accrue_through(today=date(2026, 6, 10)) == []
    assert pto.pto_balance(emp.id) == 0.0


# ── deduction / reversal ──────────────────────────────────────────────────────

def test_approving_a_vacation_spends_days(app):
    emp = mk_employee()
    lv = mk_leave_row(emp, "2026-08-10", "2026-08-12")       # Mon–Wed = 3
    spent = pto.deduct_for_leave(lv)
    assert spent == 3.0
    assert pto.pto_balance(emp.id) == -3.0                   # over-draw allowed (negative)


def test_sick_leave_does_not_spend_pto(app):
    emp = mk_employee()
    lv = mk_leave_row(emp, "2026-08-10", "2026-08-12", leave_type="sick")
    assert pto.deduct_for_leave(lv) is None
    assert pto.pto_balance(emp.id) == 0.0


def test_deduction_is_idempotent(app):
    emp = mk_employee()
    lv = mk_leave_row(emp, "2026-08-10", "2026-08-10")
    pto.deduct_for_leave(lv)
    pto.deduct_for_leave(lv)                                 # second call must not double-spend
    assert PtoLedgerEntry.query.filter_by(leave_request_id=lv.id, kind="used").count() == 1


def test_reverse_restores_the_balance(app):
    emp = mk_employee()
    lv = mk_leave_row(emp, "2026-08-10", "2026-08-12")
    pto.deduct_for_leave(lv)
    assert pto.pto_balance(emp.id) == -3.0
    pto.reverse_leave(lv)
    db.session.commit()
    assert pto.pto_balance(emp.id) == 0.0


def test_per_employee_allotment_overrides_the_org_default(app):
    from utils.employee_utils import apply_employee_data
    emp = Employee(first_name="A", last_name="B", role="EMT", status="active", is_active=True)
    apply_employee_data(emp, {"ptoAnnualDays": 20})
    assert emp.pto_annual_days == 20.0
    assert pto.annual_days(emp) == 20.0          # its own value, not the default 15
    apply_employee_data(emp, {"ptoAnnualDays": ""})
    assert emp.pto_annual_days is None            # blank clears it → org default
