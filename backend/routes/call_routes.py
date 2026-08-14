from datetime import datetime

from flask import Blueprint, jsonify, request

from sqlalchemy.orm import joinedload

from models import db, Call, Patient
from notification_utils import create_notification
from audit_utils import log_action
from utils.validation_utils import check_length, is_valid_time, is_valid_date
from utils.auth_utils import get_request_role, get_request_user_id, get_request_user_name, require_role
from utils.operational_dates import prohibit_historical_mutation
from utils.taxonomy import (
    canonicalize_or_keep, normalize_service_level,
    normalize_confirmation_status, CONFIRMATION_STATUSES,
    CANCELLING_CONFIRMATION_STATUSES, CONFIRMATION_STATUS_LABELS,
)


def _user_name_from_request():
    return get_request_user_name()

# Calls are patient-operational data: admin, supervisor and dispatcher only.
# HR was included here historically, which contradicted the documented policy
# ("HR never sees calls") and the /calls route guard. Removed.
ALLOWED_ROLES = {"admin", "supervisor", "dispatcher"}


def _validate_time_field(value, field_name):
    """Return value unchanged if empty or a valid HH:MM 24h time. Raises ValueError otherwise."""
    if value is None or value == "":
        return value
    if not is_valid_time(value):
        raise ValueError(f"{field_name} must be in HH:MM 24-hour format")
    return value


def _validate_quality_score(value):
    """Return an int 0-100, or None if value is absent. Raises ValueError otherwise."""
    if value is None or value == "":
        return None
    try:
        score = int(value)
    except (TypeError, ValueError):
        raise ValueError("quality_score must be an integer between 0 and 100")
    if not (0 <= score <= 100):
        raise ValueError("quality_score must be an integer between 0 and 100")
    return score


# A trip is at most a day; the estimate is minutes, so cap at 24h. Absent leaves
# the planned end time simply uncomputed rather than defaulting to a guess.
_MAX_TRIP_MINUTES = 24 * 60


def _validate_duration(value):
    """Return an int 1.._MAX_TRIP_MINUTES, or None when absent. Raises ValueError."""
    if value is None or value == "":
        return None
    err = ValueError(f"estimated_duration_minutes must be an integer between 1 and {_MAX_TRIP_MINUTES}")
    # bool is an int subclass, and a fractional float ("10.5 minutes") is not a
    # whole number of minutes — reject both rather than silently truncating.
    if isinstance(value, bool):
        raise err
    if isinstance(value, float) and not value.is_integer():
        raise err
    try:
        minutes = int(value)
    except (TypeError, ValueError):
        raise err
    if not (1 <= minutes <= _MAX_TRIP_MINUTES):
        raise err
    return minutes


def _role_from_request():
    return get_request_role()


def _user_id_from_request():
    return get_request_user_id()


# Blueprint for call history and call intake routes.
call_bp = Blueprint("call", __name__, url_prefix="/api/calls")


# Return calls with optional filters.
@call_bp.route("", methods=["GET"])
@require_role(*ALLOWED_ROLES)
def get_calls():
    date_of_call = request.args.get("date_of_call", "").strip()
    trip_date = request.args.get("trip_date", "").strip()
    dispatcher_name = request.args.get("dispatcher_name", "").strip()
    status = request.args.get("status", "").strip()

    min_quality_score = request.args.get("min_quality_score")
    max_quality_score = request.args.get("max_quality_score")

    query = Call.query

    if date_of_call:
        query = query.filter(Call.date_of_call == date_of_call)

    if trip_date:
        query = query.filter(Call.trip_date == trip_date)

    if dispatcher_name:
        query = query.filter(
            Call.dispatcher_name.ilike(f"%{dispatcher_name}%")
        )

    if status:
        query = query.filter(Call.status == status)

    if min_quality_score:
        try:
            query = query.filter(Call.quality_score >= int(min_quality_score))
        except ValueError:
            return jsonify({"error": "min_quality_score must be an integer"}), 400

    if max_quality_score:
        try:
            query = query.filter(Call.quality_score <= int(max_quality_score))
        except ValueError:
            return jsonify({"error": "max_quality_score must be an integer"}), 400

    page = request.args.get("page", 1, type=int)
    per_page = min(request.args.get("per_page", 25, type=int), 100)

    pagination = (
        query
        .options(joinedload(Call.patient))
        .order_by(Call.id.desc())
        .paginate(page=page, per_page=per_page, error_out=False)
    )

    # Pre-cache patient on each call to avoid N+1 in _patient_name()
    for call in pagination.items:
        call._patient_cache = call.patient

    return jsonify({
        "items": [call.to_dict() for call in pagination.items],
        "total": pagination.total,
        "page": pagination.page,
        "per_page": pagination.per_page,
        "pages": pagination.pages,
    })


# Create a new call record.
@call_bp.route("", methods=["POST"])
@require_role(*ALLOWED_ROLES)
def create_call():
    data = request.get_json()

    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    if data.get("patient_id") is not None and not Patient.query.get(data["patient_id"]):
        return jsonify({"error": "Patient not found"}), 400

    try:
        quality_score = _validate_quality_score(data.get("quality_score"))
        estimated_duration = _validate_duration(data.get("estimated_duration_minutes"))
        _validate_time_field(data.get("pickup_time"), "pickup_time")
        _validate_time_field(data.get("appointment_time"), "appointment_time")
        check_length(data.get("pickup_address"), 500, "pickup_address")
        check_length(data.get("dropoff_address"), 500, "dropoff_address")
        check_length(data.get("caller_phone"), 30, "caller_phone")
        check_length(data.get("caller_note"), 2000, "caller_note")
        check_length(data.get("notes"), 5000, "notes")
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    new_call = Call(
        patient_id=data.get("patient_id"),
        dispatcher_name=data.get("dispatcher_name"),

        # Store exact intake timestamp for future dispatch lifecycle analytics.
        received_at=data.get("received_at")
        or datetime.now().isoformat(timespec="seconds"),

        # New calls start as "new" until assignment/status tracking is added.
        status=data.get("status") or "new",

        date_of_call=data.get("date_of_call"),
        trip_date=data.get("trip_date"),
        pickup_time=data.get("pickup_time"),
        appointment_time=data.get("appointment_time"),
        estimated_duration_minutes=estimated_duration,

        pickup_address=data.get("pickup_address"),
        dropoff_address=data.get("dropoff_address"),

        caller_type=data.get("caller_type"),
        call_type=data.get("call_type"),
        # Canonical taxonomy on write ('bls' → 'BLS'); an unrecognised legacy
        # value is preserved rather than silently rewritten.
        service_level=canonicalize_or_keep(data.get("service_level"), normalize_service_level),

        caller_phone=data.get("caller_phone"),
        caller_note=data.get("caller_note"),

        quality_score=quality_score,
        missing_critical_fields=data.get("missing_critical_fields"),
        missing_optional_fields=data.get("missing_optional_fields"),
        missing_info_explanation=data.get("missing_info_explanation"),

        notes=data.get("notes"),
    )

    db.session.add(new_call)
    db.session.flush()
    log_action("call.created", "call", new_call.id,
               f"Call #{new_call.id}",
               {"service_level": new_call.service_level,
                "trip_date": new_call.trip_date,
                "pickup_time": new_call.pickup_time,
                "pickup": new_call.pickup_address,
                "dropoff": new_call.dropoff_address,
                "dispatcher": new_call.dispatcher_name},
               user_id=_user_id_from_request(), user_name=_user_name_from_request())
    db.session.commit()

    # Realtime: announce the new call to this org's live clients — AFTER the
    # commit, so a subscriber never sees an event for a row that didn't persist.
    # Org-scoped and free of patient PHI (the client refetches for detail).
    from events import bus
    from tenant import current_org_id
    bus.publish("call.created", current_org_id(),
                actor_user_id=_user_id_from_request(),
                entity_type="call", entity_id=new_call.id,
                payload={"tripDate": new_call.trip_date,
                         "serviceLevel": new_call.service_level,
                         "callType": new_call.call_type,
                         "status": new_call.status,
                         "pickup": new_call.pickup_address,
                         "dropoff": new_call.dropoff_address})

    # Notify if this call is scheduled for today or tomorrow.
    from datetime import timedelta
    today = datetime.now().strftime("%Y-%m-%d")
    tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
    if new_call.trip_date in (today, tomorrow):
        patient_name = ""
        if new_call.patient_id:
            p = Patient.query.get(new_call.patient_id)
            if p:
                patient_name = f"{p.first_name} {p.last_name} — "
        day_label = "today" if new_call.trip_date == today else "tomorrow"
        create_notification(
            "call_new_today", "info",
            f"New call for {day_label} — {new_call.service_level or 'BLS'}",
            f"{patient_name}{new_call.pickup_address or '?'} → {new_call.dropoff_address or '?'} at {new_call.pickup_time or '?'}",
            entity_type="call", entity_id=new_call.id,
        )

    return jsonify(new_call.to_dict()), 201


@call_bp.route("/<int:call_id>", methods=["PUT"])
@require_role(*ALLOWED_ROLES)
def update_call(call_id):
    call = Call.query.get_or_404(call_id)
    data = request.get_json() or {}

    EDITABLE = [
        "dispatcher_name", "caller_type", "call_type", "caller_phone", "caller_note",
        "trip_date", "pickup_time", "appointment_time", "estimated_duration_minutes",
        "pickup_address", "dropoff_address",
        "service_level", "notes",
        "quality_score", "missing_critical_fields", "missing_optional_fields",
        "missing_info_explanation",
        "received_at",
    ]

    # Lifecycle timestamps + status override — supervisors and admins only
    role = _role_from_request()
    if role in {"admin", "supervisor"}:
        EDITABLE = list(EDITABLE) + [
            "status",
            "dispatched_at", "arrived_pickup_at",
            "patient_loaded_at", "arrived_dest_at", "completed_at",
        ]

    try:
        if "quality_score" in data:
            data["quality_score"] = _validate_quality_score(data.get("quality_score"))
        if "estimated_duration_minutes" in data:
            data["estimated_duration_minutes"] = _validate_duration(data.get("estimated_duration_minutes"))
        if "pickup_time" in data:
            _validate_time_field(data.get("pickup_time"), "pickup_time")
        if "appointment_time" in data:
            _validate_time_field(data.get("appointment_time"), "appointment_time")
        check_length(data.get("pickup_address"), 500, "pickup_address")
        check_length(data.get("dropoff_address"), 500, "dropoff_address")
        check_length(data.get("caller_phone"), 30, "caller_phone")
        check_length(data.get("caller_note"), 2000, "caller_note")
        check_length(data.get("notes"), 5000, "notes")
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    if "service_level" in data:
        data["service_level"] = canonicalize_or_keep(data["service_level"], normalize_service_level)

    changed = {}
    for field in EDITABLE:
        if field in data:
            new_val = data[field]
            old_val = getattr(call, field)
            if str(new_val or "") != str(old_val or ""):
                changed[field] = {"from": old_val, "to": new_val}
                setattr(call, field, new_val)

    if changed:
        # A generated call a human has edited stops following its template:
        # otherwise the next schedule change would quietly overwrite the
        # correction just made by hand, which is the one thing recurrence must
        # never do.
        if call.recurring_trip_id:
            call.recurrence_locked = True

        log_action("call.updated", "call", call_id,
                   f"Call #{call_id}",
                   {"changed_fields": ", ".join(changed.keys()),
                    "note": "timestamp_edit" if "received_at" in changed or "status" in changed else ""},
                   user_id=_user_id_from_request(), user_name=_user_name_from_request())

    db.session.commit()
    return jsonify(call.to_dict())


@call_bp.route("/<int:call_id>/cancel", methods=["PATCH"])
@require_role(*ALLOWED_ROLES)
def cancel_call(call_id):
    call = Call.query.get_or_404(call_id)

    if call.status == "cancelled":
        return jsonify({"error": "Call is already cancelled"}), 409

    data = request.get_json() or {}
    reason = (data.get("cancel_reason") or "").strip()
    if not reason:
        return jsonify({"error": "cancel_reason is required"}), 400

    call.status = "cancelled"
    call.cancel_reason = reason
    call.cancelled_at = datetime.now().isoformat(timespec="seconds")
    call.cancelled_by = _user_id_from_request()
    log_action("call.cancelled", "call", call_id,
               f"Call #{call_id}", {"reason": reason},
               user_id=_user_id_from_request(), user_name=_user_name_from_request())
    db.session.commit()
    return jsonify(call.to_dict())


@call_bp.route("/<int:call_id>/uncancel", methods=["PATCH"])
@require_role(*ALLOWED_ROLES)
def uncancel_call(call_id):
    call = Call.query.get_or_404(call_id)
    if call.status != "cancelled":
        return jsonify({"error": "Call is not cancelled"}), 409
    old_reason = call.cancel_reason
    call.status = "new"
    call.cancel_reason = None
    call.cancelled_at = None
    call.cancelled_by = None
    log_action("call.uncancelled", "call", call_id,
               f"Call #{call_id}", {"previous_reason": old_reason},
               user_id=_user_id_from_request(), user_name=_user_name_from_request())
    db.session.commit()
    return jsonify(call.to_dict())


# Update pickup_time on a specific call (used for Will Call dispatching).
@call_bp.route("/<int:call_id>/pickup-time", methods=["PATCH"])
@require_role(*ALLOWED_ROLES)
def update_pickup_time(call_id):
    call = Call.query.get_or_404(call_id)
    data = request.get_json() or {}
    new_time = data.get("pickup_time", "")
    try:
        _validate_time_field(new_time, "pickup_time")
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    # Dispatch-board action: a past trip's pickup time is history (read-only).
    historical = prohibit_historical_mutation(call.trip_date, "Changing pickup time")
    if historical:
        return jsonify(historical[0]), historical[1]

    call.pickup_time = new_time
    db.session.commit()
    return jsonify(call.to_dict())


# ── Scheduling Inbox ────────────────────────────────────────────────────────
#
# A call taken without a trip date used to be invisible: the calendar filters by
# date and the Dispatch Board loads one day at a time, so an intake with "we'll
# call you back with the day" fell out of both and was only found by chance.
# These two routes make that queue explicit — list what has no date, then give it
# one, at which point it leaves the inbox and appears on the board like any
# other call.

# Calls that are finished or called off are not waiting for a date.
_INBOX_EXCLUDED_STATUSES = ("cancelled", "completed")


def _unscheduled_filter():
    """A call is unscheduled when it has no trip date at all.

    Both NULL and "" occur in practice — the column has been written by several
    generations of the intake form — so both count as missing rather than
    normalising the data underneath a read path.
    """
    return db.and_(
        db.or_(Call.trip_date.is_(None), Call.trip_date == ""),
        Call.status.notin_(_INBOX_EXCLUDED_STATUSES),
    )


@call_bp.route("/unscheduled", methods=["GET"])
@require_role(*ALLOWED_ROLES)
def list_unscheduled_calls():
    """The scheduling inbox: calls waiting for a trip date, oldest intake first.

    Oldest first on purpose — this is a backlog, and the one that has been
    waiting longest is the one most at risk of being forgotten.
    """
    calls = (
        Call.query
        .filter(_unscheduled_filter())
        .options(joinedload(Call.patient))
        .order_by(Call.date_of_call.asc(), Call.id.asc())
        .all()
    )

    return jsonify([_call_with_patient_summary(c) for c in calls])


@call_bp.route("/<int:call_id>/schedule", methods=["PATCH"])
@require_role(*ALLOWED_ROLES)
def schedule_call(call_id):
    """Give an inbox call its trip date, and optionally a pickup time."""
    call = Call.query.get_or_404(call_id)

    data = request.get_json() or {}
    trip_date = (data.get("trip_date") or "").strip()
    pickup_time = (data.get("pickup_time") or "").strip()

    if not trip_date:
        return jsonify({"error": "trip_date is required"}), 400

    # Scheduling into the past would produce a call no one can act on: the board
    # is read-only there. Same guard the rest of the dispatch surface uses.
    historical = prohibit_historical_mutation(trip_date, "Scheduling a call")
    if historical:
        return jsonify(historical[0]), historical[1]

    try:
        _validate_time_field(pickup_time, "pickup_time")
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    if call.status in _INBOX_EXCLUDED_STATUSES:
        return jsonify({
            "error": f"Call #{call_id} is {call.status} and cannot be scheduled.",
            "status": call.status,
        }), 409

    call.trip_date = trip_date
    if pickup_time:
        call.pickup_time = pickup_time
    if call.recurring_trip_id:
        call.recurrence_locked = True

    log_action("call.scheduled", "call", call_id, f"Call #{call_id}",
               {"trip_date": trip_date, "pickup_time": pickup_time or None},
               user_id=_user_id_from_request(), user_name=_user_name_from_request())
    db.session.commit()

    return jsonify(call.to_dict())


def _call_with_patient_summary(call):
    """Call plus the minimized patient label the inbox needs to be readable."""
    data = call.to_dict()
    patient = call.patient
    if patient:
        last = (patient.last_name or "").strip()
        data["patientLabel"] = f"{(patient.first_name or '').strip()} {last[0]}." if last             else (patient.first_name or "").strip()
    else:
        data["patientLabel"] = None
    return data


# ── Confirmation calls ──────────────────────────────────────────────────────
#
# Dispatchers ring patients the day before to check tomorrow's trips are still
# on. Recording the outcome here — rather than in a note nobody can filter by —
# is what lets the board show which trips are actually confirmed.


@call_bp.route("/<int:call_id>", methods=["GET"])
@require_role(*ALLOWED_ROLES)
def get_call(call_id):
    """One call with its patient label — backs the call detail page."""
    call = Call.query.options(joinedload(Call.patient)).get_or_404(call_id)
    return jsonify(_call_with_patient_summary(call))


@call_bp.route("/<int:call_id>/confirmation", methods=["PATCH"])
@require_role(*ALLOWED_ROLES)
def set_call_confirmation(call_id):
    """Record the outcome of a confirmation call.

    A declined trip is not happening, so it cancels the call outright instead of
    sitting on the board looking scheduled. The record stays in history with the
    reason, exactly as a manual cancellation would.
    """
    call = Call.query.get_or_404(call_id)

    data = request.get_json() or {}
    status = normalize_confirmation_status(data.get("confirmation_status"))
    if not status:
        return jsonify({
            "error": f"confirmation_status must be one of: {', '.join(CONFIRMATION_STATUSES)}",
        }), 400

    try:
        check_length(data.get("confirmation_note"), 1000, "confirmation_note")
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    if call.status == "cancelled" and status != "declined":
        return jsonify({
            "error": f"Call #{call_id} is cancelled. Uncancel it before recording a confirmation.",
            "status": call.status,
        }), 409

    note = (data.get("confirmation_note") or "").strip()
    now = datetime.now().isoformat(timespec="seconds")

    call.confirmation_status = status
    call.confirmation_note = note or None
    # "Not called" is the absence of a confirmation call, so it clears the trail
    # rather than recording that someone did nothing at a particular time.
    if status == "not_called":
        call.confirmed_at = None
        call.confirmed_by = None
        call.confirmed_by_name = None
    else:
        call.confirmed_at = now
        call.confirmed_by = _user_id_from_request()
        call.confirmed_by_name = _user_name_from_request()

    cancelled_now = False
    if status in CANCELLING_CONFIRMATION_STATUSES and call.status != "cancelled":
        call.status = "cancelled"
        call.cancel_reason = note or "Patient declined during the confirmation call"
        call.cancelled_at = now
        call.cancelled_by = _user_id_from_request()
        cancelled_now = True

    log_action("call.confirmation_recorded", "call", call_id, f"Call #{call_id}",
               {"confirmation_status": status, "cancelled": cancelled_now},
               user_id=_user_id_from_request(), user_name=_user_name_from_request())
    db.session.commit()

    body = call.to_dict()
    # Say plainly that a decline cancelled the trip — the caller should not have
    # to infer it from a status field changing underneath them.
    if cancelled_now:
        body["cancelledByConfirmation"] = True
        body["message"] = (f"{CONFIRMATION_STATUS_LABELS[status]} — call #{call_id} "
                           f"has been cancelled and kept in history.")

    return jsonify(body)


@call_bp.route("/confirmation-round", methods=["GET"])
@require_role(*ALLOWED_ROLES)
def confirmation_round():
    """One day's trips as a call list, in the order a dispatcher would ring them.

    Opening each trip's page one at a time works for a single correction but not
    for a round of twenty. This returns the day in pickup order together with a
    tally, so the screen can show what is left rather than making someone count.

    Cancelled and completed trips are excluded: there is nothing to confirm about
    a trip that is not happening or has already happened.
    """
    trip_date = request.args.get("date", "").strip()
    if not is_valid_date(trip_date):
        return jsonify({"error": "date must be a real date (YYYY-MM-DD)"}), 400

    calls = (
        Call.query
        .filter(
            Call.trip_date == trip_date,
            Call.status.notin_(_INBOX_EXCLUDED_STATUSES),
        )
        .options(joinedload(Call.patient))
        # Calls with no pickup time sort last: they are the ones where the time
        # itself is what the confirmation call needs to establish.
        .order_by(Call.pickup_time.is_(None), Call.pickup_time == "", Call.pickup_time.asc())
        .all()
    )

    tally = {status: 0 for status in CONFIRMATION_STATUSES}
    for call in calls:
        tally[call.confirmation_status or "not_called"] += 1

    return jsonify({
        "date": trip_date,
        "calls": [_call_with_patient_summary(c) for c in calls],
        "summary": {
            "total": len(calls),
            **tally,
            "remaining": tally["not_called"] + tally["no_answer"],
        },
    })
