from flask import Flask, jsonify, request
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
import json
from routes.auth_routes import auth_bp
from utils.employee_utils import apply_employee_data, parse_optional_employee_id

from models import (
    db,
    Patient,
    Call,
    User,
    Employee,
    DailyCrewUnit,
    CrewPreset,
)

app = Flask(__name__)
CORS(app)

# Register authentication and user management routes.
app.register_blueprint(auth_bp)

# Local SQLite database configuration.
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///database.db"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

# Connect SQLAlchemy to the Flask app.
db.init_app(app)


@app.route("/")
def home():
    return jsonify({
        "message": "EMS Workflow System backend is running"
    })


@app.route("/api/health")
def health_check():
    return jsonify({
        "status": "ok",
        "service": "ems-workflow-system-backend"
    })


# =========================
# HELPER FUNCTIONS
# =========================

def split_missing_fields(value):
    if not value:
        return []

    return [
        item.strip()
        for item in value.split(",")
        if item.strip()
    ]


def create_default_users():
    default_users = [
        {
            "username": "admin",
            "password": "admin",
            "display_name": "Admin User",
            "role": "admin",
        },
        {
            "username": "supervisor",
            "password": "supervisor",
            "display_name": "Supervisor User",
            "role": "supervisor",
        },
        {
            "username": "dispatcher",
            "password": "dispatcher",
            "display_name": "Dispatcher User",
            "role": "dispatcher",
        },
    ]

    for user_data in default_users:
        existing_user = User.query.filter_by(
            username=user_data["username"]
        ).first()

        if not existing_user:
            user = User(
                username=user_data["username"],
                password_hash=generate_password_hash(user_data["password"]),
                display_name=user_data["display_name"],
                role=user_data["role"],
                is_active=True,
            )

            db.session.add(user)

    db.session.commit()


# =========================
# EMPLOYEE ROUTES
# =========================

@app.route("/api/employees", methods=["GET"])
def get_employees():
    employees = Employee.query.order_by(
        Employee.last_name.asc(),
        Employee.first_name.asc()
    ).all()

    return jsonify([employee.to_dict() for employee in employees])


@app.route("/api/employees", methods=["POST"])
def create_employee():
    data = request.get_json()

    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    first_name = data.get("firstName", "").strip()
    last_name = data.get("lastName", "").strip()

    if not first_name or not last_name:
        return jsonify({"error": "First Name and Last Name are required"}), 400

    employee = Employee()
    apply_employee_data(employee, data)

    db.session.add(employee)
    db.session.commit()

    return jsonify(employee.to_dict()), 201


@app.route("/api/employees/<int:id>", methods=["PUT"])
def update_employee(id):
    employee = Employee.query.get(id)

    if not employee:
        return jsonify({"error": "Employee not found"}), 404

    data = request.get_json()

    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    first_name = data.get("firstName", "").strip()
    last_name = data.get("lastName", "").strip()

    if not first_name or not last_name:
        return jsonify({"error": "First Name and Last Name are required"}), 400

    apply_employee_data(employee, data)

    db.session.commit()

    return jsonify(employee.to_dict())


@app.route("/api/employees/<int:id>", methods=["DELETE"])
def delete_employee(id):
    employee = Employee.query.get(id)

    if not employee:
        return jsonify({"error": "Employee not found"}), 404

    db.session.delete(employee)
    db.session.commit()

    return jsonify({"message": "Employee deleted"})


# =========================
# DAILY CREW ROUTES
# =========================

@app.route("/api/crew-units", methods=["GET"])
def get_daily_crew_units():
    shift_date = request.args.get("shift_date", "").strip()

    query = DailyCrewUnit.query

    if shift_date:
        query = query.filter(
            DailyCrewUnit.shift_date == shift_date
        )

    units = query.order_by(
        DailyCrewUnit.start_time.asc(),
        DailyCrewUnit.id.asc()
    ).all()

    return jsonify([unit.to_dict() for unit in units])


@app.route("/api/crew-units", methods=["POST"])
def create_daily_crew_unit():
    data = request.get_json()

    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    shift_date = data.get("shiftDate", "").strip()
    truck_number = data.get("truckNumber", "").strip()
    start_time = data.get("startTime", "").strip()
    first_patient = data.get("firstPatient", "").strip()

    if not shift_date:
        return jsonify({"error": "Shift date is required"}), 400

    if not truck_number:
        return jsonify({"error": "Truck Number is required"}), 400

    if not start_time:
        return jsonify({"error": "Start Time is required"}), 400

    if not first_patient:
        return jsonify({"error": "First Patient is required"}), 400

    crew = data.get("crew") or {}

    unit = DailyCrewUnit(
        shift_date=shift_date,
        unit_type=data.get("unitType", "BLS"),
        truck_number=truck_number,
        start_time=start_time,

        driver_id=parse_optional_employee_id(crew.get("driver")),
        medical_id=parse_optional_employee_id(crew.get("medical")),
        assist1_id=parse_optional_employee_id(crew.get("assist1")),
        assist2_id=parse_optional_employee_id(crew.get("assist2")),

        first_patient=first_patient,
        next_patients=json.dumps(data.get("nextPatients", [])),
        notes=data.get("notes", "").strip(),

        created_at=data.get("createdAt"),
        updated_at=data.get("updatedAt"),
    )

    db.session.add(unit)
    db.session.commit()

    return jsonify(unit.to_dict()), 201


@app.route("/api/crew-units/<int:id>", methods=["PUT"])
def update_daily_crew_unit(id):
    unit = DailyCrewUnit.query.get(id)

    if not unit:
        return jsonify({"error": "Crew unit not found"}), 404

    data = request.get_json()

    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    crew = data.get("crew") or {}

    unit.shift_date = data.get("shiftDate", "").strip()
    unit.unit_type = data.get("unitType", "BLS")
    unit.truck_number = data.get("truckNumber", "").strip()
    unit.start_time = data.get("startTime", "").strip()

    unit.driver_id = parse_optional_employee_id(crew.get("driver"))
    unit.medical_id = parse_optional_employee_id(crew.get("medical"))
    unit.assist1_id = parse_optional_employee_id(crew.get("assist1"))
    unit.assist2_id = parse_optional_employee_id(crew.get("assist2"))

    unit.first_patient = data.get("firstPatient", "").strip()
    unit.next_patients = json.dumps(data.get("nextPatients", []))
    unit.notes = data.get("notes", "").strip()
    unit.updated_at = data.get("updatedAt")

    db.session.commit()

    return jsonify(unit.to_dict())


@app.route("/api/crew-units/<int:id>", methods=["DELETE"])
def delete_daily_crew_unit(id):
    unit = DailyCrewUnit.query.get(id)

    if not unit:
        return jsonify({"error": "Crew unit not found"}), 404

    db.session.delete(unit)
    db.session.commit()

    return jsonify({"message": "Crew unit deleted"})


# =========================
# CREW PRESET ROUTES
# =========================

@app.route("/api/crew-presets", methods=["GET"])
def get_crew_presets():
    presets = CrewPreset.query.order_by(
        CrewPreset.preset_name.asc(),
        CrewPreset.id.asc()
    ).all()

    return jsonify([preset.to_dict() for preset in presets])


@app.route("/api/crew-presets", methods=["POST"])
def create_crew_preset():
    data = request.get_json()

    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    preset_name = data.get("presetName", "").strip()

    if not preset_name:
        return jsonify({"error": "Preset name is required"}), 400

    crew = data.get("crew") or {}

    preset = CrewPreset(
        preset_name=preset_name,
        unit_type=data.get("unitType", "BLS"),

        driver_id=parse_optional_employee_id(crew.get("driver")),
        medical_id=parse_optional_employee_id(crew.get("medical")),
        assist1_id=parse_optional_employee_id(crew.get("assist1")),
        assist2_id=parse_optional_employee_id(crew.get("assist2")),

        notes=data.get("notes", "").strip(),
    )

    db.session.add(preset)
    db.session.commit()

    return jsonify(preset.to_dict()), 201


@app.route("/api/crew-presets/<int:id>", methods=["PUT"])
def update_crew_preset(id):
    preset = CrewPreset.query.get(id)

    if not preset:
        return jsonify({"error": "Crew preset not found"}), 404

    data = request.get_json()

    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    preset_name = data.get("presetName", "").strip()

    if not preset_name:
        return jsonify({"error": "Preset name is required"}), 400

    crew = data.get("crew") or {}

    preset.preset_name = preset_name
    preset.unit_type = data.get("unitType", "BLS")

    preset.driver_id = parse_optional_employee_id(crew.get("driver"))
    preset.medical_id = parse_optional_employee_id(crew.get("medical"))
    preset.assist1_id = parse_optional_employee_id(crew.get("assist1"))
    preset.assist2_id = parse_optional_employee_id(crew.get("assist2"))

    preset.notes = data.get("notes", "").strip()

    db.session.commit()

    return jsonify(preset.to_dict())


@app.route("/api/crew-presets/<int:id>", methods=["DELETE"])
def delete_crew_preset(id):
    preset = CrewPreset.query.get(id)

    if not preset:
        return jsonify({"error": "Crew preset not found"}), 404

    db.session.delete(preset)
    db.session.commit()

    return jsonify({"message": "Crew preset deleted"})


# =========================
# PATIENT ROUTES
# =========================

@app.route("/api/patients", methods=["GET"])
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


@app.route("/api/patients", methods=["POST"])
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


@app.route("/api/patient/<int:id>", methods=["GET"])
def get_patient(id):
    patient = Patient.query.get(id)

    if not patient:
        return jsonify({"error": "Patient not found"}), 404

    return jsonify(patient.to_dict())


@app.route("/api/patient/<int:id>", methods=["PUT"])
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


@app.route("/api/patient/<int:id>", methods=["DELETE"])
def delete_patient(id):
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
    date_of_call = request.args.get("date_of_call", "").strip()
    dispatcher_name = request.args.get("dispatcher_name", "").strip()

    min_quality_score = request.args.get("min_quality_score")
    max_quality_score = request.args.get("max_quality_score")

    query = Call.query

    if date_of_call:
        query = query.filter(Call.date_of_call == date_of_call)

    if dispatcher_name:
        query = query.filter(
            Call.dispatcher_name.ilike(f"%{dispatcher_name}%")
        )

    if min_quality_score:
        query = query.filter(
            Call.quality_score >= int(min_quality_score)
        )

    if max_quality_score:
        query = query.filter(
            Call.quality_score <= int(max_quality_score)
        )

    calls = query.order_by(Call.id.desc()).all()

    return jsonify([call.to_dict() for call in calls])


@app.route("/api/calls", methods=["POST"])
def create_call():
    data = request.get_json()

    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    new_call = Call(
        patient_id=data.get("patient_id"),
        dispatcher_name=data.get("dispatcher_name"),

        date_of_call=data.get("date_of_call"),
        trip_date=data.get("trip_date"),
        pickup_time=data.get("pickup_time"),

        pickup_address=data.get("pickup_address"),
        dropoff_address=data.get("dropoff_address"),

        caller_type=data.get("caller_type"),
        call_type=data.get("call_type"),
        service_level=data.get("service_level"),

        quality_score=data.get("quality_score"),
        missing_critical_fields=data.get("missing_critical_fields"),
        missing_optional_fields=data.get("missing_optional_fields"),
        missing_info_explanation=data.get("missing_info_explanation"),

        notes=data.get("notes"),
    )

    db.session.add(new_call)
    db.session.commit()

    return jsonify(new_call.to_dict()), 201


@app.route("/api/patient/<int:id>/calls", methods=["GET"])
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


# =========================
# ANALYTICS ROUTES
# =========================

@app.route("/api/analytics/dispatchers", methods=["GET"])
def get_dispatcher_analytics():
    calls = Call.query.all()

    analytics = {}

    for call in calls:
        dispatcher = call.dispatcher_name or "Unknown"

        if dispatcher not in analytics:
            analytics[dispatcher] = {
                "dispatcher_name": dispatcher,
                "total_calls": 0,
                "quality_score_sum": 0,
                "quality_score_count": 0,
                "missing_critical_count": 0,
                "missing_optional_count": 0,
                "calls_with_missing_critical": 0,
                "calls_with_explanation": 0,
            }

        dispatcher_stats = analytics[dispatcher]

        dispatcher_stats["total_calls"] += 1

        if call.quality_score is not None:
            dispatcher_stats["quality_score_sum"] += call.quality_score
            dispatcher_stats["quality_score_count"] += 1

        missing_critical_fields = split_missing_fields(call.missing_critical_fields)
        missing_optional_fields = split_missing_fields(call.missing_optional_fields)

        dispatcher_stats["missing_critical_count"] += len(missing_critical_fields)
        dispatcher_stats["missing_optional_count"] += len(missing_optional_fields)

        if missing_critical_fields:
            dispatcher_stats["calls_with_missing_critical"] += 1

        if call.missing_info_explanation:
            dispatcher_stats["calls_with_explanation"] += 1

    result = []

    for dispatcher_stats in analytics.values():
        score_count = dispatcher_stats["quality_score_count"]

        if score_count > 0:
            average_quality_score = round(
                dispatcher_stats["quality_score_sum"] / score_count
            )
        else:
            average_quality_score = None

        result.append({
            "dispatcher_name": dispatcher_stats["dispatcher_name"],
            "total_calls": dispatcher_stats["total_calls"],
            "average_quality_score": average_quality_score,
            "missing_critical_count": dispatcher_stats["missing_critical_count"],
            "missing_optional_count": dispatcher_stats["missing_optional_count"],
            "calls_with_missing_critical": dispatcher_stats["calls_with_missing_critical"],
            "calls_with_explanation": dispatcher_stats["calls_with_explanation"],
        })

    result.sort(
        key=lambda item: item["average_quality_score"] or 0,
        reverse=True
    )

    return jsonify(result)


# =========================
# INIT DB
# =========================

with app.app_context():
    db.create_all()
    create_default_users()


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5050, debug=True)