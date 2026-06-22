import json

from flask import Blueprint, jsonify, request

from models import db, DailyCrewUnit
from utils.employee_utils import parse_optional_employee_id
from notification_utils import create_notification


crew_bp = Blueprint("crew", __name__, url_prefix="/api/crew-units")


def _apply_patient_order(unit, data):
    """Write patientOrder array to unit, clearing legacy fields."""
    po = data.get("patientOrder")
    if po is not None:
        unit.patient_order = json.dumps(po)
        # Sync legacy fields for backward compat
        names = [p.get("name", "") for p in po if isinstance(p, dict)]
        unit.first_patient = names[0] if names else None
        unit.next_patients = json.dumps(names[1:]) if len(names) > 1 else json.dumps([])
    else:
        # Fallback: legacy payload (firstPatient / nextPatients)
        first = (data.get("firstPatient") or "").strip()
        next_list = data.get("nextPatients") or []
        unit.first_patient = first or None
        unit.next_patients = json.dumps([n for n in next_list if isinstance(n, str) and n.strip()])
        # Build patient_order from legacy
        po_built = []
        if first:
            po_built.append({"name": first, "time": "", "callId": None})
        for n in next_list:
            if isinstance(n, str) and n.strip():
                po_built.append({"name": n.strip(), "time": "", "callId": None})
        unit.patient_order = json.dumps(po_built)


@crew_bp.route("", methods=["GET"])
def get_daily_crew_units():
    shift_date = request.args.get("shift_date", "").strip()
    query = DailyCrewUnit.query
    if shift_date:
        query = query.filter(DailyCrewUnit.shift_date == shift_date)
    units = query.order_by(DailyCrewUnit.start_time.asc(), DailyCrewUnit.id.asc()).all()
    return jsonify([unit.to_dict() for unit in units])


@crew_bp.route("", methods=["POST"])
def create_daily_crew_unit():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    shift_date = data.get("shiftDate", "").strip()
    truck_number = data.get("truckNumber", "").strip()
    start_time = data.get("startTime", "").strip()

    if not shift_date:
        return jsonify({"error": "Shift date is required"}), 400
    if not truck_number:
        return jsonify({"error": "Truck Number is required"}), 400
    if not start_time:
        return jsonify({"error": "Start Time is required"}), 400

    crew = data.get("crew") or {}

    unit = DailyCrewUnit(
        shift_date=shift_date,
        unit_type=data.get("unitType", "BLS"),
        truck_number=truck_number,
        start_time=start_time,
        end_time=(data.get("endTime") or "").strip() or None,
        end_date=(data.get("endDate") or "").strip() or None,
        shift_type=data.get("shiftType", "day"),
        driver_id=parse_optional_employee_id(crew.get("driver")),
        medical_id=parse_optional_employee_id(crew.get("medical")),
        assist1_id=parse_optional_employee_id(crew.get("assist1")),
        assist2_id=parse_optional_employee_id(crew.get("assist2")),
        notes=data.get("notes", "").strip(),
        created_at=data.get("createdAt"),
        updated_at=data.get("updatedAt"),
    )
    _apply_patient_order(unit, data)

    db.session.add(unit)
    db.session.commit()

    if not any([unit.driver_id, unit.medical_id, unit.assist1_id, unit.assist2_id]):
        create_notification(
            "unit_understaffed", "warning",
            f"Unit {unit.truck_number} has no crew for {unit.shift_date}",
            f"Unit type: {unit.unit_type}. Please assign crew members.",
            entity_type="unit", entity_id=unit.id,
        )

    return jsonify(unit.to_dict()), 201


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
    unit.end_time = (data.get("endTime") or "").strip() or None
    unit.end_date = (data.get("endDate") or "").strip() or None
    unit.shift_type = data.get("shiftType", unit.shift_type or "day")
    unit.driver_id = parse_optional_employee_id(crew.get("driver"))
    unit.medical_id = parse_optional_employee_id(crew.get("medical"))
    unit.assist1_id = parse_optional_employee_id(crew.get("assist1"))
    unit.assist2_id = parse_optional_employee_id(crew.get("assist2"))
    unit.notes = data.get("notes", "").strip()
    unit.updated_at = data.get("updatedAt")
    _apply_patient_order(unit, data)

    db.session.commit()
    return jsonify(unit.to_dict())


@crew_bp.route("/<int:id>", methods=["DELETE"])
def delete_daily_crew_unit(id):
    unit = DailyCrewUnit.query.get(id)
    if not unit:
        return jsonify({"error": "Crew unit not found"}), 404
    db.session.delete(unit)
    db.session.commit()
    return jsonify({"message": "Crew unit deleted"})


@crew_bp.route("/<int:id>/make-night", methods=["POST"])
def make_night_crew(id):
    source = DailyCrewUnit.query.get_or_404(id)
    data = request.get_json() or {}
    replace = data.get("replace", False)
    end_date = (data.get("endDate") or "").strip() or None
    end_time = (data.get("endTime") or "").strip() or None

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
        patient_order=source.patient_order,
        notes=source.notes,
        created_at=source.created_at,
        updated_at=source.updated_at,
    )
    db.session.add(night_unit)
    db.session.commit()
    return jsonify(night_unit.to_dict()), 201
