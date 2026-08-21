"""Operational reports: /api/reports/calls and its CSV export.

Covers the role gate (analytics is admin/supervisor only), the date-range
validation, the aggregate maths, and the export's shape.
"""

import pytest

from models import db, Call, DailyCrewUnit, CallAssignment, TimeEntry, Employee


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


def mk_unit(shift_date, truck="M1"):
    u = DailyCrewUnit(shift_date=shift_date, unit_type="BLS",
                      truck_number=truck, start_time="08:00")
    db.session.add(u)
    db.session.commit()
    return u


def assign(call, unit, active=True):
    a = CallAssignment(call_id=call.id, unit_id=unit.id, is_active=active)
    db.session.add(a)
    db.session.commit()
    return a


def mk_employee(first="Pat", last="Rider"):
    e = Employee(first_name=first, last_name=last, role="EMT", status="active", is_active=True)
    db.session.add(e)
    db.session.commit()
    return e


def mk_entry(employee, day, hours=8, break_minutes=30, clock_out=True):
    clock_in = f"{day}T08:00:00"
    co = f"{day}T{8 + hours:02d}:00:00" if clock_out else None
    t = TimeEntry(employee_id=employee.id, clock_in=clock_in, clock_out=co,
                  break_minutes=break_minutes)
    db.session.add(t)
    db.session.commit()
    return t


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


# ── Fleet utilisation ────────────────────────────────────────────────────────

@pytest.mark.parametrize("role", ["dispatcher", "hr"])
def test_utilization_is_supervisory_only(clients, role):
    assert clients[role].get("/api/reports/utilization?start=2026-01-01&end=2026-01-31").status_code == 403


def test_utilization_counts_units_calls_and_load(clients):
    mk_unit("2026-01-10")
    mk_unit("2026-01-10")            # two units on duty that day
    c1 = mk_call("2026-01-10", status="completed")
    c2 = mk_call("2026-01-10", status="new")
    mk_unit("2026-01-11")           # a unit but no calls
    assign(c1, DailyCrewUnit.query.first())   # one call covered

    body = clients["admin"].get(
        "/api/reports/utilization?start=2026-01-10&end=2026-01-11").get_json()
    s = body["summary"]
    assert s["unit_days"] == 3          # 2 + 1
    assert s["total_calls"] == 2
    assert s["assigned_calls"] == 1
    assert s["assigned_rate"] == 50
    assert s["avg_calls_per_unit"] == round(2 / 3, 1)

    by_day = {d["date"]: d for d in body["by_day"]}
    assert by_day["2026-01-10"]["units"] == 2
    assert by_day["2026-01-10"]["calls"] == 2
    assert by_day["2026-01-10"]["calls_per_unit"] == 1.0
    assert by_day["2026-01-11"]["units"] == 1
    assert by_day["2026-01-11"]["calls"] == 0
    assert by_day["2026-01-11"]["calls_per_unit"] == 0


def test_utilization_counts_completed_trips_after_assignment_deactivated(clients):
    """D5 regression: completing a trip deactivates its assignment, but the call
    was still covered by a unit — a historical day must not read as 0% utilised."""
    mk_unit("2026-02-05")
    done = mk_call("2026-02-05", status="completed")
    assign(done, DailyCrewUnit.query.first(), active=False)   # completed → inactive

    s = clients["admin"].get(
        "/api/reports/utilization?start=2026-02-05&end=2026-02-05").get_json()["summary"]
    assert s["total_calls"] == 1
    assert s["assigned_calls"] == 1        # covered, despite the inactive assignment
    assert s["assigned_rate"] == 100


# ── Staff hours ──────────────────────────────────────────────────────────────

def test_hours_report_is_denied_to_dispatcher_but_allowed_for_hr(clients):
    assert clients["dispatcher"].get("/api/reports/hours?start=2026-01-01&end=2026-01-31").status_code == 403
    assert clients["hr"].get("/api/reports/hours?start=2026-01-01&end=2026-01-31").status_code == 200


def test_hours_sum_per_employee_net_of_breaks(clients):
    a = mk_employee("Ann", "Ng")
    b = mk_employee("Bo", "Lee")
    mk_entry(a, "2026-01-10", hours=8, break_minutes=30)   # 7.5h
    mk_entry(a, "2026-01-11", hours=4, break_minutes=0)    # 4h
    mk_entry(b, "2026-01-10", hours=8, break_minutes=0)    # 8h
    mk_entry(b, "2026-01-12", clock_out=False)             # still clocked in → excluded

    body = clients["admin"].get(
        "/api/reports/hours?start=2026-01-01&end=2026-01-31").get_json()
    assert body["summary"]["employees"] == 2
    assert body["summary"]["total_hours"] == 19.5   # 11.5 + 8
    rows = {r["name"]: r for r in body["by_employee"]}
    assert rows["Ann Ng"]["total_hours"] == 11.5
    assert rows["Ann Ng"]["days_worked"] == 2
    assert rows["Bo Lee"]["total_hours"] == 8.0
    # Sorted hours-desc: the busiest employee is first.
    assert body["by_employee"][0]["total_hours"] >= body["by_employee"][-1]["total_hours"]


def test_hours_only_counts_entries_clocking_in_within_the_range(clients):
    e = mk_employee("Sam", "Cruz")
    mk_entry(e, "2026-01-10", hours=8, break_minutes=0)   # in → 8h
    mk_entry(e, "2025-12-31", hours=8, break_minutes=0)   # before → excluded

    body = clients["admin"].get(
        "/api/reports/hours?start=2026-01-01&end=2026-01-31").get_json()
    assert body["summary"]["total_hours"] == 8.0


def test_hours_export_is_csv(clients):
    e = mk_employee("Rae", "Ng")
    mk_entry(e, "2026-01-10", hours=8, break_minutes=0)

    resp = clients["hr"].get("/api/reports/hours/export?start=2026-01-01&end=2026-01-31")
    assert resp.status_code == 200
    assert resp.mimetype == "text/csv"
    assert "hours_2026-01-01_2026-01-31.csv" in resp.headers["Content-Disposition"]
    lines = resp.get_data(as_text=True).strip().splitlines()
    assert lines[0].startswith("Employee ID,Name,Total Hours")
    assert len(lines) == 2


# ── Punctuality ───────────────────────────────────────────────────────────────

def test_punctuality_by_driver_counts_late_against_grace(clients):
    drv = mk_employee("Dana", "Driver")
    unit = mk_unit("2026-03-02", truck="M7")
    unit.driver_id = drv.id
    db.session.commit()

    late = mk_call("2026-03-02", status="completed", pickup_time="09:00")
    late.arrived_pickup_at = "2026-03-02T09:30:00"     # 30 min → late
    ontime = mk_call("2026-03-02", status="completed", pickup_time="10:00")
    ontime.arrived_pickup_at = "2026-03-02T10:02:00"   # 2 min → within grace
    db.session.commit()
    assign(late, unit)
    assign(ontime, unit)

    r = clients["supervisor"].get(
        "/api/reports/punctuality?start=2026-03-02&end=2026-03-02&groupBy=driver")
    assert r.status_code == 200
    body = r.get_json()
    assert body["graceMinutes"] == 5
    row = next(x for x in body["rows"] if x["label"] == "Dana Driver")
    assert row["pickup"]["measured"] == 2
    assert row["pickup"]["late"] == 1
    assert row["pickup"]["onTimeRate"] == 50
    assert row["pickup"]["maxLateMinutes"] == 30


def test_punctuality_dispatcher_group_is_management_only(clients):
    qs = "start=2026-03-02&end=2026-03-02"
    # Rating dispatchers: supervisor yes, dispatcher no.
    assert clients["supervisor"].get(f"/api/reports/punctuality?{qs}&groupBy=dispatcher").status_code == 200
    assert clients["dispatcher"].get(f"/api/reports/punctuality?{qs}&groupBy=dispatcher").status_code == 403
    # Driver punctuality is visible to dispatchers too.
    assert clients["dispatcher"].get(f"/api/reports/punctuality?{qs}&groupBy=driver").status_code == 200
    # HR is outside the analytics roles entirely.
    assert clients["hr"].get(f"/api/reports/punctuality?{qs}&groupBy=driver").status_code == 403


def test_punctuality_rejects_bad_group_by(clients):
    r = clients["admin"].get("/api/reports/punctuality?start=2026-03-02&end=2026-03-02&groupBy=nope")
    assert r.status_code == 400
