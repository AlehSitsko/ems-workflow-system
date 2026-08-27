"""CSV / spreadsheet formula-injection guard (utils/csv_utils.csv_safe) and its
wiring into the reports calls-export.

A cell of user-controlled text (a patient/dispatcher name, an address) that begins
with a formula trigger must be neutralized so a spreadsheet treats it as text, not
a live formula.

Run: pytest backend/tests/test_csv_injection.py -v
"""

import pytest

from utils.csv_utils import csv_safe
from models import db, Call


@pytest.mark.parametrize("raw,expected", [
    ("=cmd|'/c calc'!A1", "'=cmd|'/c calc'!A1"),
    ("+1+1", "'+1+1"),
    ("-2+3", "'-2+3"),
    ("@SUM(A1)", "'@SUM(A1)"),
    ("\tTabbed", "'\tTabbed"),
    ("\rCarriage", "'\rCarriage"),
    ("Normal Name", "Normal Name"),        # untouched
    ("123 Main St", "123 Main St"),         # leading digit is safe
    ("", ""),                               # empty untouched
])
def test_csv_safe_neutralizes_formula_triggers(raw, expected):
    assert csv_safe(raw) == expected


def test_csv_safe_passes_non_strings_through():
    assert csv_safe(42) == 42
    assert csv_safe(None) is None
    assert csv_safe(3.14) == 3.14


def test_calls_export_neutralizes_a_formula_address(clients, app):
    # A call whose address was crafted as a formula must be quoted in the export.
    db.session.add(Call(
        trip_date="2026-08-15", status="completed", service_level="ALS",
        dispatcher_name="=HYPERLINK(\"http://evil\")", pickup_time="10:00",
        pickup_address="=cmd|calc", dropoff_address="Springfield Memorial",
    ))
    db.session.commit()

    resp = clients["admin"].get("/api/reports/calls/export?start=2026-08-01&end=2026-08-31")
    assert resp.status_code == 200
    body = resp.get_data(as_text=True)
    # the dangerous cells are single-quote-prefixed; the raw formula is not present bare
    assert "'=cmd|calc" in body
    assert "'=HYPERLINK" in body
