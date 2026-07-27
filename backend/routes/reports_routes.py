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

from models import Call
from utils.auth_utils import require_role
from utils.operational_dates import parse_operational_date, require_valid_date


reports_bp = Blueprint("reports", __name__, url_prefix="/api/reports")

# Analytics is a supervisory view, never dispatcher/HR — matches analytics_routes.
REPORT_ROLES = ("admin", "supervisor")

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
