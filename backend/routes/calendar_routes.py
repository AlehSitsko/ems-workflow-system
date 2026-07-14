"""Unified operational calendar API.

A single read-only endpoint that *aggregates* existing domain entities (calls
and crew shifts) into a stable event contract plus per-day operational
summaries. The calendar never stores its own copy of a call or crew unit — it
derives everything from the live records, so the Dispatch Board and the Calendar
stay one source of truth.

Role filtering happens here, on the backend — the frontend never hides data it
was sent. Authentication is the existing header-based scheme (see
utils/auth_utils); replacing it with real auth is a separate hardening phase.
"""

import re
from datetime import datetime

from flask import Blueprint, jsonify, request
from sqlalchemy.orm import joinedload

from models import db, Call, DailyCrewUnit, CallAssignment
from utils.auth_utils import get_request_role, ALL_ROLES

calendar_bp = Blueprint("calendar", __name__, url_prefix="/api/calendar")

# Cap the queryable window so a single request can't scan an unbounded range.
# 93 days comfortably covers a rendered month grid (max 6 weeks) plus adjacent
# navigation, while keeping the aggregation cheap.
MAX_RANGE_DAYS = 93

# Roles allowed to see patient-operational data (calls, assignments, PHI labels).
# HR intentionally does not — it only receives crew (non-PHI) events.
_OPERATIONAL_ROLES = {"admin", "supervisor", "dispatcher"}


def _parse_iso_date(value):
    """Parse a strict YYYY-MM-DD string to a date, or None if malformed.

    Uses explicit strptime (not datetime.fromisoformat / new Date) so the value
    is treated as a plain local operational date with no timezone shifting.
    """
    if not value or not isinstance(value, str):
        return None
    try:
        return datetime.strptime(value.strip(), "%Y-%m-%d").date()
    except ValueError:
        return None


def _pickup_to_24h(value):
    """Normalize a stored pickup time ("HH:MM" or "H:MM AM/PM") to 24h "HH:MM".

    Returns None when the value is empty or unparseable, so callers can treat a
    missing/invalid pickup time as an all-day / unscheduled event.
    """
    if not value:
        return None
    m = re.match(r"^\s*(\d{1,2}):(\d{2})\s*(AM|PM)?\s*$", value, re.IGNORECASE)
    if not m:
        return None
    hour, minute = int(m.group(1)), int(m.group(2))
    period = (m.group(3) or "").upper()
    if period == "PM" and hour != 12:
        hour += 12
    if period == "AM" and hour == 12:
        hour = 0
    if hour > 23 or minute > 59:
        return None
    return f"{hour:02d}:{minute:02d}"


def _min_crew_for_type(unit_type):
    """Minimum crew size a unit type needs to be considered fully staffed."""
    u = (unit_type or "").upper()
    return 4 if u in ("BLS-4", "BLS-6") else 2


def _crew_ids(unit):
    return [
        uid for uid in (unit.driver_id, unit.medical_id, unit.assist1_id, unit.assist2_id)
        if uid is not None
    ]


def _call_status(call, is_assigned):
    """Derive a stable calendar status from the call's own state + assignment."""
    if call.status == "cancelled":
        return "cancelled"
    if call.status == "completed":
        return "completed"
    return "assigned" if is_assigned else "unassigned"


def _call_priority(call):
    """Coarse priority label derived from call_type (Call has no priority column)."""
    ct = (call.call_type or "").lower()
    if ct == "emergency":
        return "Emergency"
    if ct == "will_call":
        return "Will Call"
    return "Normal"


def _minimized_patient_label(patient):
    """"John D." — first name + last initial only. Never full PHI."""
    if not patient:
        return None
    first = (patient.first_name or "").strip()
    last = (patient.last_name or "").strip()
    if last:
        return f"{first} {last[0]}.".strip()
    return first or None


def _build_call_event(call, unit, include_phi):
    """One scheduled_call event. `unit` is the actively assigned unit or None."""
    is_assigned = unit is not None
    pickup = _pickup_to_24h(call.pickup_time)
    start = f"{call.trip_date}T{pickup}:00" if pickup else None
    status = _call_status(call, is_assigned)

    # Severity: critical for an ALS call on a BLS unit; warning for an
    # unassigned active call or a missing pickup time; otherwise normal.
    als_on_bls = (
        is_assigned
        and (call.service_level or "").upper() == "ALS"
        and (unit.unit_type or "").upper().startswith("BLS")
    )
    if als_on_bls:
        severity = "critical"
    elif status == "unassigned" or pickup is None:
        severity = "warning"
    else:
        severity = "normal"

    metadata = {
        "serviceLevel": call.service_level or "",
        "callType": call.call_type or "",
        "priority": _call_priority(call),
        "isAssigned": is_assigned,
        "missingPickupTime": pickup is None,
        "alsOnBls": als_on_bls,
    }
    if include_phi:
        metadata["patientLabel"] = _minimized_patient_label(getattr(call, "patient", None))

    return {
        "id": f"call:{call.id}",
        "type": "scheduled_call",
        "title": call.service_level or call.call_type or "Transport",
        "date": call.trip_date,
        "start": start,
        "end": None,
        "allDay": pickup is None,
        "status": status,
        "severity": severity,
        "source": "call",
        "sourceId": call.id,
        "assignedUnitId": unit.id if unit else None,
        "assignedUnitNumber": unit.truck_number if unit else None,
        "link": f"/dispatch?date={call.trip_date}&call={call.id}",
        "metadata": metadata,
    }


def _build_crew_event(unit):
    """One crew_shift event derived from a DailyCrewUnit (no PHI)."""
    crew_count = len(_crew_ids(unit))
    min_crew = _min_crew_for_type(unit.unit_type)
    incomplete = crew_count < min_crew and unit.shift_status not in ("completed", "cancelled")

    start = f"{unit.shift_date}T{unit.start_time}:00" if unit.start_time else None
    end = None
    if unit.end_time:
        end_date = unit.end_date or unit.shift_date
        end = f"{end_date}T{unit.end_time}:00"

    raw_status = unit.shift_status or "scheduled"
    status = "planned" if raw_status == "scheduled" else raw_status

    return {
        "id": f"crew_unit:{unit.id}",
        "type": "crew_shift",
        "title": f"Unit {unit.truck_number} — {unit.unit_type}",
        "date": unit.shift_date,
        "start": start,
        "end": end,
        "allDay": start is None,
        "status": status,
        "severity": "warning" if incomplete else "normal",
        "source": "daily_crew_unit",
        "sourceId": unit.id,
        "assignedUnitId": unit.id,
        "assignedUnitNumber": unit.truck_number,
        "link": f"/dispatch?date={unit.shift_date}&unit={unit.id}",
        "metadata": {
            "unitType": unit.unit_type,
            "crewCount": crew_count,
            "minCrew": min_crew,
            "crewComplete": not incomplete,
            "shiftType": unit.shift_type or "day",
            "dispatchStatus": unit.dispatch_status or "available",
        },
    }


def _empty_day_summary():
    return {
        "callsTotal": 0,
        "callsAssigned": 0,
        "callsUnassigned": 0,
        "callsCompleted": 0,
        "callsCancelled": 0,
        "unitsTotal": 0,
        "unitsReady": 0,
        "unitsIncomplete": 0,
        "warningCount": 0,
        "criticalCount": 0,
        "readiness": "empty",
    }


def _finalize_readiness(summary):
    if summary["criticalCount"] > 0:
        summary["readiness"] = "critical"
    elif summary["warningCount"] > 0:
        summary["readiness"] = "warning"
    elif summary["callsTotal"] == 0 and summary["unitsTotal"] == 0:
        summary["readiness"] = "empty"
    else:
        summary["readiness"] = "ready"


@calendar_bp.route("/events", methods=["GET"])
def get_calendar_events():
    # ── Role gate ──────────────────────────────────────────────────────────
    role = get_request_role()
    if role not in ALL_ROLES:
        return jsonify({"error": "Insufficient permissions"}), 403
    include_calls = role in _OPERATIONAL_ROLES

    # ── Range validation ───────────────────────────────────────────────────
    start_raw = request.args.get("start")
    end_raw = request.args.get("end")
    if not start_raw or not end_raw:
        return jsonify({"error": "start and end are required (YYYY-MM-DD)"}), 400

    start = _parse_iso_date(start_raw)
    end = _parse_iso_date(end_raw)
    if start is None or end is None:
        return jsonify({"error": "start and end must be valid YYYY-MM-DD dates"}), 400
    if end < start:
        return jsonify({"error": "end must not be before start"}), 400
    if (end - start).days > MAX_RANGE_DAYS:
        return jsonify({"error": f"range must not exceed {MAX_RANGE_DAYS} days"}), 400

    start_str, end_str = start.isoformat(), end.isoformat()

    # ── Bounded queries (no N+1) ───────────────────────────────────────────
    # YYYY-MM-DD sorts lexicographically, so string range filtering is correct
    # and uses the existing trip_date / shift_date indexes.
    units = (
        DailyCrewUnit.query
        .filter(DailyCrewUnit.shift_date >= start_str, DailyCrewUnit.shift_date <= end_str)
        .order_by(DailyCrewUnit.shift_date, DailyCrewUnit.truck_number)
        .all()
    )
    unit_by_id = {u.id: u for u in units}

    calls = []
    assign_unit_by_call = {}
    if include_calls:
        calls = (
            Call.query
            .filter(
                Call.trip_date.isnot(None),
                Call.trip_date >= start_str,
                Call.trip_date <= end_str,
            )
            .options(joinedload(Call.patient))
            .order_by(Call.trip_date, Call.pickup_time)
            .all()
        )
        call_ids = [c.id for c in calls]
        if call_ids:
            assignments = (
                CallAssignment.query
                .filter(CallAssignment.call_id.in_(call_ids), CallAssignment.is_active.is_(True))
                .all()
            )
            assign_unit_by_call = {a.call_id: a.unit_id for a in assignments}
            # An assigned unit is normally in the same date range, but fetch any
            # stragglers in one extra query rather than per-call.
            missing = {uid for uid in assign_unit_by_call.values() if uid not in unit_by_id}
            if missing:
                for u in DailyCrewUnit.query.filter(DailyCrewUnit.id.in_(missing)).all():
                    unit_by_id[u.id] = u

    # ── Build events + per-day summaries ───────────────────────────────────
    events = []
    days = {}

    def _day(date_str):
        if date_str not in days:
            days[date_str] = _empty_day_summary()
        return days[date_str]

    for call in calls:
        unit = unit_by_id.get(assign_unit_by_call.get(call.id))
        event = _build_call_event(call, unit, include_phi=include_calls)
        events.append(event)

        summary = _day(call.trip_date)
        summary["callsTotal"] += 1
        if event["status"] == "cancelled":
            summary["callsCancelled"] += 1
        elif event["status"] == "completed":
            summary["callsCompleted"] += 1
        elif event["status"] == "assigned":
            summary["callsAssigned"] += 1
            if event["metadata"]["alsOnBls"]:
                summary["criticalCount"] += 1
        else:  # unassigned
            summary["callsUnassigned"] += 1
            summary["warningCount"] += 1
        # Missing pickup time on an active call is a soft warning.
        if event["metadata"]["missingPickupTime"] and event["status"] in ("assigned", "unassigned"):
            summary["warningCount"] += 1

    # Employee double-booking (same person in 2+ units on a day) is a reliable
    # critical conflict independent of call data, so it is computed for all roles.
    emp_seen_by_day = {}
    for unit in units:
        event = _build_crew_event(unit)
        events.append(event)

        summary = _day(unit.shift_date)
        summary["unitsTotal"] += 1
        if event["metadata"]["crewComplete"]:
            summary["unitsReady"] += 1
        else:
            summary["unitsIncomplete"] += 1
            summary["warningCount"] += 1

        seen = emp_seen_by_day.setdefault(unit.shift_date, {})
        for eid in _crew_ids(unit):
            seen[eid] = seen.get(eid, 0) + 1

    for date_str, seen in emp_seen_by_day.items():
        double_booked = sum(1 for count in seen.values() if count > 1)
        if double_booked:
            _day(date_str)["criticalCount"] += double_booked

    for summary in days.values():
        _finalize_readiness(summary)

    return jsonify({
        "start": start_str,
        "end": end_str,
        "events": events,
        "days": days,
    })
