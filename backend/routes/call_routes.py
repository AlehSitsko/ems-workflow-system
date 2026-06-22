from datetime import datetime

from flask import Blueprint, jsonify, request

from sqlalchemy.orm import joinedload

from models import db, Call, Patient
from notification_utils import create_notification
from audit_utils import log_action


def _user_name_from_request():
    return request.headers.get("X-User-Name") or None

ALLOWED_ROLES = {"admin", "supervisor", "hr", "dispatcher"}


def _role_from_request():
    return request.headers.get("X-User-Role", "")


def _user_id_from_request():
    try:
        return int(request.headers.get("X-User-Id", 0)) or None
    except (ValueError, TypeError):
        return None


# Blueprint for call history and call intake routes.
call_bp = Blueprint("call", __name__, url_prefix="/api/calls")


# Return calls with optional filters.
@call_bp.route("", methods=["GET"])
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
def create_call():
    data = request.get_json()

    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

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

        pickup_address=data.get("pickup_address"),
        dropoff_address=data.get("dropoff_address"),

        caller_type=data.get("caller_type"),
        call_type=data.get("call_type"),
        service_level=data.get("service_level"),

        caller_phone=data.get("caller_phone"),
        caller_note=data.get("caller_note"),

        quality_score=data.get("quality_score"),
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

    # Notify if this call is scheduled for today or tomorrow.
    from datetime import timedelta
    today = datetime.now().strftime("%Y-%m-%d")
    tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
    if new_call.trip_date in (today, tomorrow):
        from models import Patient
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
def update_call(call_id):
    if _role_from_request() not in ALLOWED_ROLES:
        return jsonify({"error": "Insufficient permissions"}), 403

    call = Call.query.get_or_404(call_id)
    data = request.get_json() or {}

    EDITABLE = [
        "dispatcher_name", "caller_type", "call_type", "caller_phone", "caller_note",
        "trip_date", "pickup_time", "appointment_time",
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

    changed = {}
    for field in EDITABLE:
        if field in data:
            new_val = data[field]
            old_val = getattr(call, field)
            if str(new_val or "") != str(old_val or ""):
                changed[field] = {"from": old_val, "to": new_val}
                setattr(call, field, new_val)

    if changed:
        log_action("call.updated", "call", call_id,
                   f"Call #{call_id}",
                   {"changed_fields": ", ".join(changed.keys()),
                    "note": "timestamp_edit" if "received_at" in changed or "status" in changed else ""},
                   user_id=_user_id_from_request(), user_name=_user_name_from_request())

    db.session.commit()
    return jsonify(call.to_dict())


@call_bp.route("/<int:call_id>/cancel", methods=["PATCH"])
def cancel_call(call_id):
    if _role_from_request() not in ALLOWED_ROLES:
        return jsonify({"error": "Insufficient permissions"}), 403

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
def uncancel_call(call_id):
    if _role_from_request() not in ALLOWED_ROLES:
        return jsonify({"error": "Insufficient permissions"}), 403
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
def update_pickup_time(call_id):
    call = Call.query.get_or_404(call_id)
    data = request.get_json() or {}
    call.pickup_time = data.get("pickup_time", "")
    db.session.commit()
    return jsonify(call.to_dict())
