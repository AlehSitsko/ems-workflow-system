"""Standing transport orders (roadmap Phase 4).

The template materialises real calls a few weeks out; see utils.recurrence for
the rules. These routes are thin on purpose — the interesting decisions (what
counts as touched, what may be rewritten) belong with the generator, not with
HTTP handling.
"""

import json
from datetime import datetime

from flask import Blueprint, jsonify, request

from models import db, Call, Patient, RecurringTrip
from utils.auth_utils import require_role, get_request_user_name
from utils.validation_utils import is_valid_date, is_valid_time, check_length
from utils.taxonomy import canonicalize_or_keep, normalize_service_level
from utils.recurrence import generate, occurrences
from audit_utils import log_action


recurring_bp = Blueprint("recurring", __name__, url_prefix="/api/recurring-trips")

VIEW_ROLES = ("admin", "supervisor", "dispatcher")
EDIT_ROLES = ("admin", "supervisor", "dispatcher")

MAX_HORIZON_WEEKS = 12


def _validate(data, existing=None):
    """Return (values, error). `existing` allows a partial update."""
    values = {}

    patient_id = data.get("patientId", existing.patient_id if existing else None)
    if not patient_id:
        return None, "patientId is required"
    if not Patient.query.get(patient_id):
        return None, "Patient not found"
    values["patient_id"] = patient_id

    weekdays = data.get("weekdays")
    if weekdays is None and existing:
        weekdays = existing.parsed_weekdays()
    if not isinstance(weekdays, list) or not weekdays:
        return None, "weekdays must be a non-empty list (Monday = 0)"
    try:
        parsed = sorted({int(d) for d in weekdays})
    except (TypeError, ValueError):
        return None, "weekdays must be integers between 0 and 6"
    if any(d < 0 or d > 6 for d in parsed):
        return None, "weekdays must be integers between 0 and 6"
    values["weekdays"] = json.dumps(parsed)

    start_date = (data.get("startDate") or (existing.start_date if existing else "")).strip()
    if not is_valid_date(start_date):
        return None, "startDate must be a real date (YYYY-MM-DD)"
    values["start_date"] = start_date

    end_date = data.get("endDate", existing.end_date if existing else None)
    end_date = (end_date or "").strip()
    if end_date:
        if not is_valid_date(end_date):
            return None, "endDate must be a real date (YYYY-MM-DD)"
        if end_date < start_date:
            return None, "endDate must not be before startDate"
    values["end_date"] = end_date or None

    for field, key in (("pickup_time", "pickupTime"), ("return_pickup_time", "returnPickupTime")):
        raw = data.get(key, getattr(existing, field) if existing else None)
        raw = (raw or "").strip()
        if raw and not is_valid_time(raw):
            return None, f"{key} must be HH:MM"
        values[field] = raw or None

    horizon = data.get("horizonWeeks", existing.horizon_weeks if existing else 4)
    try:
        horizon = int(horizon or 4)
    except (TypeError, ValueError):
        return None, "horizonWeeks must be a whole number of weeks"
    if not 1 <= horizon <= MAX_HORIZON_WEEKS:
        return None, f"horizonWeeks must be between 1 and {MAX_HORIZON_WEEKS}"
    values["horizon_weeks"] = horizon

    try:
        check_length(data.get("pickupAddress"), 500, "pickupAddress")
        check_length(data.get("dropoffAddress"), 500, "dropoffAddress")
        check_length(data.get("notes"), 5000, "notes")
    except ValueError as e:
        return None, str(e)

    for field, key in (("pickup_address", "pickupAddress"),
                       ("dropoff_address", "dropoffAddress"),
                       ("notes", "notes"),
                       ("call_type", "callType")):
        if key in data:
            values[field] = (data.get(key) or "").strip() or None
        elif existing:
            values[field] = getattr(existing, field)

    if "serviceLevel" in data:
        values["service_level"] = canonicalize_or_keep(data.get("serviceLevel"), normalize_service_level)
    elif existing:
        values["service_level"] = existing.service_level

    values.setdefault("call_type", "Appointment")
    return values, None


@recurring_bp.route("", methods=["GET"])
@require_role(*VIEW_ROLES)
def list_recurring_trips():
    query = RecurringTrip.query
    patient_id = request.args.get("patient_id", "").strip()
    if patient_id:
        query = query.filter(RecurringTrip.patient_id == patient_id)
    if request.args.get("active") == "1":
        query = query.filter(RecurringTrip.is_active.is_(True))

    trips = query.order_by(RecurringTrip.is_active.desc(), RecurringTrip.id.desc()).all()
    return jsonify([t.to_dict() for t in trips])


@recurring_bp.route("/<int:id>", methods=["GET"])
@require_role(*VIEW_ROLES)
def get_recurring_trip(id):
    trip = RecurringTrip.query.get_or_404(id)
    body = trip.to_dict()
    body["upcoming"] = occurrences(trip)
    return jsonify(body)


@recurring_bp.route("", methods=["POST"])
@require_role(*EDIT_ROLES)
def create_recurring_trip():
    data = request.get_json() or {}
    values, error = _validate(data)
    if error:
        return jsonify({"error": error}), 400

    now = datetime.now().isoformat(timespec="seconds")
    trip = RecurringTrip(**values, is_active=True, created_at=now,
                         created_by_name=get_request_user_name(), updated_at=now)
    db.session.add(trip)
    db.session.commit()

    report = generate(trip)
    log_action("recurring_trip.created", "recurring_trip", trip.id,
               f"Recurring trip #{trip.id}", report, user_name=get_request_user_name())

    body = trip.to_dict()
    body["generated"] = report
    return jsonify(body), 201


@recurring_bp.route("/<int:id>", methods=["PUT"])
@require_role(*EDIT_ROLES)
def update_recurring_trip(id):
    """Edit the standing order and re-materialise it.

    `applyToTouched` re-syncs trips a human has already worked. It is off by
    default because a schedule change must not silently undo a correction — the
    caller has to say that is what they mean.
    """
    trip = RecurringTrip.query.get_or_404(id)

    data = request.get_json() or {}
    values, error = _validate(data, existing=trip)
    if error:
        return jsonify({"error": error}), 400

    for field, value in values.items():
        setattr(trip, field, value)
    if "isActive" in data:
        trip.is_active = bool(data["isActive"])
    trip.updated_at = datetime.now().isoformat(timespec="seconds")
    db.session.commit()

    apply_to_touched = bool(data.get("applyToTouched"))
    report = (generate(trip, apply_to_touched=apply_to_touched) if trip.is_active
              else _withdraw(trip, apply_to_touched))

    log_action("recurring_trip.updated", "recurring_trip", trip.id,
               f"Recurring trip #{trip.id}",
               {**report, "applyToTouched": apply_to_touched},
               user_name=get_request_user_name())

    body = trip.to_dict()
    body["generated"] = report
    return jsonify(body)


@recurring_bp.route("/<int:id>/generate", methods=["POST"])
@require_role(*EDIT_ROLES)
def regenerate(id):
    """Extend the horizon — the routine top-up as time moves forward."""
    trip = RecurringTrip.query.get_or_404(id)
    if not trip.is_active:
        return jsonify({"error": "This standing order is paused."}), 409

    report = generate(trip, apply_to_touched=bool((request.get_json() or {}).get("applyToTouched")))
    return jsonify({"generated": report})


@recurring_bp.route("/<int:id>", methods=["DELETE"])
@require_role(*EDIT_ROLES)
def delete_recurring_trip(id):
    """Stop the order and withdraw its untouched future trips.

    The template row itself is kept: deleting it would orphan the trips that were
    already worked, and their history is the point.
    """
    trip = RecurringTrip.query.get_or_404(id)

    trip.is_active = False
    trip.updated_at = datetime.now().isoformat(timespec="seconds")
    report = _withdraw(trip, apply_to_touched=False)

    log_action("recurring_trip.stopped", "recurring_trip", trip.id,
               f"Recurring trip #{trip.id}", report, user_name=get_request_user_name())
    db.session.commit()

    return jsonify({"message": "Standing order stopped.", "withdrawn": report})


def _withdraw(trip, apply_to_touched):
    """Remove future generated trips for a paused/stopped order."""
    from utils.operational_dates import local_today
    from utils.recurrence import is_touched

    today = local_today().isoformat()
    calls = (Call.query
             .filter(Call.recurring_trip_id == trip.id, Call.trip_date >= today)
             .all())

    removed, skipped = 0, 0
    for call in calls:
        if is_touched(call) and not apply_to_touched:
            skipped += 1
            continue
        db.session.delete(call)
        removed += 1
    db.session.commit()

    return {"created": 0, "updated": 0, "removed": removed, "skipped": skipped}
