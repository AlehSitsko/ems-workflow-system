from flask import Flask, jsonify, request
from flask_cors import CORS
from models import db, Patient

app = Flask(__name__)
CORS(app)

# Local SQLite database configuration.
# The database file is created inside the backend/instance folder by Flask.
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


@app.route("/api/patients", methods=["GET"])
def get_patients():
    # Optional query parameters for backend-side filtering.
    name = request.args.get("name", "").strip()
    dob = request.args.get("dob", "").strip()

    query = Patient.query

    # Filter by first name or last name if a name is provided.
    if name:
        query = query.filter(
            db.or_(
                Patient.first_name.ilike(f"%{name}%"),
                Patient.last_name.ilike(f"%{name}%")
            )
        )

    # Filter by exact date of birth if provided.
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
        phone=data.get("phone"),
        address=data.get("address")
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

    # Update only fields provided in the request.
    patient.first_name = data.get("first_name", patient.first_name)
    patient.last_name = data.get("last_name", patient.last_name)
    patient.dob = data.get("dob", patient.dob)
    patient.phone = data.get("phone", patient.phone)
    patient.address = data.get("address", patient.address)

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


# Create database tables automatically for MVP development.
with app.app_context():
    db.create_all()


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5050, debug=True)