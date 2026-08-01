from datetime import datetime

from flask import Blueprint, jsonify, request

from models import db, Patient, Call, PatientAlert, PatientContact
from audit_utils import log_action
from utils.validation_utils import check_length
from utils.taxonomy import canonicalize_or_keep, normalize_service_level
from utils.auth_utils import get_request_user_id, get_request_user_name, require_role

# Patients are PHI: admin, supervisor and dispatcher only — never HR.
PATIENT_ROLES = ("admin", "supervisor", "dispatcher")


def _audit_user():
    return get_request_user_id(), get_request_user_name()


def _now():
    return datetime.now().isoformat(timespec="seconds")


# Blueprint for patient management routes.
patient_bp = Blueprint("patient", __name__)

# Highest severity wins when a patient carries several active alerts.
_ALERT_SEVERITY_RANK = {"critical": 3, "warning": 2, "info": 1}

PATIENT_FIELD_LIMITS = {
    "first_name": 100,
    "last_name": 100,
    "gender": 50,
    "phone": 20,
    "secondary_phone": 20,
    "address": 500,
    "city": 100,
    "state": 50,
    "zip_code": 20,
    "insurance": 150,
    "member_id": 100,
    "policy_number": 100,
    "insurance_notes": 2000,
    "default_service_level": 50,
    "default_mobility_level": 50,
    "weight": 20,
    "special_equipment_notes": 2000,
    "facility_name": 150,
    "room_number": 50,
    "emergency_contact_name": 150,
    "emergency_contact_phone": 20,
    "notes": 5000,
    "dispatch_comment": 1000,
    "transport_instructions": 2000,
    "access_instructions": 2000,
    "preferred_language": 50,
    "archived_reason": 1000,
}


def _validate_patient_fields(data):
    """Raise ValueError on any field exceeding its max length."""
    for field, max_len in PATIENT_FIELD_LIMITS.items():
        if field in data:
            check_length(data.get(field), max_len, field)


def _find_duplicate(first_name, last_name, dob, exclude_id=None):
    """Case/whitespace-insensitive match on first_name + last_name + dob, including archived patients."""
    if not (first_name and last_name and dob):
        return None
    q = Patient.query.filter(
        db.func.lower(db.func.trim(Patient.first_name)) == first_name.lower().strip(),
        db.func.lower(db.func.trim(Patient.last_name)) == last_name.lower().strip(),
        Patient.dob == dob,
    )
    if exclude_id:
        q = q.filter(Patient.id != exclude_id)
    return q.first()


# Return patients with optional name and date of birth filters.
@patient_bp.route("/api/patients", methods=["GET"])
@require_role(*PATIENT_ROLES)
def get_patients():
    name = request.args.get("name", "").strip()
    dob = request.args.get("dob", "").strip()
    show_archived = request.args.get("show_archived", "").strip() == "1"

    query = Patient.query

    if not show_archived:
        query = query.filter(Patient.is_archived.is_(False))

    if name:
        query = query.filter(
            db.or_(
                Patient.first_name.ilike(f"%{name}%"),
                Patient.last_name.ilike(f"%{name}%")
            )
        )

    if dob:
        query = query.filter(Patient.dob == dob)

    page = request.args.get("page", 1, type=int)
    per_page = min(request.args.get("per_page", 25, type=int), 100)

    pagination = query.order_by(Patient.last_name, Patient.first_name).paginate(
        page=page, per_page=per_page, error_out=False
    )

    # Active-alert summary per patient, so the list can flag safety alerts at a
    # glance without opening each record. Batch-loaded to avoid an N+1 query.
    items = [patient.to_dict() for patient in pagination.items]
    page_ids = [p.id for p in pagination.items]
    if page_ids:
        today_str = datetime.now().strftime("%Y-%m-%d")
        active_alerts = (
            PatientAlert.query
            .filter(
                PatientAlert.patient_id.in_(page_ids),
                PatientAlert.is_active.is_(True),
                db.or_(PatientAlert.expires_at.is_(None), PatientAlert.expires_at >= today_str),
            )
            .all()
        )
        severities_by_patient = {}
        for a in active_alerts:
            severities_by_patient.setdefault(a.patient_id, []).append(a.severity)
        for item in items:
            sevs = severities_by_patient.get(item["id"], [])
            item["active_alert_count"] = len(sevs)
            item["active_alert_severity"] = (
                max(sevs, key=lambda s: _ALERT_SEVERITY_RANK.get(s, 0)) if sevs else None
            )

    return jsonify({
        "items": items,
        "total": pagination.total,
        "page": pagination.page,
        "per_page": pagination.per_page,
        "pages": pagination.pages,
    })


# Create a new patient record.
@patient_bp.route("/api/patients", methods=["POST"])
@require_role(*PATIENT_ROLES)
def create_patient():
    data = request.get_json()

    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    first_name = data.get("first_name")
    last_name = data.get("last_name")

    if not first_name or not last_name:
        return jsonify({"error": "first_name and last_name are required"}), 400

    try:
        _validate_patient_fields(data)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    existing = _find_duplicate(first_name, last_name, data.get("dob"))
    if existing:
        return jsonify({
            "error": "Possible duplicate patient",
            "existing_patient": existing.to_dict(),
        }), 409

    new_patient = Patient(
        first_name=first_name,
        last_name=last_name,
        dob=data.get("dob"),
        gender=data.get("gender"),

        phone=data.get("phone"),
        secondary_phone=data.get("secondary_phone"),
        address=data.get("address"),
        city=data.get("city"),
        state=data.get("state"),
        zip_code=data.get("zip_code"),

        insurance=data.get("insurance"),
        member_id=data.get("member_id"),
        policy_number=data.get("policy_number"),
        requires_auth=data.get("requires_auth", False),
        copay_required=data.get("copay_required", False),
        insurance_notes=data.get("insurance_notes"),

        default_service_level=canonicalize_or_keep(
            data.get("default_service_level"), normalize_service_level),
        weight=data.get("weight"),
        oxygen_required=data.get("oxygen_required", False),
        stairs=data.get("stairs", False),
        special_equipment_notes=data.get("special_equipment_notes"),

        facility_name=data.get("facility_name"),
        room_number=data.get("room_number"),
        emergency_contact_name=data.get("emergency_contact_name"),
        emergency_contact_phone=data.get("emergency_contact_phone"),

        notes=data.get("notes"),

        dispatch_comment=data.get("dispatch_comment"),
        default_mobility_level=data.get("default_mobility_level"),
        transport_instructions=data.get("transport_instructions"),
        access_instructions=data.get("access_instructions"),
        preferred_language=data.get("preferred_language"),
        requires_interpreter=data.get("requires_interpreter", False),
        is_sensitive=data.get("is_sensitive", False),
    )

    db.session.add(new_patient)
    db.session.flush()
    uid, uname = _audit_user()
    log_action("patient.created", "patient", new_patient.id,
               f"{new_patient.last_name}, {new_patient.first_name}",
               user_id=uid, user_name=uname)
    db.session.commit()

    return jsonify(new_patient.to_dict()), 201


# Return a single patient by ID.
@patient_bp.route("/api/patient/<int:id>", methods=["GET"])
@require_role(*PATIENT_ROLES)
def get_patient(id):
    patient = Patient.query.get(id)

    if not patient:
        return jsonify({"error": "Patient not found"}), 404

    return jsonify(patient.to_dict())


# Update an existing patient by ID.
@patient_bp.route("/api/patient/<int:id>", methods=["PUT"])
@require_role(*PATIENT_ROLES)
def update_patient(id):
    patient = Patient.query.get(id)

    if not patient:
        return jsonify({"error": "Patient not found"}), 404

    data = request.get_json()

    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    ALLOWED_FIELDS = {
        "first_name", "last_name", "dob", "gender",
        "phone", "secondary_phone", "address", "city", "state", "zip_code",
        "insurance", "member_id", "policy_number", "requires_auth", "copay_required", "insurance_notes",
        "default_service_level", "weight", "oxygen_required", "stairs", "special_equipment_notes",
        "facility_name", "room_number", "emergency_contact_name", "emergency_contact_phone",
        "notes",
        "dispatch_comment",
        "default_mobility_level", "transport_instructions", "access_instructions",
        "preferred_language", "requires_interpreter",
        "is_sensitive",
    }

    try:
        _validate_patient_fields({k: v for k, v in data.items() if k in ALLOWED_FIELDS})
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    # The patient's default is only a preference — canonicalize it, but note this
    # never rewrites the service_level already recorded on existing calls.
    if "default_service_level" in data:
        data["default_service_level"] = canonicalize_or_keep(
            data["default_service_level"], normalize_service_level)

    new_first = data.get("first_name", patient.first_name)
    new_last = data.get("last_name", patient.last_name)
    new_dob = data.get("dob", patient.dob)
    existing = _find_duplicate(new_first, new_last, new_dob, exclude_id=patient.id)
    if existing:
        return jsonify({
            "error": "Possible duplicate patient",
            "existing_patient": existing.to_dict(),
        }), 409

    changed = {k: v for k, v in data.items() if k in ALLOWED_FIELDS and getattr(patient, k) != v}
    dispatch_comment_changed = "dispatch_comment" in changed
    for key, value in data.items():
        if key in ALLOWED_FIELDS:
            setattr(patient, key, value)

    uid, uname = _audit_user()
    log_action("patient.updated", "patient", patient.id,
               f"{patient.last_name}, {patient.first_name}",
               {"changed_fields": list(changed.keys())},
               user_id=uid, user_name=uname)
    if dispatch_comment_changed:
        log_action("patient.dispatch_comment.updated", "patient", patient.id,
                   f"{patient.last_name}, {patient.first_name}",
                   user_id=uid, user_name=uname)
    db.session.commit()

    return jsonify(patient.to_dict())


# Archive an existing patient by ID (soft delete — history stays intact).
@patient_bp.route("/api/patient/<int:id>", methods=["DELETE"])
@require_role(*PATIENT_ROLES)
def delete_patient(id):
    patient = Patient.query.get(id)

    if not patient:
        return jsonify({"error": "Patient not found"}), 404

    if patient.is_archived:
        return jsonify({"error": "Patient is already archived"}), 409

    data = request.get_json(silent=True) or {}
    reason = (data.get("reason") or "").strip() or None
    try:
        check_length(reason, 1000, "reason")
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    uid, uname = _audit_user()
    patient.is_archived = True
    patient.archived_at = _now()
    patient.archived_by = uname or "System"
    patient.archived_reason = reason

    log_action("patient.archived", "patient", patient.id,
               f"{patient.last_name}, {patient.first_name}",
               {"reason": reason},
               user_id=uid, user_name=uname)
    db.session.commit()

    return jsonify({"message": "Patient archived successfully", "patient": patient.to_dict()})


# Restore a previously archived patient.
@patient_bp.route("/api/patient/<int:id>/restore", methods=["POST"])
@require_role(*PATIENT_ROLES)
def restore_patient(id):
    patient = Patient.query.get(id)

    if not patient:
        return jsonify({"error": "Patient not found"}), 404

    if not patient.is_archived:
        return jsonify({"error": "Patient is not archived"}), 409

    uid, uname = _audit_user()
    patient.is_archived = False
    patient.archived_at = None
    patient.archived_by = None
    patient.archived_reason = None

    log_action("patient.restored", "patient", patient.id,
               f"{patient.last_name}, {patient.first_name}",
               user_id=uid, user_name=uname)
    db.session.commit()

    return jsonify({"message": "Patient restored successfully", "patient": patient.to_dict()})


# Return all calls linked to a specific patient.
@patient_bp.route("/api/patient/<int:id>/calls", methods=["GET"])
@require_role(*PATIENT_ROLES)
def get_patient_calls(id):
    patient = Patient.query.get(id)

    if not patient:
        return jsonify({"error": "Patient not found"}), 404

    calls = (
        Call.query
        .filter_by(patient_id=id)
        .order_by(Call.id.desc())
        .all()
    )

    return jsonify([call.to_dict() for call in calls])


# Return the most recent call for a patient, shaped as a template for a new call.
# Excludes date/time/status/assignment/dispatch-timestamp fields that should never be blindly copied.
@patient_bp.route("/api/patient/<int:id>/last-trip-template", methods=["GET"])
@require_role(*PATIENT_ROLES)
def get_last_trip_template(id):
    patient = Patient.query.get(id)

    if not patient:
        return jsonify({"error": "Patient not found"}), 404

    last_call = (
        Call.query
        .filter_by(patient_id=id)
        .filter(Call.status != "cancelled")
        .order_by(Call.id.desc())
        .first()
    )

    if not last_call:
        return jsonify({"template": None})

    return jsonify({"template": {
        "patient_id": patient.id,
        "pickup_address": last_call.pickup_address,
        "dropoff_address": last_call.dropoff_address,
        "service_level": last_call.service_level,
        "caller_type": last_call.caller_type,
        "call_type": last_call.call_type,
        "source_call_id": last_call.id,
        "source_trip_date": last_call.trip_date,
    }})


# ── Patient alerts ───────────────────────────────────────────────────────────

ALERT_CATEGORIES = {"transport", "safety", "contact", "facility", "billing", "equipment", "behavior", "language", "other"}
ALERT_SEVERITIES = {"info", "warning", "critical"}


@patient_bp.route("/api/patient/<int:id>/alerts", methods=["GET"])
@require_role(*PATIENT_ROLES)
def get_patient_alerts(id):
    Patient.query.get_or_404(id)
    show_all = request.args.get("show_all", "").strip() == "1"

    query = PatientAlert.query.filter_by(patient_id=id)
    if not show_all:
        query = query.filter_by(is_active=True)

    alerts = query.order_by(PatientAlert.id.desc()).all()
    return jsonify([a.to_dict() for a in alerts])


@patient_bp.route("/api/patient/<int:id>/alerts", methods=["POST"])
@require_role(*PATIENT_ROLES)
def create_patient_alert(id):
    Patient.query.get_or_404(id)
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    category = (data.get("category") or "").strip()
    severity = (data.get("severity") or "info").strip()
    title = (data.get("title") or "").strip()

    if category not in ALERT_CATEGORIES:
        return jsonify({"error": f"Invalid category. Must be one of: {sorted(ALERT_CATEGORIES)}"}), 400
    if severity not in ALERT_SEVERITIES:
        return jsonify({"error": f"Invalid severity. Must be one of: {sorted(ALERT_SEVERITIES)}"}), 400
    if not title:
        return jsonify({"error": "title is required"}), 400

    try:
        check_length(title, 120, "title")
        check_length(data.get("description"), 1000, "description")
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    expires_at = (data.get("expires_at") or "").strip() or None
    if expires_at:
        from utils.validation_utils import is_valid_date
        if not is_valid_date(expires_at):
            return jsonify({"error": "Invalid expires_at. Expected YYYY-MM-DD."}), 400

    uid, uname = _audit_user()
    alert = PatientAlert(
        patient_id=id,
        category=category,
        severity=severity,
        title=title,
        description=data.get("description"),
        is_active=True,
        expires_at=expires_at,
        created_at=_now(),
        created_by=uname or "System",
    )
    db.session.add(alert)
    db.session.flush()
    log_action("patient.alert.created", "patient", id, title,
               {"category": category, "severity": severity},
               user_id=uid, user_name=uname)
    db.session.commit()

    return jsonify(alert.to_dict()), 201


@patient_bp.route("/api/patient/<int:id>/alerts/<int:alert_id>", methods=["PUT"])
@require_role(*PATIENT_ROLES)
def update_patient_alert(id, alert_id):
    # Scope through the org-filtered patient first: the alert carries no org_id, so
    # without this an org could reach another's alert by guessing patient+alert ids.
    if not Patient.query.filter_by(id=id).first():
        return jsonify({"error": "Patient not found"}), 404
    alert = PatientAlert.query.filter_by(id=alert_id, patient_id=id).first()
    if not alert:
        return jsonify({"error": "Alert not found"}), 404

    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    if "category" in data:
        category = (data.get("category") or "").strip()
        if category not in ALERT_CATEGORIES:
            return jsonify({"error": f"Invalid category. Must be one of: {sorted(ALERT_CATEGORIES)}"}), 400
        alert.category = category

    if "severity" in data:
        severity = (data.get("severity") or "").strip()
        if severity not in ALERT_SEVERITIES:
            return jsonify({"error": f"Invalid severity. Must be one of: {sorted(ALERT_SEVERITIES)}"}), 400
        alert.severity = severity

    if "title" in data:
        title = (data.get("title") or "").strip()
        if not title:
            return jsonify({"error": "title is required"}), 400
        try:
            check_length(title, 120, "title")
        except ValueError as e:
            return jsonify({"error": str(e)}), 400
        alert.title = title

    if "description" in data:
        try:
            check_length(data.get("description"), 1000, "description")
        except ValueError as e:
            return jsonify({"error": str(e)}), 400
        alert.description = data.get("description")

    if "expires_at" in data:
        expires_at = (data.get("expires_at") or "").strip() or None
        if expires_at:
            from utils.validation_utils import is_valid_date
            if not is_valid_date(expires_at):
                return jsonify({"error": "Invalid expires_at. Expected YYYY-MM-DD."}), 400
        alert.expires_at = expires_at

    uid, uname = _audit_user()
    alert.updated_at = _now()
    log_action("patient.alert.updated", "patient", id, alert.title,
               user_id=uid, user_name=uname)
    db.session.commit()

    return jsonify(alert.to_dict())


@patient_bp.route("/api/patient/<int:id>/alerts/<int:alert_id>/resolve", methods=["POST"])
@require_role(*PATIENT_ROLES)
def resolve_patient_alert(id, alert_id):
    # Scope through the org-filtered patient first: the alert carries no org_id, so
    # without this an org could reach another's alert by guessing patient+alert ids.
    if not Patient.query.filter_by(id=id).first():
        return jsonify({"error": "Patient not found"}), 404
    alert = PatientAlert.query.filter_by(id=alert_id, patient_id=id).first()
    if not alert:
        return jsonify({"error": "Alert not found"}), 404

    if not alert.is_active:
        return jsonify({"error": "Alert is already resolved"}), 409

    data = request.get_json(silent=True) or {}
    reason = (data.get("reason") or "").strip() or None
    try:
        check_length(reason, 1000, "reason")
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    uid, uname = _audit_user()
    alert.is_active = False
    alert.resolved_at = _now()
    alert.resolved_by = uname or "System"
    alert.resolved_reason = reason

    log_action("patient.alert.resolved", "patient", id, alert.title,
               {"reason": reason},
               user_id=uid, user_name=uname)
    db.session.commit()

    return jsonify(alert.to_dict())


# ── Patient contacts ─────────────────────────────────────────────────────────

@patient_bp.route("/api/patient/<int:id>/contacts", methods=["GET"])
@require_role(*PATIENT_ROLES)
def get_patient_contacts(id):
    Patient.query.get_or_404(id)
    contacts = (
        PatientContact.query
        .filter_by(patient_id=id)
        .order_by(PatientContact.is_primary.desc(), PatientContact.id.asc())
        .all()
    )
    return jsonify([c.to_dict() for c in contacts])


@patient_bp.route("/api/patient/<int:id>/contacts", methods=["POST"])
@require_role(*PATIENT_ROLES)
def create_patient_contact(id):
    Patient.query.get_or_404(id)
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "name is required"}), 400

    try:
        check_length(name, 150, "name")
        check_length(data.get("relationship"), 100, "relationship")
        check_length(data.get("phone"), 30, "phone")
        check_length(data.get("email"), 150, "email")
        check_length(data.get("notes"), 1000, "notes")
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    now = _now()
    contact = PatientContact(
        patient_id=id,
        name=name,
        relationship_label=data.get("relationship"),
        phone=data.get("phone"),
        email=data.get("email"),
        is_primary=data.get("is_primary", False),
        can_authorize_transport=data.get("can_authorize_transport", False),
        preferred_contact_method=data.get("preferred_contact_method"),
        notes=data.get("notes"),
        created_at=now,
        updated_at=now,
    )
    db.session.add(contact)
    db.session.commit()

    return jsonify(contact.to_dict()), 201


@patient_bp.route("/api/patient/<int:id>/contacts/<int:contact_id>", methods=["PUT"])
@require_role(*PATIENT_ROLES)
def update_patient_contact(id, contact_id):
    # Scope through the org-filtered patient first (the contact carries no org_id).
    if not Patient.query.filter_by(id=id).first():
        return jsonify({"error": "Patient not found"}), 404
    contact = PatientContact.query.filter_by(id=contact_id, patient_id=id).first()
    if not contact:
        return jsonify({"error": "Contact not found"}), 404

    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    if "name" in data:
        name = (data.get("name") or "").strip()
        if not name:
            return jsonify({"error": "name is required"}), 400
        contact.name = name

    try:
        check_length(data.get("relationship"), 100, "relationship")
        check_length(data.get("phone"), 30, "phone")
        check_length(data.get("email"), 150, "email")
        check_length(data.get("notes"), 1000, "notes")
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    for field, attr in (
        ("relationship", "relationship_label"),
        ("phone", "phone"),
        ("email", "email"),
        ("is_primary", "is_primary"),
        ("can_authorize_transport", "can_authorize_transport"),
        ("preferred_contact_method", "preferred_contact_method"),
        ("notes", "notes"),
    ):
        if field in data:
            setattr(contact, attr, data[field])

    contact.updated_at = _now()
    db.session.commit()

    return jsonify(contact.to_dict())


@patient_bp.route("/api/patient/<int:id>/contacts/<int:contact_id>", methods=["DELETE"])
@require_role(*PATIENT_ROLES)
def delete_patient_contact(id, contact_id):
    # Scope through the org-filtered patient first (the contact carries no org_id).
    if not Patient.query.filter_by(id=id).first():
        return jsonify({"error": "Patient not found"}), 404
    contact = PatientContact.query.filter_by(id=contact_id, patient_id=id).first()
    if not contact:
        return jsonify({"error": "Contact not found"}), 404

    db.session.delete(contact)
    db.session.commit()

    return jsonify({"message": "Contact deleted"})
