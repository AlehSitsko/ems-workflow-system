"""Operational reporting over a date range.

The Supervisor Dashboard answers "how is each dispatcher doing"; this module
answers "what did operations look like across a period" — call volume, outcome
mix and service-level split for a chosen start/end, plus a CSV of the underlying
calls for billing, insurance and audit (ROADMAP 5.3).

Admin/supervisor only, same as the dispatcher analytics. Calls are placed on the
period by their `trip_date` (the operational day), so a call with no valid trip
date is not on any day and is excluded — matching how the rest of the app reasons
about operational dates.
"""

import csv
import io
from collections import Counter
from datetime import timedelta

from flask import Blueprint, jsonify, request, Response
from sqlalchemy import or_

from models import db, Call, DailyCrewUnit, CallAssignment, TimeEntry, Employee
from utils.auth_utils import require_role
from utils.operational_dates import parse_operational_date, require_valid_date


reports_bp = Blueprint("reports", __name__, url_prefix="/api/reports")

# Analytics is a supervisory view, never dispatcher/HR — matches analytics_routes.
REPORT_ROLES = ("admin", "supervisor")

# The hours report is payroll-shaped, so HR sees it too (matching payroll_routes),
# while fleet utilisation stays a purely operational/supervisory view.
HOURS_ROLES = ("admin", "supervisor", "hr")

# A guard against an accidental multi-year scan: reporting is period-based, and a
# year of daily buckets is already the widest view the UI offers.
MAX_RANGE_DAYS = 366

# Terminal call outcomes. Everything else is a call still moving through its
# lifecycle (new / assigned / en_route / …), counted in the total but not as an
# outcome.
_COMPLETED = "completed"
_CANCELLED = "cancelled"


def _pct(part, whole):
    """Whole-number percentage, 0 when there is nothing to divide."""
    return round(100 * part / whole) if whole else 0


def _resolve_range():
    """Parse and validate ?start=&end=.

    Returns `((start_date, end_date), None)` on success, or
    `(None, (payload, status))` describing the 400 to return.
    """
    start = request.args.get("start", "")
    end = request.args.get("end", "")

    for value, field in ((start, "start"), (end, "end")):
        invalid = require_valid_date(value, field)
        if invalid:
            return None, invalid

    start_d = parse_operational_date(start)
    end_d = parse_operational_date(end)

    if end_d < start_d:
        return None, ({"error": "end must be on or after start"}, 400)
    if (end_d - start_d).days > MAX_RANGE_DAYS:
        return None, ({"error": f"range must not exceed {MAX_RANGE_DAYS} days"}, 400)

    return (start_d, end_d), None


def _calls_in_range(start_d, end_d):
    """Calls whose operational trip date falls in [start, end], date-ordered.

    ISO date strings sort lexicographically the same as chronologically, so the
    string comparison is a correct range filter and uses the `trip_date` index.
    """
    start, end = start_d.isoformat(), end_d.isoformat()
    return (
        Call.query
        .filter(Call.trip_date >= start, Call.trip_date <= end)
        .order_by(Call.trip_date.asc(), Call.pickup_time.asc(), Call.id.asc())
        .all()
    )


@reports_bp.route("/calls", methods=["GET"])
@require_role(*REPORT_ROLES)
def calls_report():
    """Aggregate call metrics for a date range, for tiles, tables and a chart."""
    rng, invalid = _resolve_range()
    if invalid:
        payload, status = invalid
        return jsonify(payload), status
    start_d, end_d = rng

    calls = _calls_in_range(start_d, end_d)

    total = len(calls)
    by_status = Counter()
    by_service_level = Counter()
    # Every day in the range gets a bucket so the chart is continuous even on
    # days with no calls, rather than skipping straight to the next busy day.
    per_day = {}
    day = start_d
    while day <= end_d:
        per_day[day.isoformat()] = {"total": 0, "completed": 0, "cancelled": 0}
        day += timedelta(days=1)

    completed = cancelled = 0
    for call in calls:
        status = (call.status or "new").strip().lower()
        by_status[status] += 1

        level = (call.service_level or "").strip() or "Unspecified"
        by_service_level[level] += 1

        bucket = per_day.get(call.trip_date)
        if bucket is not None:
            bucket["total"] += 1
            if status == _COMPLETED:
                bucket["completed"] += 1
            elif status == _CANCELLED:
                bucket["cancelled"] += 1

        if status == _COMPLETED:
            completed += 1
        elif status == _CANCELLED:
            cancelled += 1

    return jsonify({
        "range": {
            "start": start_d.isoformat(),
            "end": end_d.isoformat(),
            "days": (end_d - start_d).days + 1,
        },
        "summary": {
            "total_calls": total,
            "completed": completed,
            "cancelled": cancelled,
            "completion_rate": _pct(completed, total),
            "cancellation_rate": _pct(cancelled, total),
        },
        # Sorted high-to-low so the UI can render them as-is; ties broken by name
        # for a stable order across requests.
        "by_status": [
            {"status": k, "count": v}
            for k, v in sorted(by_status.items(), key=lambda kv: (-kv[1], kv[0]))
        ],
        "by_service_level": [
            {"service_level": k, "count": v}
            for k, v in sorted(by_service_level.items(), key=lambda kv: (-kv[1], kv[0]))
        ],
        "by_day": [
            {"date": d, **counts} for d, counts in per_day.items()
        ],
    })


@reports_bp.route("/calls/export", methods=["GET"])
@require_role(*REPORT_ROLES)
def calls_report_export():
    """The calls behind the report as CSV, for billing / insurance / audit.

    Operational fields only — no patient name or clinical detail. Addresses are
    included because billing needs the trip endpoints; the export is restricted
    to admin/supervisor for that reason.
    """
    rng, invalid = _resolve_range()
    if invalid:
        payload, status = invalid
        return jsonify(payload), status
    start_d, end_d = rng

    calls = _calls_in_range(start_d, end_d)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Call ID", "Trip Date", "Status", "Service Level", "Dispatcher",
        "Pickup Time", "Pickup Address", "Dropoff Address",
        "Completed At", "Cancelled At",
    ])
    for c in calls:
        writer.writerow([
            c.id, c.trip_date, c.status or "new", c.service_level or "",
            c.dispatcher_name or "", c.pickup_time or "",
            c.pickup_address or "", c.dropoff_address or "",
            c.completed_at or "", c.cancelled_at or "",
        ])

    filename = f"calls_{start_d.isoformat()}_{end_d.isoformat()}.csv"
    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# ── Fleet utilisation ────────────────────────────────────────────────────────
#
# How hard the fleet was worked over a period: crew units on duty each day against
# the calls they carried. A unit-day is one crewed unit scheduled for one day
# (DailyCrewUnit); "calls per unit" is the load each of those units averaged.

def _assigned_call_ids(start_d, end_d):
    """Ids of calls in the range that were covered by a unit — i.e. currently
    assigned (active) OR carried to completion. Completing a trip deactivates its
    assignment, so an is_active-only filter would drop every finished call and make
    a historical day read as ~0% utilised; a completed call was still covered."""
    start, end = start_d.isoformat(), end_d.isoformat()
    rows = (
        db.session.query(CallAssignment.call_id)
        .join(Call, Call.id == CallAssignment.call_id)
        .filter(or_(CallAssignment.is_active == True, Call.status == "completed"),
                Call.trip_date >= start, Call.trip_date <= end)
        .distinct()
        .all()
    )
    return {r[0] for r in rows}


@reports_bp.route("/utilization", methods=["GET"])
@require_role(*REPORT_ROLES)
def utilization_report():
    """Per-day crew units vs calls carried, plus period averages."""
    rng, invalid = _resolve_range()
    if invalid:
        payload, status = invalid
        return jsonify(payload), status
    start_d, end_d = rng

    calls = _calls_in_range(start_d, end_d)
    assigned_ids = _assigned_call_ids(start_d, end_d)

    units_by_day = Counter()
    for row in (
        db.session.query(DailyCrewUnit.shift_date)
        .filter(DailyCrewUnit.shift_date >= start_d.isoformat(),
                DailyCrewUnit.shift_date <= end_d.isoformat())
        .all()
    ):
        units_by_day[row[0]] += 1

    per_day = {}
    day = start_d
    while day <= end_d:
        per_day[day.isoformat()] = {"units": 0, "calls": 0, "assigned": 0}
        day += timedelta(days=1)
    for d, n in units_by_day.items():
        if d in per_day:
            per_day[d]["units"] = n
    for call in calls:
        bucket = per_day.get(call.trip_date)
        if bucket is not None:
            bucket["calls"] += 1
            if call.id in assigned_ids:
                bucket["assigned"] += 1

    total_unit_days = sum(units_by_day.values())
    total_calls = len(calls)
    total_assigned = len(assigned_ids & {c.id for c in calls})
    days = (end_d - start_d).days + 1

    return jsonify({
        "range": {"start": start_d.isoformat(), "end": end_d.isoformat(), "days": days},
        "summary": {
            "unit_days": total_unit_days,
            "total_calls": total_calls,
            "assigned_calls": total_assigned,
            "assigned_rate": _pct(total_assigned, total_calls),
            "avg_units_per_day": round(total_unit_days / days, 1) if days else 0,
            "avg_calls_per_unit": round(total_calls / total_unit_days, 1) if total_unit_days else 0,
        },
        "by_day": [
            {
                "date": d,
                "units": c["units"],
                "calls": c["calls"],
                "assigned": c["assigned"],
                "calls_per_unit": round(c["calls"] / c["units"], 1) if c["units"] else 0,
            }
            for d, c in per_day.items()
        ],
    })


# ── Staff hours ──────────────────────────────────────────────────────────────
#
# Worked hours per employee over a period, from approved time entries. Payroll
# does the pay-period FLSA maths; this is the plain roll-up for a chosen range,
# for a quick "who worked how much" and a CSV to reconcile against payroll.

def _hours_rows(start_d, end_d):
    """(employee, total_minutes, entry_count, days_worked) per employee that has
    a completed time entry clocking in within the range, hours-worked desc."""
    from routes.payroll_routes import _entry_duration

    # ISO datetimes sort lexicographically, so a string bound on clock_in is a
    # correct date filter; the exclusive upper bound is the day after `end`.
    lower = start_d.isoformat()
    upper = (end_d + timedelta(days=1)).isoformat()
    entries = (
        TimeEntry.query
        .filter(TimeEntry.clock_in >= lower, TimeEntry.clock_in < upper,
                TimeEntry.clock_out.isnot(None))
        .all()
    )

    by_emp = {}
    for e in entries:
        agg = by_emp.setdefault(e.employee_id, {"minutes": 0, "entries": 0, "days": set()})
        agg["minutes"] += _entry_duration(e)
        agg["entries"] += 1
        agg["days"].add(e.clock_in[:10])

    employees = {
        emp.id: emp
        for emp in Employee.query.filter(Employee.id.in_(by_emp.keys())).all()
    } if by_emp else {}

    rows = []
    for emp_id, agg in by_emp.items():
        emp = employees.get(emp_id)
        name = f"{emp.first_name} {emp.last_name}".strip() if emp else f"Employee #{emp_id}"
        rows.append({
            "employee_id": emp_id,
            "name": name,
            "total_hours": round(agg["minutes"] / 60, 2),
            "entries": agg["entries"],
            "days_worked": len(agg["days"]),
        })
    rows.sort(key=lambda r: (-r["total_hours"], r["name"]))
    return rows


@reports_bp.route("/hours", methods=["GET"])
@require_role(*HOURS_ROLES)
def hours_report():
    """Worked hours per employee for a date range, with a period total."""
    rng, invalid = _resolve_range()
    if invalid:
        payload, status = invalid
        return jsonify(payload), status
    start_d, end_d = rng

    rows = _hours_rows(start_d, end_d)
    return jsonify({
        "range": {"start": start_d.isoformat(), "end": end_d.isoformat(),
                  "days": (end_d - start_d).days + 1},
        "summary": {
            "employees": len(rows),
            "total_hours": round(sum(r["total_hours"] for r in rows), 2),
            "total_entries": sum(r["entries"] for r in rows),
        },
        "by_employee": rows,
    })


@reports_bp.route("/hours/export", methods=["GET"])
@require_role(*HOURS_ROLES)
def hours_report_export():
    """The per-employee hours roll-up as CSV, to reconcile against payroll."""
    rng, invalid = _resolve_range()
    if invalid:
        payload, status = invalid
        return jsonify(payload), status
    start_d, end_d = rng

    rows = _hours_rows(start_d, end_d)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Employee ID", "Name", "Total Hours", "Entries", "Days Worked"])
    for r in rows:
        writer.writerow([r["employee_id"], r["name"], r["total_hours"],
                         r["entries"], r["days_worked"]])

    filename = f"hours_{start_d.isoformat()}_{end_d.isoformat()}.csv"
    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
