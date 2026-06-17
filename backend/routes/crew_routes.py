import json

from flask import Blueprint, jsonify, request

from models import db, DailyCrewUnit
from utils.employee_utils import parse_optional_employee_id
from notification_utils import create_notification


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
        end_time=data.get("endTime", "").strip() or None,
        end_date=data.get("endDate", "").strip() or None,
        shift_type=data.get("shiftType", "day"),

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

    # Warn if unit has no crew members assigned.
    if not any([unit.driver_id, unit.medical_id, unit.assist1_id, unit.assist2_id]):
        create_notification(
            "unit_understaffed", "warning",
            f"Unit {unit.truck_number} has no crew for {unit.shift_date}",
            f"Unit type: {unit.unit_type}. Please assign crew members.",
            entity_type="unit", entity_id=unit.id,
        )

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
    unit.end_time = data.get("endTime", "").strip() or None
    unit.end_date = data.get("endDate", "").strip() or None
    unit.shift_type = data.get("shiftType", unit.shift_type or "day")

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


# Convert a day unit to night (copy crew, optionally replace existing night units).
@crew_bp.route("/<int:id>/make-night", methods=["POST"])
def make_night_crew(id):
    source = DailyCrewUnit.query.get_or_404(id)
    data = request.get_json() or {}

    replace = data.get("replace", False)   # if True, delete existing night units for this date first
    end_date = data.get("endDate", "").strip() or None
    end_time = data.get("endTime", "").strip() or None

    if replace:
        existing_night = DailyCrewUnit.query.filter_by(
            shift_date=source.shift_date, shift_type="night"
        ).all()
        for u in existing_night:
            db.session.delete(u)

    night_unit = DailyCrewUnit(
        shift_date=source.shift_date,
        shift_type="night",
        unit_type=source.unit_type,
        truck_number=source.truck_number,
        start_time=data.get("startTime", source.start_time),
        end_time=end_time,
        end_date=end_date,
        driver_id=source.driver_id,
        medical_id=source.medical_id,
        assist1_id=source.assist1_id,
        assist2_id=source.assist2_id,
        first_patient=source.first_patient,
        next_patients=source.next_patients,
        notes=source.notes,
        created_at=source.created_at,
        updated_at=source.updated_at,
    )
    db.session.add(night_unit)
    db.session.commit()
    return jsonify(night_unit.to_dict()), 201