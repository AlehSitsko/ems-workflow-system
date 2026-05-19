from flask import Blueprint, jsonify, request

from models import db, Patient, Call


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

    patients = query.all()

    return jsonify([patient.to_dict() for patient in patients])


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

    for key, value in data.items():
        if hasattr(patient, key):
            setattr(patient, key, value)

    db.session.commit()

    return jsonify(patient.to_dict())


# Delete an existing patient by ID.
@patient_bp.route("/api/patient/<int:id>", methods=["DELETE"])
def delete_patient(id):
    patient = Patient.query.get(id)

    if not patient:
        return jsonify({"error": "Patient not found"}), 404

    db.session.delete(patient)
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