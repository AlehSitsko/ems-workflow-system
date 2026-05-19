import json

from flask import Blueprint, jsonify, request

from models import db, DailyCrewUnit
from utils.employee_utils import parse_optional_employee_id


# Blueprint for daily crew unit routes.
crew_bp = Blueprint("crew", __name__, url_prefix="/api/crew-units")


# Return daily crew units, optionally filtered by shift date.
@crew_bp.route("", methods=["GET"])
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


# Create a new daily crew unit.
@crew_bp.route("", methods=["POST"])
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


# Update an existing daily crew unit.
@crew_bp.route("/<int:id>", methods=["PUT"])
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


# Delete an existing daily crew unit.
@crew_bp.route("/<int:id>", methods=["DELETE"])
def delete_daily_crew_unit(id):
    unit = DailyCrewUnit.query.get(id)

    if not unit:
        return jsonify({"error": "Crew unit not found"}), 404

    db.session.delete(unit)
    db.session.commit()

    return jsonify({"message": "Crew unit deleted"})