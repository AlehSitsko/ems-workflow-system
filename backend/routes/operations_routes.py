"""Closing the operational day (roadmap Phase 4).

A past date is already read-only — see utils.operational_dates — so closing a day
is not a lock. It is the handoff: a review of what the day actually ended up as,
the loose ends nobody tidied, and a name against the statement that it was
checked.

The loose ends matter more than the totals. A call left "assigned" on a day that
has ended never happened or never got recorded, and a shift with no actual end
time cannot be paid accurately. Both are invisible on a board that only shows
today, which is exactly how they survive to become a problem a week later.
"""

from datetime import datetime

from flask import Blueprint, jsonify, request

from models import db, Call, DailyCrewUnit, CallAssignment, OperationalDayClosure
from utils.auth_utils import require_role, get_request_user_id, get_request_user_name
from utils.validation_utils import is_valid_date, check_length
from utils.operational_dates import operational_mode, HISTORY, LIVE
from audit_utils import log_action


operations_bp = Blueprint("operations", __name__, url_prefix="/api/operations")

VIEW_ROLES = ("admin", "supervisor", "dispatcher")
# Closing a day is a supervisory sign-off, not routine dispatch work.
CLOSE_ROLES = ("admin", "supervisor")

# A call in one of these states on a finished day was never resolved either way.
_UNFINISHED_CALL_STATUSES = ("new", "assigned", "in_progress", "en_route", "on_scene")
_FINISHED_SHIFT_STATUSES = ("completed", "cancelled")


def _unfinished_call_reason(call, has_unit):
    """Why this call is a loose end, in the words the reviewer needs.

    A status of "assigned" with no active assignment row is itself a
    contradiction, so it is reported as one rather than as "never assigned",
    which would read as though the status were wrong.
    """
    if has_unit:
        return "Assigned but never completed"
    if call.status == "new":
        return "Never assigned to a unit"
    return f"Marked {call.status} but no unit is linked"


def _day_report(day):
    """Everything the closing screen needs: counts plus the specific loose ends."""
    calls = Call.query.filter(Call.trip_date == day).all()
    units = DailyCrewUnit.query.filter(DailyCrewUnit.shift_date == day).all()

    assigned_unit_by_call = {}
    if calls:
        rows = (CallAssignment.query
                .filter(CallAssignment.call_id.in_([c.id for c in calls]),
                        CallAssignment.is_active.is_(True))
                .all())
        assigned_unit_by_call = {r.call_id: r.unit_id for r in rows}

    unfinished_calls = [
        {
            "id": c.id,
            "pickupTime": c.pickup_time or "",
            "status": c.status,
            "assignedUnitId": assigned_unit_by_call.get(c.id),
            "reason": _unfinished_call_reason(c, c.id in assigned_unit_by_call),
        }
        for c in calls if c.status in _UNFINISHED_CALL_STATUSES
    ]

    # A shift that never recorded an actual end cannot be paid accurately.
    unfinished_units = [
        {
            "id": u.id,
            "truckNumber": u.truck_number,
            "shiftStatus": u.shift_status or "scheduled",
            "reason": ("Shift never marked complete" if u.shift_status not in _FINISHED_SHIFT_STATUSES
                       else "No actual end time recorded"),
        }
        for u in units
        if u.shift_status not in _FINISHED_SHIFT_STATUSES or not u.actual_end_time
    ]

    closure = OperationalDayClosure.query.filter_by(day=day).first()

    return {
        "day": day,
        "mode": operational_mode(day),
        "closure": closure.to_dict() if closure else None,
        "summary": {
            "callsTotal": len(calls),
            "callsCompleted": sum(1 for c in calls if c.status == "completed"),
            "callsCancelled": sum(1 for c in calls if c.status == "cancelled"),
            "callsUnfinished": len(unfinished_calls),
            "unitsTotal": len(units),
            "unitsUnfinished": len(unfinished_units),
        },
        "looseEnds": {
            "calls": unfinished_calls,
            "units": unfinished_units,
        },
    }


@operations_bp.route("/days/<day>", methods=["GET"])
@require_role(*VIEW_ROLES)
def get_day(day):
    """The day's closing report, whether or not it has been closed."""
    if not is_valid_date(day):
        return jsonify({"error": "day must be a real date (YYYY-MM-DD)"}), 400
    return jsonify(_day_report(day))


@operations_bp.route("/days", methods=["GET"])
@require_role(*VIEW_ROLES)
def list_closures():
    """Closed days, newest first — the handoff history."""
    start = request.args.get("start", "").strip()
    end = request.args.get("end", "").strip()

    query = OperationalDayClosure.query
    if start:
        if not is_valid_date(start):
            return jsonify({"error": "start must be a real date (YYYY-MM-DD)"}), 400
        query = query.filter(OperationalDayClosure.day >= start)
    if end:
        if not is_valid_date(end):
            return jsonify({"error": "end must be a real date (YYYY-MM-DD)"}), 400
        query = query.filter(OperationalDayClosure.day <= end)

    closures = query.order_by(OperationalDayClosure.day.desc()).limit(200).all()
    return jsonify([c.to_dict() for c in closures])


@operations_bp.route("/days/<day>/close", methods=["POST"])
@require_role(*CLOSE_ROLES)
def close_day(day):
    """Sign the day off, recording what it looked like at that moment.

    A day with loose ends can still be closed — sometimes the answer really is
    "the crew went home, we'll reconcile Monday" — but not by accident: the
    caller has to acknowledge them explicitly.
    """
    if not is_valid_date(day):
        return jsonify({"error": "day must be a real date (YYYY-MM-DD)"}), 400

    mode = operational_mode(day)
    if mode not in (HISTORY, LIVE):
        return jsonify({
            "error": f"{day} has not started yet — a future day cannot be closed.",
            "mode": mode,
        }), 409

    if OperationalDayClosure.query.filter_by(day=day).first():
        return jsonify({"error": f"{day} is already closed."}), 409

    data = request.get_json() or {}
    try:
        check_length(data.get("notes"), 2000, "notes")
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    report = _day_report(day)
    summary = report["summary"]
    loose = summary["callsUnfinished"] + summary["unitsUnfinished"]

    if loose and not data.get("acknowledgeLooseEnds"):
        return jsonify({
            "error": f"{day} still has {loose} unresolved item(s). Resolve them, or "
                     f"close the day explicitly acknowledging them.",
            "looseEnds": report["looseEnds"],
            "requiresAcknowledgement": True,
        }), 409

    closure = OperationalDayClosure(
        day=day,
        closed_at=datetime.now().isoformat(timespec="seconds"),
        closed_by=get_request_user_id(),
        closed_by_name=get_request_user_name(),
        notes=(data.get("notes") or "").strip() or None,
        calls_total=summary["callsTotal"],
        calls_completed=summary["callsCompleted"],
        calls_cancelled=summary["callsCancelled"],
        calls_unfinished=summary["callsUnfinished"],
        units_total=summary["unitsTotal"],
        units_unfinished=summary["unitsUnfinished"],
    )
    db.session.add(closure)

    log_action("operational_day.closed", "operational_day", None, day,
               {"summary": summary, "acknowledgedLooseEnds": bool(loose)},
               user_id=get_request_user_id(), user_name=get_request_user_name())
    db.session.commit()

    return jsonify(closure.to_dict()), 201


@operations_bp.route("/days/<day>/close", methods=["DELETE"])
@require_role("admin")
def reopen_day(day):
    """Reopen a day. Admin only — undoing someone's sign-off is not routine."""
    closure = OperationalDayClosure.query.filter_by(day=day).first()
    if not closure:
        return jsonify({"error": f"{day} is not closed."}), 404

    log_action("operational_day.reopened", "operational_day", None, day,
               {"closedBy": closure.closed_by_name},
               user_id=get_request_user_id(), user_name=get_request_user_name())
    db.session.delete(closure)
    db.session.commit()

    return jsonify({"message": f"{day} reopened."})
