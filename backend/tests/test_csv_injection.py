"""CSV / spreadsheet formula-injection guard — unit + per-endpoint integration.

`utils/csv_utils.csv_safe` neutralizes a cell that would be parsed as a formula;
`csv_safe_row` is the single guard applied to every CSV export. These tests prove
the guard at the unit level AND that every registered CSV export endpoint emits a
dangerous user value as neutralized text — parsed back with `csv.reader`, never a
raw substring search.

Endpoints: reports calls/export, hours/export, punctuality/export (dispatcher),
call-log/export; payroll export (generic / gusto / adp).

Run: pytest backend/tests/test_csv_injection.py -v
"""

import csv
import io

import pytest

from utils.csv_utils import csv_safe, csv_safe_row
from models import (
    db, Call, Employee, TimeEntry, PayPeriod, DailyCrewUnit, CallAssignment,
)

DANGEROUS = "=cmd|'/c calc'!A1"
IN_RANGE = "2026-08-15"
START, END = "2026-08-01", "2026-08-31"


# ── unit: csv_safe policy ─────────────────────────────────────────────────────

@pytest.mark.parametrize("raw,expected", [
    ("=cmd|calc", "'=cmd|calc"),
    ("+1+1", "'+1+1"),
    ("-2+3", "'-2+3"),
    ("@SUM(A1)", "'@SUM(A1)"),
    ("\t=x", "'\t=x"),
    ("\r=x", "'\r=x"),
    ("\n=x", "'\n=x"),
    ("   =SUM(A1)", "'   =SUM(A1)"),      # leading spaces before a trigger -> quoted
    ("Normal Name", "Normal Name"),        # untouched
    ("O'Brien", "O'Brien"),                # apostrophe mid-string untouched
    ("123 Main St", "123 Main St"),        # leading digit safe
    ("", ""),                              # empty untouched
])
def test_csv_safe_policy(raw, expected):
    assert csv_safe(raw) == expected


def test_csv_safe_passes_non_strings_through():
    assert csv_safe(42) == 42
    assert csv_safe(None) is None
    assert csv_safe(3.14) == 3.14


def test_csv_safe_row_guards_every_cell():
    assert csv_safe_row(["=a", 5, "+b", None, "ok"]) == ["'=a", 5, "'+b", None, "ok"]


# ── helpers ──────────────────────────────────────────────────────────────────

def _reader(resp):
    assert resp.status_code == 200, resp.get_data(as_text=True)
    return list(csv.reader(io.StringIO(resp.get_data(as_text=True))))


def _assert_no_active_formula(rows):
    """No data cell may begin with a live formula trigger (a neutralized cell begins
    with the literal single quote instead)."""
    for row in rows[1:]:               # skip header
        for cell in row:
            assert not cell[:1] in ("=", "+", "-", "@", "\t", "\r", "\n"), f"unguarded: {cell!r}"


def _assert_cell_contains_quoted(rows, needle):
    joined = "\n".join(",".join(r) for r in rows)
    assert "'" + needle in joined, f"expected neutralized {needle!r} in:\n{joined}"


def _seed_call(**over):
    c = Call(trip_date=IN_RANGE, status="completed", **over)
    db.session.add(c); db.session.commit()
    return c


def _seed_employee_with_hours(first_name="=cmd", employee_number=None):
    e = Employee(first_name=first_name, last_name="X", employee_number=employee_number)
    db.session.add(e); db.session.flush()
    db.session.add(TimeEntry(employee_id=e.id,
                             clock_in=f"{IN_RANGE}T08:00:00", clock_out=f"{IN_RANGE}T16:00:00"))
    db.session.commit()
    return e


# ── integration: reports exports ──────────────────────────────────────────────

def test_calls_export_neutralizes_addresses(clients, app):
    _seed_call(pickup_address=DANGEROUS, dropoff_address="Springfield Memorial",
               dispatcher_name="=HYPERLINK(\"http://evil\")", service_level="ALS", pickup_time="10:00")
    rows = _reader(clients["admin"].get(f"/api/reports/calls/export?start={START}&end={END}"))
    _assert_no_active_formula(rows)
    _assert_cell_contains_quoted(rows, "=cmd|")


def test_call_log_export_neutralizes_all_string_fields(clients, app):
    _seed_call(pickup_address=DANGEROUS, dropoff_address="+SUM(A1)",
               dispatcher_name="@evil", service_level="-ALS", call_type="=x", pickup_time="10:00")
    rows = _reader(clients["admin"].get(f"/api/reports/call-log/export?start={START}&end={END}"))
    _assert_no_active_formula(rows)
    _assert_cell_contains_quoted(rows, "=cmd|")


def test_hours_export_neutralizes_employee_name(clients, app):
    _seed_employee_with_hours(first_name="=cmd")
    rows = _reader(clients["admin"].get(f"/api/reports/hours/export?start={START}&end={END}"))
    _assert_no_active_formula(rows)
    _assert_cell_contains_quoted(rows, "=cmd")


def test_punctuality_export_dispatcher_neutralizes_label(clients, app):
    c = _seed_call(pickup_time="10:00", arrived_pickup_at=f"{IN_RANGE}T10:30:00",
                   appointment_time="10:15")
    unit = DailyCrewUnit(shift_date=IN_RANGE, truck_number="1", start_time="08:00", unit_type="ALS")
    db.session.add(unit); db.session.flush()
    db.session.add(CallAssignment(call_id=c.id, unit_id=unit.id, assigned_by=DANGEROUS))
    db.session.commit()
    rows = _reader(clients["admin"].get(
        f"/api/reports/punctuality/export?start={START}&end={END}&groupBy=dispatcher"))
    _assert_no_active_formula(rows)
    _assert_cell_contains_quoted(rows, "=cmd|")


# ── integration: payroll exports (generic / gusto / adp) ─────────────────────

def _payroll(clients, fmt, **emp):
    e = _seed_employee_with_hours(**emp)
    period = PayPeriod(start_date=START, end_date=END, status="open")
    db.session.add(period); db.session.commit()
    resp = clients["admin"].get(f"/api/payroll/export?period_id={period.id}&format={fmt}")
    return _reader(resp), e


def test_payroll_generic_export_neutralizes_name(clients, app):
    rows, _ = _payroll(clients, "csv", first_name="=cmd")
    _assert_no_active_formula(rows)
    _assert_cell_contains_quoted(rows, "=cmd")


def test_payroll_gusto_export_neutralizes_name(clients, app):
    rows, _ = _payroll(clients, "gusto", first_name="=cmd")
    _assert_no_active_formula(rows)
    _assert_cell_contains_quoted(rows, "=cmd")


def test_payroll_adp_export_neutralizes_employee_number(clients, app):
    # the ADP File # column is the employee_number — the gap v1.1.14 missed
    rows, _ = _payroll(clients, "adp", first_name="Joe", employee_number="=cmd")
    _assert_no_active_formula(rows)
    _assert_cell_contains_quoted(rows, "=cmd")


# ── RBAC on an export (isolation covered by test_tenant_isolation) ───────────

def test_export_rbac(clients, app):
    # calls/call-log exports are admin/supervisor only
    assert clients["dispatcher"].get(f"/api/reports/calls/export?start={START}&end={END}").status_code == 403
    assert clients["hr"].get(f"/api/reports/call-log/export?start={START}&end={END}").status_code == 403


# ── regression: a battery of dangerous values, all neutralized ───────────────

@pytest.mark.parametrize("payload", [
    "=1+1", "+1+1", "-1+1", "@A1", "=cmd|'/c calc'!A1", "   =SUM(1)", "\t=SUM(1)",
    "=HYPERLINK(\"http://x\",\"y\")",
])
def test_calls_export_regression_battery(clients, app, payload):
    _seed_call(pickup_address=payload, pickup_time="10:00")
    rows = _reader(clients["admin"].get(f"/api/reports/calls/export?start={START}&end={END}"))
    _assert_no_active_formula(rows)
