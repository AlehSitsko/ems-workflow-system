from datetime import datetime

from flask import Blueprint, jsonify, request

from models import db, Call
from notification_utils import create_notification


# Blueprint for call history and call intake routes.
call_bp = Blueprint("call", __name__, url_prefix="/api/calls")


# Return calls with optional filters.
@call_bp.route("", methods=["GET"])
def get_calls():
    date_of_call = request.args.get("date_of_call", "").strip()
    dispatcher_name = request.args.get("dispatcher_name", "").strip()
    status = request.args.get("status", "").strip()

    min_quality_score = request.args.get("min_quality_score")
    max_quality_score = request.args.get("max_quality_score")

    query = Call.query

    if date_of_call:
        query = query.filter(Call.date_of_call == date_of_call)

    if dispatcher_name:
        query = query.filter(
            Call.dispatcher_name.ilike(f"%{dispatcher_name}%")
        )

    if status:
        query = query.filter(Call.status == status)

    if min_quality_score:
        query = query.filter(
            Call.quality_score >= int(min_quality_score)
        )

    if max_quality_score:
        query = query.filter(
            Call.quality_score <= int(max_quality_score)
        )

    page = request.args.get("page", 1, type=int)
    per_page = min(request.args.get("per_page", 25, type=int), 100)

    pagination = query.order_by(Call.id.desc()).paginate(
        page=page, per_page=per_page, error_out=False
    )

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
    db.session.commit()

    # Notify if this call is scheduled for today.
    today = datetime.now().strftime("%Y-%m-%d")
    if new_call.trip_date == today:
        from models import Patient
        patient_name = ""
        if new_call.patient_id:
            p = Patient.query.get(new_call.patient_id)
            if p:
                patient_name = f"{p.first_name} {p.last_name} — "
        create_notification(
            "call_new_today", "info",
            f"New call for today — {new_call.service_level or 'BLS'}",
            f"{patient_name}{new_call.pickup_address or '?'} → {new_call.dropoff_address or '?'} at {new_call.pickup_time or '?'}",
            entity_type="call", entity_id=new_call.id,
        )

    return jsonify(new_call.to_dict()), 201


# Update pickup_time on a specific call (used for Will Call dispatching).
@call_bp.route("/<int:call_id>/pickup-time", methods=["PATCH"])
def update_pickup_time(call_id):
    call = Call.query.get_or_404(call_id)
    data = request.get_json() or {}
    call.pickup_time = data.get("pickup_time", "")
    db.session.commit()
    return jsonify(call.to_dict())
