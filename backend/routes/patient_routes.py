from flask import Blueprint, jsonify, request

from models import db, Patient, Call
from audit_utils import log_action


def _audit_user():
    try:
        uid = int(request.headers.get("X-User-Id", 0)) or None
    except (ValueError, TypeError):
        uid = None
    return uid, request.headers.get("X-User-Name") or None


# Blueprint for patient management routes.
patient_bp = Blueprint("patient", __name__)


# Return patients with optional name and date of birth filters.
@patient_bp.route("/api/patients", methods=["GET"])
def get_patients():
    name = request.args.get("name", "").strip()
    dob = request.args.get("dob", "").strip()

    query = Patient.query

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

    return jsonify({
        "items": [patient.to_dict() for patient in pagination.items],
        "total": pagination.total,
        "page": pagination.page,
        "per_page": pagination.per_page,
        "pages": pagination.pages,
    })


# Create a new patient record.
@patient_bp.route("/api/patients", methods=["POST"])
def create_patient():
    data = request.get_json()

    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    first_name = data.get("first_name")
    last_name = data.get("last_name")

    if not first_name or not last_name:
        return jsonify({"error": "first_name and last_name are required"}), 400

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

        default_service_level=data.get("default_service_level"),
        weight=data.get("weight"),
        oxygen_required=data.get("oxygen_required", False),
        stairs=data.get("stairs", False),
        special_equipment_notes=data.get("special_equipment_notes"),

        facility_name=data.get("facility_name"),
        room_number=data.get("room_number"),
        emergency_contact_name=data.get("emergency_contact_name"),
        emergency_contact_phone=data.get("emergency_contact_phone"),

        notes=data.get("notes"),
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
def get_patient(id):
    patient = Patient.query.get(id)

    if not patient:
        return jsonify({"error": "Patient not found"}), 404

    return jsonify(patient.to_dict())


# Update an existing patient by ID.
@patient_bp.route("/api/patient/<int:id>", methods=["PUT"])
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
    }
    changed = {k: v for k, v in data.items() if k in ALLOWED_FIELDS and getattr(patient, k) != v}
    for key, value in data.items():
        if key in ALLOWED_FIELDS:
            setattr(patient, key, value)

    uid, uname = _audit_user()
    log_action("patient.updated", "patient", patient.id,
               f"{patient.last_name}, {patient.first_name}",
               {"changed_fields": list(changed.keys())},
               user_id=uid, user_name=uname)
    db.session.commit()

    return jsonify(patient.to_dict())


# Delete an existing patient by ID.
@patient_bp.route("/api/patient/<int:id>", methods=["DELETE"])
def delete_patient(id):
    patient = Patient.query.get(id)

    if not patient:
        return jsonify({"error": "Patient not found"}), 404

    uid, uname = _audit_user()
    label = f"{patient.last_name}, {patient.first_name}"
    pid = patient.id
    db.session.delete(patient)
    log_action("patient.deleted", "patient", pid, label, user_id=uid, user_name=uname)
    db.session.commit()

    return jsonify({"message": "Patient deleted"})


# Return all calls linked to a specific patient.
@patient_bp.route("/api/patient/<int:id>/calls", methods=["GET"])
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