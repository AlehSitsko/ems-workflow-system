from flask import Flask, jsonify, request
from flask_cors import CORS
from models import db, Patient, Call

app = Flask(__name__)
CORS(app)

# Local SQLite database configuration.
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///database.db"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

# Connect SQLAlchemy to the Flask app.
db.init_app(app)


@app.route("/")
def home():
    # Basic root endpoint used to confirm that the backend is running.
    return jsonify({
        "message": "EMS Workflow System backend is running"
    })


@app.route("/api/health")
def health_check():
    # Health check endpoint for quick backend testing.
    return jsonify({
        "status": "ok",
        "service": "ems-workflow-system-backend"
    })


# =========================
# PATIENT ROUTES
# =========================

@app.route("/api/patients", methods=["GET"])
def get_patients():
    # Optional query parameters for backend-side filtering.
    name = request.args.get("name", "").strip()
    dob = request.args.get("dob", "").strip()

    query = Patient.query

    # Filter by first name or last name.
    if name:
        query = query.filter(
            db.or_(
                Patient.first_name.ilike(f"%{name}%"),
                Patient.last_name.ilike(f"%{name}%")
            )
        )

    # Filter by exact date of birth.
    if dob:
        query = query.filter(Patient.dob == dob)

    patients = query.all()

    return jsonify([patient.to_dict() for patient in patients])


@app.route("/api/patients", methods=["POST"])
def create_patient():
    # Create a new patient record from JSON request data.
    data = request.get_json()

    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    first_name = data.get("first_name")
    last_name = data.get("last_name")

    # Minimal required field validation.
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


@app.route("/api/patient/<int:id>", methods=["GET"])
def get_patient(id):
    # Return one patient by ID.
    patient = Patient.query.get(id)

    if not patient:
        return jsonify({"error": "Patient not found"}), 404

    return jsonify(patient.to_dict())


@app.route("/api/patient/<int:id>", methods=["PUT"])
def update_patient(id):
    # Update an existing patient record.
    patient = Patient.query.get(id)

    if not patient:
        return jsonify({"error": "Patient not found"}), 404

    data = request.get_json()

    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    # Update all existing model fields dynamically.
    for key, value in data.items():
        if hasattr(patient, key):
            setattr(patient, key, value)

    db.session.commit()

    return jsonify(patient.to_dict())


@app.route("/api/patient/<int:id>", methods=["DELETE"])
def delete_patient(id):
    # Delete an existing patient record.
    patient = Patient.query.get(id)

    if not patient:
        return jsonify({"error": "Patient not found"}), 404

    db.session.delete(patient)
    db.session.commit()

    return jsonify({"message": "Patient deleted"})


# =========================
# CALL ROUTES
# =========================

@app.route("/api/calls", methods=["GET"])
def get_calls():
    # Optional query parameters for call filtering.
    date_of_call = request.args.get("date_of_call", "").strip()
    dispatcher_name = request.args.get("dispatcher_name", "").strip()

    min_quality_score = request.args.get("min_quality_score")
    max_quality_score = request.args.get("max_quality_score")

    query = Call.query

    # Filter calls by the date when the call was received.
    if date_of_call:
        query = query.filter(Call.date_of_call == date_of_call)

    # Filter calls by dispatcher name.
    if dispatcher_name:
        query = query.filter(
            Call.dispatcher_name.ilike(f"%{dispatcher_name}%")
        )

    # Filter calls by minimum quality score.
    if min_quality_score:
        query = query.filter(
            Call.quality_score >= int(min_quality_score)
        )

    # Filter calls by maximum quality score.
    if max_quality_score:
        query = query.filter(
            Call.quality_score <= int(max_quality_score)
        )

    calls = query.order_by(Call.id.desc()).all()

    return jsonify([call.to_dict() for call in calls])


@app.route("/api/calls", methods=["POST"])
def create_call():
    # Create a new call record from JSON request data.
    data = request.get_json()

    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    new_call = Call(
        # Patient link.
        patient_id=data.get("patient_id"),

        # Dispatcher information.
        dispatcher_name=data.get("dispatcher_name"),

        # Call metadata.
        date_of_call=data.get("date_of_call"),
        trip_date=data.get("trip_date"),
        pickup_time=data.get("pickup_time"),

        # Trip details.
        pickup_address=data.get("pickup_address"),
        dropoff_address=data.get("dropoff_address"),

        # Operational fields.
        caller_type=data.get("caller_type"),
        call_type=data.get("call_type"),
        service_level=data.get("service_level"),

        # Quality tracking.
        quality_score=data.get("quality_score"),
        missing_critical_fields=data.get("missing_critical_fields"),
        missing_optional_fields=data.get("missing_optional_fields"),
        missing_info_explanation=data.get("missing_info_explanation"),

        # General notes.
        notes=data.get("notes"),
    )

    db.session.add(new_call)
    db.session.commit()

    return jsonify(new_call.to_dict()), 201


@app.route("/api/patient/<int:id>/calls", methods=["GET"])
def get_patient_calls(id):
    # Return all call records linked to a specific patient.
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


# =========================
# INIT DB
# =========================

# Create database tables automatically for MVP development.
with app.app_context():
    db.create_all()


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5050, debug=True)