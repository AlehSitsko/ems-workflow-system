from datetime import datetime

from flask import Blueprint, jsonify, request

from models import db, Call, DailyCrewUnit, CallAssignment, Patient


dispatch_bp = Blueprint("dispatch", __name__, url_prefix="/api/dispatch")

VALID_UNIT_STATUSES = [
    "available",
    "en_route",
    "on_scene",
    "transporting",
    "at_destination",
    "out_of_service",
]


def _call_with_patient(call):
    d = call.to_dict()
    if call.patient_id:
        patient = Patient.query.get(call.patient_id)
        if patient:
            d["patient_name"] = f"{patient.first_name} {patient.last_name}"
            d["patient_dob"] = patient.dob or ""
            d["patient_phone"] = patient.phone or ""
    return d


def _crew_count(unit):
    slots = [unit.driver_id, unit.medical_id, unit.assist1_id, unit.assist2_id]
    return sum(1 for s in slots if s is not None)


@dispatch_bp.route("/board", methods=["GET"])
def get_board():
    date = request.args.get("date", datetime.now().strftime("%Y-%m-%d"))

    open_calls = (
        Call.query
        .filter(Call.trip_date == date, Call.status.in_(["new", "assigned"]))
        .order_by(Call.pickup_time)
        .all()
    )

    units = (
        DailyCrewUnit.query
        .filter_by(shift_date=date)
        .order_by(DailyCrewUnit.truck_number)
        .all()
    )

    unit_ids = [u.id for u in units]

    active_assignments = (
        CallAssignment.query
        .filter(
            CallAssignment.unit_id.in_(unit_ids),
            CallAssignment.is_active == True,
        )
        .all()
    ) if unit_ids else []

    # Completed assignments for today (assigned_at starts with date prefix)
    completed_assignments = (
        CallAssignment.query
        .filter(
            CallAssignment.unit_id.in_(unit_ids),
            CallAssignment.is_active == False,
            CallAssignment.assigned_at.like(f"{date}%"),
        )
        .all()
    ) if unit_ids else []

    calls_by_unit = {}
    for a in active_assignments:
        call = db.session.get(Call, a.call_id)
        if call:
            cd = _call_with_patient(call)
            cd["assignment_id"] = a.id
            calls_by_unit.setdefault(a.unit_id, []).append(cd)

    completed_by_unit = {}
    for a in completed_assignments:
        call = db.session.get(Call, a.call_id)
        if call and call.status == "completed":
            cd = _call_with_patient(call)
            cd["assignment_id"] = a.id
            completed_by_unit.setdefault(a.unit_id, []).append(cd)

    unit_dicts = []
    for unit in units:
        ud = unit.to_dict()
        ud["crewCount"] = _crew_count(unit)
        ud["assignedCalls"] = calls_by_unit.get(unit.id, [])
        ud["completedCalls"] = completed_by_unit.get(unit.id, [])
        unit_dicts.append(ud)

    # Only "new" status calls appear in Open Calls column
    open_only = [c for c in open_calls if c.status == "new"]

    return jsonify({
        "date": date,
        "openCalls": [_call_with_patient(c) for c in open_only],
        "units": unit_dicts,
    })


@dispatch_bp.route("/assign", methods=["POST"])
def assign_call():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    call_id = data.get("call_id")
    unit_id = data.get("unit_id")

    if not call_id or not unit_id:
        return jsonify({"error": "call_id and unit_id are required"}), 400

    call = db.session.get(Call, call_id)
    if not call:
        return jsonify({"error": "Call not found"}), 404

    unit = db.session.get(DailyCrewUnit, unit_id)
    if not unit:
        return jsonify({"error": "Unit not found"}), 404

    existing = CallAssignment.query.filter_by(call_id=call_id, is_active=True).first()
    if existing:
        existing.is_active = False

    assignment = CallAssignment(
        call_id=call_id,
        unit_id=unit_id,
        assigned_at=datetime.now().isoformat(timespec="seconds"),
        assigned_by=data.get("assigned_by", ""),
    )
    db.session.add(assignment)
    call.status = "assigned"
    db.session.commit()

    return jsonify(assignment.to_dict()), 201


@dispatch_bp.route("/assign/<int:assignment_id>", methods=["DELETE"])
def unassign_call(assignment_id):
    assignment = db.session.get(CallAssignment, assignment_id)
    if not assignment:
        return jsonify({"error": "Assignment not found"}), 404

    assignment.is_active = False

    call = db.session.get(Call, assignment.call_id)
    if call:
        call.status = "new"

    db.session.commit()
    return jsonify({"ok": True})


@dispatch_bp.route("/assign/<int:assignment_id>/complete", methods=["PATCH"])
def complete_assignment(assignment_id):
    assignment = db.session.get(CallAssignment, assignment_id)
    if not assignment:
        return jsonify({"error": "Assignment not found"}), 404

    assignment.is_active = False

    call = db.session.get(Call, assignment.call_id)
    if call:
        call.status = "completed"

    db.session.commit()
    return jsonify({"ok": True})


@dispatch_bp.route("/assign/<int:assignment_id>/reopen", methods=["PATCH"])
def reopen_assignment(assignment_id):
    assignment = db.session.get(CallAssignment, assignment_id)
    if not assignment:
        return jsonify({"error": "Assignment not found"}), 404

    assignment.is_active = True

    call = db.session.get(Call, assignment.call_id)
    if call:
        call.status = "assigned"

    db.session.commit()
    return jsonify({"ok": True})


@dispatch_bp.route("/units/<int:unit_id>/status", methods=["PATCH"])
def update_unit_status(unit_id):
    unit = db.session.get(DailyCrewUnit, unit_id)
    if not unit:
        return jsonify({"error": "Unit not found"}), 404

    data = request.get_json()
    status = data.get("status", "").strip()

    if status not in VALID_UNIT_STATUSES:
        return jsonify({"error": f"Invalid status. Valid: {VALID_UNIT_STATUSES}"}), 400

    unit.dispatch_status = status
    db.session.commit()

    ud = unit.to_dict()
    ud["crewCount"] = _crew_count(unit)
    return jsonify(ud)
