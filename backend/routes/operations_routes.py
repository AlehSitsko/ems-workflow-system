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
from utils.auth_utils import require_role, get_request_role, get_request_user_id, get_request_user_name
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


@operations_bp.route("/attention", methods=["GET"])
@require_role("admin", "supervisor", "dispatcher", "hr")
def attention_counts():
    """What is quietly waiting for someone, as counts for the navigation badges.

    Queues that nobody is reminded about are queues that grow. Each of these is a
    place work can sit indefinitely without appearing on any board: a call with
    no trip date, a day of trips nobody has rung about, yesterday still unsigned,
    a leave request nobody has decided.

    Counts only — cheap enough to poll, and it discloses nothing a badge should
    not carry. Each is scoped to the roles that can act on it, so nobody is
    nagged about a queue they cannot open.
    """
    from models import EmployeeLeaveRequest, Task, Employee, User
    from utils.operational_dates import local_today
    from datetime import date, timedelta

    role = get_request_role()
    counts = {}

    if role in VIEW_ROLES:            # admin / supervisor / dispatcher
        counts["schedulingInbox"] = (
            Call.query
            .filter(db.or_(Call.trip_date.is_(None), Call.trip_date == ""),
                    Call.status.notin_(("cancelled", "completed")))
            .count()
        )

        # Tomorrow's trips still to ring: not called yet, or nobody picked up.
        tomorrow = (local_today() + timedelta(days=1)).isoformat()
        counts["confirmationRound"] = (
            Call.query
            .filter(Call.trip_date == tomorrow,
                    Call.status.notin_(("cancelled", "completed")),
                    db.or_(Call.confirmation_status.is_(None),
                           Call.confirmation_status.in_(("not_called", "no_answer"))))
            .count()
        )

        # Yesterday, if it was never signed off. Only ever 0 or 1 — the badge is
        # a reminder, not a backlog count.
        yesterday = (local_today() - timedelta(days=1)).isoformat()
        already_closed = OperationalDayClosure.query.filter_by(day=yesterday).first()
        has_activity = (
            Call.query.filter(Call.trip_date == yesterday).first() is not None
            or DailyCrewUnit.query.filter(DailyCrewUnit.shift_date == yesterday).first() is not None
        )
        counts["dayCloseout"] = 0 if (already_closed or not has_activity) else 1

    if role in ("admin", "hr", "supervisor"):
        counts["leaveReview"] = (
            EmployeeLeaveRequest.query.filter(EmployeeLeaveRequest.status == "pending").count()
        )

    # My tasks that are already due — overdue or due today. Personal, unlike the
    # queues above, and scoped exactly like the Tasks "mine" filter so the badge
    # and that list cannot disagree about what counts as mine.
    today = local_today().isoformat()
    user = User.query.get(get_request_user_id())
    employee_id = user.employee_id if user else None
    mine = []
    if employee_id:
        mine.append(Task.assigned_to_employee_id == employee_id)
    if role in ("admin", "supervisor", "hr"):
        mine.append(Task.created_by_user_id == get_request_user_id())
    if mine:
        counts["tasks"] = (
            Task.query
            .filter(Task.is_archived.is_(False),
                    db.or_(*mine),
                    Task.status.notin_(Task.TERMINAL_STATUSES),
                    Task.due_date.isnot(None), Task.due_date != "",
                    Task.due_date <= today)
            .count()
        )

    # Compliance: active employees carrying at least one certification that is
    # expired or within 14 days (the "critical" threshold used on the Compliance
    # page). A nudge, not the full matrix — documents live on that page.
    if role in ("admin", "supervisor", "hr"):
        today_d = local_today()

        def _urgent(has_license, expiry):
            if not has_license or not expiry:
                return False
            try:
                return (date.fromisoformat(expiry) - today_d).days <= 14
            except ValueError:
                return False

        non_compliant = 0
        for e in Employee.query.filter(Employee.is_active.is_(True)).all():
            if (_urgent(e.cpr_has_license, e.cpr_expiration_date)
                    or _urgent(e.evoc_has_license, e.evoc_expiration_date)
                    or _urgent(e.emt_has_license, e.emt_expiration_date)
                    or _urgent(e.paramedic_has_license, e.paramedic_expiration_date)):
                non_compliant += 1
        counts["compliance"] = non_compliant

    return jsonify(counts)


@operations_bp.route("/days/<day>", methods=["GET"])
@require_role(*VIEW_ROLES)
def get_day(day):
    """The day's closing report, whether or not it has been closed."""
    if not is_valid_date(day):
        return jsonify({"error": "day must be a real date (YYYY-MM-DD)"}), 400
    return jsonify(_day_report(day))


def _hm_local(iso):
    """A stored lifecycle timestamp as local HH:MM, or "" if absent/malformed.

    The timestamps are written inconsistently — some tz-aware (…+00:00), some
    naive local. Convert an aware value to local before taking the clock time so
    a UTC-stamped record does not display hours off; treat a naive one as already
    local.
    """
    if not iso:
        return ""
    try:
        dt = datetime.fromisoformat(iso)
    except (ValueError, TypeError):
        return ""
    if dt.tzinfo is not None:
        dt = dt.astimezone()  # → the server's local zone
    return dt.strftime("%H:%M")


def _minutes_of_day(hm):
    """"HH:MM" → minutes since midnight, or None if it is not a clock time."""
    if not hm:
        return None
    try:
        h, m = hm.split(":")
        h, m = int(h), int(m)
    except (ValueError, AttributeError):
        return None
    if not (0 <= h <= 23 and 0 <= m <= 59):
        return None
    return h * 60 + m


def _day_timeline(day):
    """The day's trips as an agenda, each with its planned times, the actual
    lifecycle milestones, and the pickup variance (actual arrival − planned).

    Ordered by planned pickup time so the day reads top to bottom. This is the
    read side of the lifecycle timestamps the Dispatch Board already records."""
    calls = Call.query.filter(Call.trip_date == day).all()

    assigned_unit_by_call = {}
    if calls:
        rows = (CallAssignment.query
                .filter(CallAssignment.call_id.in_([c.id for c in calls]),
                        CallAssignment.is_active.is_(True))
                .all())
        assigned_unit_by_call = {r.call_id: r.unit_id for r in rows}

    trips = []
    late_arrivals = 0
    with_variance = 0
    for c in calls:
        arrived_pickup = _hm_local(c.arrived_pickup_at)
        planned_pickup_min = _minutes_of_day(c.pickup_time)
        actual_pickup_min = _minutes_of_day(arrived_pickup)
        variance = (
            actual_pickup_min - planned_pickup_min
            if planned_pickup_min is not None and actual_pickup_min is not None
            else None
        )
        if variance is not None:
            with_variance += 1
            if variance > 10:          # more than 10 minutes late to the pickup
                late_arrivals += 1

        trips.append({
            "callId": c.id,
            "patientName": c._patient_name(),
            "serviceLevel": c.service_level,
            "status": c.status or "new",
            "assignedUnitId": assigned_unit_by_call.get(c.id),
            "planned": {
                "pickup": c.pickup_time or "",
                "appointment": c.appointment_time or "",
                "end": c._compute_planned_end_time(),
                "endNextDay": c._planned_end_next_day(),
            },
            "actual": {
                "dispatched":   _hm_local(c.dispatched_at),
                "arrivedPickup": arrived_pickup,
                "loaded":       _hm_local(c.patient_loaded_at),
                "arrivedDest":  _hm_local(c.arrived_dest_at),
                "completed":    _hm_local(c.completed_at),
            },
            "pickupVarianceMinutes": variance,
        })

    # Unscheduled trips (no pickup time) sink to the bottom in id order rather
    # than jumping to the top as an empty string would.
    trips.sort(key=lambda t: (_minutes_of_day(t["planned"]["pickup"]) is None,
                              _minutes_of_day(t["planned"]["pickup"]) or 0,
                              t["callId"]))

    return {
        "day": day,
        "mode": operational_mode(day),
        "summary": {
            "trips": len(trips),
            "withPickupVariance": with_variance,
            "lateArrivals": late_arrivals,
        },
        "trips": trips,
    }


@operations_bp.route("/days/<day>/timeline", methods=["GET"])
@require_role(*VIEW_ROLES)
def get_day_timeline(day):
    """The day's operational agenda: planned vs actual for every trip."""
    if not is_valid_date(day):
        return jsonify({"error": "day must be a real date (YYYY-MM-DD)"}), 400
    return jsonify(_day_timeline(day))


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
