"""Operational reports: /api/reports/calls and its CSV export.

Covers the role gate (analytics is admin/supervisor only), the date-range
validation, the aggregate maths, and the export's shape.
"""

import pytest

from models import db, Call


def mk_call(trip_date, status="new", service_level="BLS",
            pickup_time="10:00", dispatcher_name="Dana"):
    c = Call(
        trip_date=trip_date, status=status, service_level=service_level,
        pickup_time=pickup_time, dispatcher_name=dispatcher_name,
        call_type="scheduled",
    )
    db.session.add(c)
    db.session.commit()
    return c


# ── Role gate ───────────────────────────────────────────────────────────────

@pytest.mark.parametrize("role", ["dispatcher", "hr"])
def test_reports_are_denied_to_non_supervisory_roles(clients, role):
    assert clients[role].get("/api/reports/calls?start=2026-01-01&end=2026-01-31").status_code == 403
    assert clients[role].get("/api/reports/calls/export?start=2026-01-01&end=2026-01-31").status_code == 403


@pytest.mark.parametrize("role", ["admin", "supervisor"])
def test_reports_are_allowed_for_supervisory_roles(clients, role):
    assert clients[role].get("/api/reports/calls?start=2026-01-01&end=2026-01-31").status_code == 200


def test_reports_require_a_session(anon):
    assert anon.get("/api/reports/calls?start=2026-01-01&end=2026-01-31").status_code == 401


# ── Date-range validation ───────────────────────────────────────────────────

@pytest.mark.parametrize("qs", [
    "start=2026-01-01",                       # missing end
    "end=2026-01-31",                         # missing start
    "start=nope&end=2026-01-31",              # malformed start
    "start=2026-02-30&end=2026-03-01",        # non-existent day
    "start=2026-02-01&end=2026-01-01",        # end before start
    "start=2020-01-01&end=2026-01-01",        # range too wide (> 366 days)
])
def test_bad_ranges_are_rejected(clients, qs):
    assert clients["admin"].get(f"/api/reports/calls?{qs}").status_code == 400


# ── Aggregate maths ─────────────────────────────────────────────────────────

def test_summary_counts_and_rates(clients):
    mk_call("2026-01-10", status="completed")
    mk_call("2026-01-10", status="completed")
    mk_call("2026-01-11", status="cancelled")
    mk_call("2026-01-12", status="new")  # in flight, counted but not an outcome

    body = clients["admin"].get("/api/reports/calls?start=2026-01-01&end=2026-01-31").get_json()
    s = body["summary"]
    assert s["total_calls"] == 4
    assert s["completed"] == 2
    assert s["cancelled"] == 1
    assert s["completion_rate"] == 50    # 2 of 4
    assert s["cancellation_rate"] == 25  # 1 of 4


def test_only_calls_inside_the_range_are_counted(clients):
    mk_call("2026-01-05")               # in
    mk_call("2025-12-31")               # before
    mk_call("2026-02-01")               # after
    mk_call(None)                       # no operational date → excluded

    body = clients["admin"].get("/api/reports/calls?start=2026-01-01&end=2026-01-31").get_json()
    assert body["summary"]["total_calls"] == 1


def test_by_day_is_continuous_including_empty_days(clients):
    mk_call("2026-01-02", status="completed")

    body = clients["admin"].get("/api/reports/calls?start=2026-01-01&end=2026-01-03").get_json()
    by_day = {d["date"]: d for d in body["by_day"]}
    assert set(by_day) == {"2026-01-01", "2026-01-02", "2026-01-03"}
    assert by_day["2026-01-01"]["total"] == 0
    assert by_day["2026-01-02"]["total"] == 1
    assert by_day["2026-01-02"]["completed"] == 1
    assert body["range"]["days"] == 3


def test_breakdowns_by_status_and_service_level(clients):
    mk_call("2026-01-10", status="completed", service_level="ALS")
    mk_call("2026-01-10", status="completed", service_level="BLS")
    mk_call("2026-01-11", status="cancelled", service_level="")  # → Unspecified

    body = clients["admin"].get("/api/reports/calls?start=2026-01-01&end=2026-01-31").get_json()

    status = {r["status"]: r["count"] for r in body["by_status"]}
    assert status == {"completed": 2, "cancelled": 1}

    levels = {r["service_level"]: r["count"] for r in body["by_service_level"]}
    assert levels == {"ALS": 1, "BLS": 1, "Unspecified": 1}
    # Sorted by count descending — the busiest level comes first.
    assert body["by_service_level"][0]["count"] >= body["by_service_level"][-1]["count"]


# ── CSV export ──────────────────────────────────────────────────────────────

def test_export_is_csv_with_a_download_filename(clients):
    mk_call("2026-01-10", status="completed", service_level="ALS")

    resp = clients["admin"].get("/api/reports/calls/export?start=2026-01-01&end=2026-01-31")
    assert resp.status_code == 200
    assert resp.mimetype == "text/csv"
    assert "attachment" in resp.headers["Content-Disposition"]
    assert "calls_2026-01-01_2026-01-31.csv" in resp.headers["Content-Disposition"]

    lines = resp.get_data(as_text=True).strip().splitlines()
    assert lines[0].startswith("Call ID,Trip Date,Status,Service Level")
    assert len(lines) == 2  # header + one call


def test_export_carries_no_patient_identifiers(clients):
    mk_call("2026-01-10")
    header = clients["admin"].get(
        "/api/reports/calls/export?start=2026-01-01&end=2026-01-31"
    ).get_data(as_text=True).splitlines()[0].lower()
    assert "patient" not in header
    assert "name" not in header  # no patient name; "Dispatcher" is staff, allowed
