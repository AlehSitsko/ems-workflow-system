"""PTO accrual, balances and holiday-aware deduction.

The balance is the sum of an employee's ledger deltas — never a stored number — so
accruals, spent leave, year-end carryover and manual corrections are all auditable
and reversible.

Policy (agreed): monthly accrual (annual / 12); vacation + personal draw from PTO;
a partial day counts as 0.5; over-draw is allowed (advisory) so the balance may go
negative; unused days carry over up to a per-org cap. Holidays (and weekends) inside
a leave range do not spend PTO.

Everything here is org-aware through the ORM tenant filter: `Employee`, `Holiday`
and `PtoLedgerEntry` are all org-scoped, so a request/endpoint that has set the
current org only ever accrues or reads its own organisation.
"""

import json
from datetime import date, datetime

from sqlalchemy import func

from models import db, Employee, Holiday, PtoLedgerEntry, Organization


# Leave types that spend PTO. Sick / medical / bereavement / unpaid / training /
# administrative do not touch the balance.
PTO_DRAWING = {"vacation", "personal"}

DEFAULT_ANNUAL_DAYS = 15.0
DEFAULT_CARRYOVER_CAP = 5.0


def _now_iso():
    return datetime.now().isoformat(timespec="seconds")


def _org_pto_config():
    """The current org's {annualDays, carryoverCapDays}, with defaults."""
    from tenant import current_org_id
    annual, cap = DEFAULT_ANNUAL_DAYS, DEFAULT_CARRYOVER_CAP
    oid = current_org_id()
    if oid is not None:
        org = Organization.query.get(oid)
        if org and org.settings_json:
            try:
                pto = (json.loads(org.settings_json) or {}).get("pto") or {}
                if pto.get("annualDays") is not None:
                    annual = float(pto["annualDays"])
                if pto.get("carryoverCapDays") is not None:
                    cap = float(pto["carryoverCapDays"])
            except (ValueError, TypeError):
                pass
    return annual, cap


def annual_days(employee):
    """The employee's annual allotment — their own value, else the org default."""
    if employee.pto_annual_days is not None:
        return float(employee.pto_annual_days)
    return _org_pto_config()[0]


# ── Business days ─────────────────────────────────────────────────────────────

def holiday_dates():
    """The set of the current org's holiday dates (YYYY-MM-DD)."""
    return {h.date for h in Holiday.query.all()}


def _to_date(value):
    try:
        return date.fromisoformat(value)
    except (ValueError, TypeError):
        return None


def business_days(leave, holidays=None):
    """Working days a leave spends: weekdays in [start, end] that are not holidays.
    A single partial day (a start/end time on one date) counts as 0.5."""
    holidays = holidays if holidays is not None else holiday_dates()
    start, end = _to_date(leave.start_date), _to_date(leave.end_date)
    if not start or not end or end < start:
        return 0.0
    if leave.start_date == leave.end_date and (leave.start_time or leave.end_time):
        return 0.5
    count = 0
    cur = start
    while cur <= end:
        if cur.weekday() < 5 and cur.isoformat() not in holidays:
            count += 1
        cur = date.fromordinal(cur.toordinal() + 1)
    return float(count)


# ── Balance + ledger ─────────────────────────────────────────────────────────

def pto_balance(employee_id):
    """Current balance = sum of the employee's ledger deltas."""
    total = db.session.query(func.coalesce(func.sum(PtoLedgerEntry.delta_days), 0.0)) \
        .filter(PtoLedgerEntry.employee_id == employee_id).scalar()
    return round(float(total or 0.0), 2)


def _balance_as_of(employee_id, iso_date):
    total = db.session.query(func.coalesce(func.sum(PtoLedgerEntry.delta_days), 0.0)) \
        .filter(PtoLedgerEntry.employee_id == employee_id,
                PtoLedgerEntry.effective_date <= iso_date).scalar()
    return float(total or 0.0)


def _post(employee_id, delta, kind, effective_date, period=None, note=None,
          created_by=None, leave_request_id=None):
    entry = PtoLedgerEntry(
        employee_id=employee_id, delta_days=round(float(delta), 4), kind=kind,
        effective_date=effective_date, period=period, note=note,
        leave_request_id=leave_request_id, created_at=_now_iso(), created_by=created_by,
    )
    db.session.add(entry)
    db.session.flush()   # so subsequent balance reads in the same run see it
    return entry


# ── Deduction on leave ────────────────────────────────────────────────────────

def deduct_for_leave(leave, created_by=None):
    """Spend PTO for an approved leave (idempotent per leave). Returns the days
    spent, or None when the leave type does not draw PTO."""
    if leave.leave_type not in PTO_DRAWING:
        return None
    existing = PtoLedgerEntry.query.filter_by(leave_request_id=leave.id, kind="used").first()
    if existing:
        return -existing.delta_days
    days = business_days(leave)
    if days <= 0:
        return 0.0
    _post(leave.employee_id, -days, "used", leave.start_date,
          note=f"{leave.leave_type} {leave.start_date}–{leave.end_date}",
          created_by=created_by, leave_request_id=leave.id)
    return days


def reverse_leave(leave):
    """Undo the PTO a leave spent (on cancel/deny of a previously-approved leave)."""
    rows = PtoLedgerEntry.query.filter_by(leave_request_id=leave.id, kind="used").all()
    for row in rows:
        db.session.delete(row)
    return len(rows)


def record_adjustment(employee_id, delta_days, note=None, created_by=None):
    """Post a manual balance correction. Flushes only — the caller commits."""
    return _post(employee_id, delta_days, "adjustment", date.today().isoformat(),
                 note=note, created_by=created_by)


# ── Monthly accrual + carryover ───────────────────────────────────────────────

def _month_iter(start, end):
    """Yield (year, month) from `start` to `end` inclusive (both `date`s at day 1)."""
    y, m = start.year, start.month
    while (y, m) <= (end.year, end.month):
        yield y, m
        m += 1
        if m > 12:
            y, m = y + 1, 1


def _accrual_exists(employee_id, period):
    return PtoLedgerEntry.query.filter_by(
        employee_id=employee_id, kind="accrual", period=period).first() is not None


def _carryover_period(year):
    return f"{year}-00"   # distinct from any real YYYY-MM month period


def _ensure_carryover(employee, year, cap, created_by):
    period = _carryover_period(year)
    if PtoLedgerEntry.query.filter_by(
            employee_id=employee.id, kind="carryover", period=period).first():
        return None
    prior_balance = _balance_as_of(employee.id, f"{year - 1}-12-31")
    if prior_balance > cap:
        return _post(employee.id, -(prior_balance - cap), "carryover",
                     f"{year}-01-01", period=period,
                     note=f"carryover cap {cap}", created_by=created_by)
    # Post a zero marker so we don't recompute this year again? No — skipping is
    # cheap and idempotent (the query above dedups on a real entry only). Return.
    return None


def accrue_through(today=None, created_by=None):
    """Post monthly accruals (and year-end carryover) for every active employee up
    to `today`. Idempotent: a month already accrued, or a carryover already taken,
    is never posted twice. Returns the list of entries posted this run."""
    today = today or date.today()
    _, cap = _org_pto_config()
    posted = []

    employees = Employee.query.filter_by(is_active=True).all()
    for emp in employees:
        hire = _to_date(emp.hire_date)
        if not hire:
            continue  # no start date → nothing to accrue from
        monthly = annual_days(emp) / 12.0
        start = date(hire.year, hire.month, 1)
        end = date(today.year, today.month, 1)
        for year, month in _month_iter(start, end):
            # At the first month of a year after the hire year, trim last year's
            # balance to the carryover cap before that year's accruals accumulate.
            if month == 1 and year > hire.year:
                co = _ensure_carryover(emp, year, cap, created_by)
                if co:
                    posted.append(co)
            period = f"{year}-{month:02d}"
            if _accrual_exists(emp.id, period):
                continue
            eff = f"{year}-{month:02d}-01"
            posted.append(_post(emp.id, monthly, "accrual", eff, period=period,
                                note="monthly accrual", created_by=created_by))

    db.session.commit()
    return posted
