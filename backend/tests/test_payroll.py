"""Isolated backend tests for the Payroll domain.

Locks in the CURRENT FLSA-style payroll math (overtime computed per ISO week and
summed across weeks) plus the summary/export endpoints, before any refactor.
The math is exercised directly through `_calc_period_summary`; the HTTP surface
(summary, export, JSON errors) through the test client.

A couple of noteworthy behaviors are pinned with explicit tests + comments:
  * A present EmployeePayConfig with overtime_rate=0.0 yields zero OT *pay* — the
    1.5x fallback only applies when there is NO config at all.
  * Payroll routes currently have no role gate.
  * Inactive employees with entries are still included in a period summary.

Run: pytest backend/tests/test_payroll.py -v
"""

import pytest

from models import db, Employee, EmployeePayConfig, TimeEntry, PayPeriod
from routes.payroll_routes import _calc_period_summary, _entry_duration


ADMIN = {"X-User-Name": "Admin", "X-User-Role": "admin"}


# ── fixtures / helpers ──────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def _signed_in(client, app):
    """Sign the shared client in.

    Every /api/ route now requires a session, so these tests need one. Applied
    per module rather than in conftest so `client` stays anonymous where that is
    the point — test_security.py asserts what an unauthenticated caller gets.
    """
    from conftest import make_user, login

    user = make_user("admin", username="payroll_admin")
    login(client, user.username)
    return client


def _employee(is_active=True, number="E1"):
    emp = Employee(first_name="Pat", last_name="Worker", employee_number=number, is_active=is_active)
    db.session.add(emp)
    db.session.commit()
    return emp


def _pay_config(emp_id, rate=20.0, ot_rate=1.5, ot_after=40):
    cfg = EmployeePayConfig(employee_id=emp_id, pay_type="hourly",
                            hourly_rate=rate, overtime_rate=ot_rate, overtime_after=ot_after)
    db.session.add(cfg)
    db.session.commit()
    return cfg


def _entry(emp_id, day, start="08:00:00", end="16:00:00", break_min=0):
    """day = 'YYYY-MM-DD'. end may be on a later day via 'YYYY-MM-DD HH:MM:SS'."""
    clock_in = f"{day}T{start}"
    clock_out = None if end is None else (end if "T" in end or " " in end else f"{day}T{end}")
    e = TimeEntry(employee_id=emp_id, clock_in=clock_in, clock_out=clock_out, break_minutes=break_min)
    db.session.add(e)
    db.session.commit()
    return e


def _period(start="2026-06-01", end="2026-06-30"):
    p = PayPeriod(start_date=start, end_date=end, period_type="biweekly", status="open")
    db.session.add(p)
    db.session.commit()
    return p


def _summary_for(period, emp_id):
    rows = _calc_period_summary(period)
    return next((r for r in rows if r["employee_id"] == emp_id), None)


# ── entry duration edge cases ───────────────────────────────────────────────

def test_zero_hours_entry(app):
    e = TimeEntry(employee_id=1, clock_in="2026-06-01T08:00:00", clock_out="2026-06-01T08:00:00")
    assert _entry_duration(e) == 0


def test_missing_clock_out(app):
    e = TimeEntry(employee_id=1, clock_in="2026-06-01T08:00:00", clock_out=None)
    assert _entry_duration(e) == 0


def test_clock_out_before_clock_in(app):
    e = TimeEntry(employee_id=1, clock_in="2026-06-01T16:00:00", clock_out="2026-06-01T08:00:00")
    assert _entry_duration(e) == 0


def test_break_minutes_deducted(app):
    e = TimeEntry(employee_id=1, clock_in="2026-06-01T08:00:00", clock_out="2026-06-01T16:00:00", break_minutes=30)
    assert _entry_duration(e) == 8 * 60 - 30


def test_overnight_shift_duration(app):
    # 22:00 -> 06:00 next day = 8h.
    e = TimeEntry(employee_id=1, clock_in="2026-06-01T22:00:00", clock_out="2026-06-02T06:00:00")
    assert _entry_duration(e) == 8 * 60


# ── weekly overtime math ────────────────────────────────────────────────────

def test_under_40_hours_all_regular(app):
    emp = _employee(); _pay_config(emp.id)
    # 4 x 8h in one ISO week (Mon-Thu) = 32h
    for day in ("2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04"):
        _entry(emp.id, day)
    s = _summary_for(_period(), emp.id)
    assert s["regular_hours"] == 32.0
    assert s["ot_hours"] == 0.0
    assert s["total_pay"] == round(32 * 20, 2)


def test_exactly_40_hours_no_overtime(app):
    emp = _employee(); _pay_config(emp.id)
    for day in ("2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05"):
        _entry(emp.id, day)  # 5 x 8h = 40h, Mon-Fri same ISO week
    s = _summary_for(_period(), emp.id)
    assert s["regular_hours"] == 40.0
    assert s["ot_hours"] == 0.0


def test_over_40_hours_produces_overtime(app):
    emp = _employee(); _pay_config(emp.id)
    # 6 x 8h = 48h in one ISO week -> 40 reg + 8 OT
    for day in ("2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05", "2026-06-06"):
        _entry(emp.id, day)
    s = _summary_for(_period(), emp.id)
    assert s["regular_hours"] == 40.0
    assert s["ot_hours"] == 8.0
    # 40*20 + 8*20*1.5 = 800 + 240 = 1040
    assert s["total_pay"] == 1040.0


def test_multiple_shifts_same_day_summed(app):
    emp = _employee(); _pay_config(emp.id)
    _entry(emp.id, "2026-06-01", "08:00:00", "12:00:00")  # 4h
    _entry(emp.id, "2026-06-01", "13:00:00", "17:00:00")  # 4h
    s = _summary_for(_period(), emp.id)
    assert s["total_hours"] == 8.0


def test_iso_week_boundary_keeps_overtime_separate(app):
    # Sunday 2026-06-07 (ISO week 23) and Monday 2026-06-08 (ISO week 24) are
    # different ISO weeks; 40h in each must NOT combine into overtime.
    emp = _employee(); _pay_config(emp.id)
    for day in ("2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05"):
        _entry(emp.id, day)  # week 23: 40h
    for day in ("2026-06-08", "2026-06-09", "2026-06-10", "2026-06-11", "2026-06-12"):
        _entry(emp.id, day)  # week 24: 40h
    s = _summary_for(_period(), emp.id)
    assert s["total_hours"] == 80.0
    assert s["ot_hours"] == 0.0  # 40 + 40 across two weeks, no OT


def test_two_weeks_overtime_per_week(app):
    emp = _employee(); _pay_config(emp.id)
    # Week 23: 48h (8 OT). Week 24: 32h (0 OT).
    for day in ("2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05", "2026-06-06"):
        _entry(emp.id, day)
    for day in ("2026-06-08", "2026-06-09", "2026-06-10", "2026-06-11"):
        _entry(emp.id, day)
    s = _summary_for(_period(), emp.id)
    assert s["ot_hours"] == 8.0
    assert s["regular_hours"] == 72.0  # 40 + 32


def test_partial_week(app):
    emp = _employee(); _pay_config(emp.id)
    _entry(emp.id, "2026-06-03", "08:00:00", "12:30:00")  # 4.5h single day
    s = _summary_for(_period(), emp.id)
    assert s["total_hours"] == 4.5
    assert s["ot_hours"] == 0.0


# ── config / rate edge cases ────────────────────────────────────────────────

def test_employee_without_pay_config_uses_zero_rate(app):
    emp = _employee()  # no EmployeePayConfig
    _entry(emp.id, "2026-06-01")  # 8h
    s = _summary_for(_period(), emp.id)
    assert s["hourly_rate"] == 0.0
    assert s["total_pay"] == 0.0
    # No config -> OT multiplier falls back to 1.5
    assert s["ot_rate_multiplier"] == 1.5


def test_present_config_with_zero_ot_rate_yields_no_ot_pay(app):
    # NOTE: a present config with overtime_rate=0.0 gives zero OT *pay*. The 1.5x
    # fallback only applies when there is NO config. Pinning current behavior.
    emp = _employee(); _pay_config(emp.id, rate=20.0, ot_rate=0.0)
    for day in ("2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05", "2026-06-06"):
        _entry(emp.id, day)  # 48h -> 8 OT hours
    s = _summary_for(_period(), emp.id)
    assert s["ot_hours"] == 8.0
    assert s["ot_pay"] == 0.0
    assert s["total_pay"] == round(40 * 20, 2)  # only regular pay


def test_inactive_employee_still_summarized(app):
    # NOTE: current behavior includes inactive employees who have entries.
    emp = _employee(is_active=False); _pay_config(emp.id)
    _entry(emp.id, "2026-06-01")
    s = _summary_for(_period(), emp.id)
    assert s is not None
    assert s["total_hours"] == 8.0


def test_custom_overtime_after_threshold(app):
    emp = _employee(); _pay_config(emp.id, ot_after=35)
    for day in ("2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05"):
        _entry(emp.id, day)  # 40h, threshold 35 -> 35 reg + 5 OT
    s = _summary_for(_period(), emp.id)
    assert s["regular_hours"] == 35.0
    assert s["ot_hours"] == 5.0


# ── HTTP surface: summary, export, JSON errors ──────────────────────────────

def test_period_summary_endpoint(client):
    emp = _employee(); _pay_config(emp.id)
    _entry(emp.id, "2026-06-01")
    period = _period()
    r = client.get(f"/api/payroll/periods/{period.id}/summary", headers=ADMIN)
    assert r.status_code == 200
    body = r.get_json()
    assert body["period"]["id"] == period.id
    assert any(e["employee_id"] == emp.id for e in body["employees"])


def test_export_csv_contains_totals(client):
    emp = _employee(); _pay_config(emp.id)
    for day in ("2026-06-01", "2026-06-02"):
        _entry(emp.id, day)  # 16h
    period = _period()
    r = client.get(f"/api/payroll/export?period_id={period.id}&format=csv", headers=ADMIN)
    assert r.status_code == 200
    assert r.mimetype == "text/csv"
    text = r.get_data(as_text=True)
    assert "Total Pay" in text  # header
    assert "Worker" in text     # employee row


def test_export_requires_period_id(client):
    r = client.get("/api/payroll/export", headers=ADMIN)
    assert r.status_code == 400


def test_summary_missing_period_returns_json_404(client):
    r = client.get("/api/payroll/periods/999999/summary", headers=ADMIN)
    assert r.status_code == 404
    assert r.get_json()["error"]  # JSON body, not HTML


def test_create_period_requires_dates(client):
    assert client.post("/api/payroll/periods", json={}, headers=ADMIN).status_code == 400


def test_payroll_requires_a_session(app):
    """Previously asserted that payroll had no gate. It does now — pay data was
    readable by anyone who could reach the API."""
    period = _period()
    anon = app.test_client()
    r = anon.get(f"/api/payroll/periods/{period.id}/summary")
    assert r.status_code == 401
