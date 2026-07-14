import json
from datetime import datetime

from flask import Blueprint, jsonify, request

from sqlalchemy.orm import joinedload

from models import db, Call, DailyCrewUnit, CallAssignment, Patient, PatientAlert, Employee
from notification_utils import create_notification
from audit_utils import log_action


def _audit_user():
    try:
        uid = int(request.headers.get("X-User-Id", 0)) or None
    except (ValueError, TypeError):
        uid = None
    name = request.headers.get("X-User-Name") or None
    return uid, name


dispatch_bp = Blueprint("dispatch", __name__, url_prefix="/api/dispatch")

VALID_UNIT_STATUSES = [
    "available",
    "en_route",
    "on_scene",
    "transporting",
    "at_destination",
    "out_of_service",
]


_ALERT_SEVERITY_RANK = {"critical": 3, "warning": 2, "info": 1}


def _call_with_patient(call, alerts_by_patient=None):
    d = call.to_dict()
    if call.patient_id:
        # Reuse the batch-loaded patient if the caller already cached one (see get_board),
        # falling back to a single lookup for callers that don't pre-cache.
        patient = getattr(call, "_patient_cache", None) or Patient.query.get(call.patient_id)
        if patient:
            d["patient_name"] = f"{patient.first_name} {patient.last_name}"
            d["patient_dob"] = patient.dob or ""
            d["patient_phone"] = patient.phone or ""
            d["patient_dispatch_comment"] = patient.dispatch_comment or ""
            d["patient_is_sensitive"] = bool(patient.is_sensitive)
        alerts = (alerts_by_patient or {}).get(call.patient_id, [])
        if alerts:
            d["patient_alert_severity"] = max(alerts, key=lambda a: _ALERT_SEVERITY_RANK.get(a, 0))
            d["patient_alert_count"] = len(alerts)
    return d


def _crew_count(unit):
    slots = [unit.driver_id, unit.medical_id, unit.assist1_id, unit.assist2_id]
    return sum(1 for s in slots if s is not None)


def _emp_short(emp_id, emp_cache=None):
    if not emp_id:
        return None
    emp = emp_cache.get(emp_id) if emp_cache else db.session.get(Employee, emp_id)
    if not emp:
        return None
    return f"{emp.first_name} {emp.last_name[0]}." if emp.last_name else emp.first_name


@dispatch_bp.route("/board", methods=["GET"])
def get_board():
    date = request.args.get("date", datetime.now().strftime("%Y-%m-%d"))

    all_day_calls = (
        Call.query
        .filter(Call.trip_date == date)
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

    # Batch-load all calls and patients referenced by assignments — eliminates N+1
    all_assignment_call_ids = list({a.call_id for a in active_assignments + completed_assignments})
    if all_assignment_call_ids:
        calls_bulk = {
            c.id: c for c in
            Call.query.filter(Call.id.in_(all_assignment_call_ids))
                      .options(joinedload(Call.patient))
                      .all()
        }
        for c in calls_bulk.values():
            c._patient_cache = c.patient
    else:
        calls_bulk = {}

    # Batch-load active alert severities for every patient referenced on the board —
    # one query instead of one per call, so cards can show a "Critical"/"Warning" badge.
    all_patient_ids = list({c.patient_id for c in list(all_day_calls) + list(calls_bulk.values()) if c.patient_id})
    alerts_by_patient = {}
    if all_patient_ids:
        today_str = datetime.now().strftime("%Y-%m-%d")
        active_alerts = (
            PatientAlert.query
            .filter(
                PatientAlert.patient_id.in_(all_patient_ids),
                PatientAlert.is_active == True,
                db.or_(PatientAlert.expires_at.is_(None), PatientAlert.expires_at >= today_str),
            )
            .all()
        )
        for a in active_alerts:
            alerts_by_patient.setdefault(a.patient_id, []).append(a.severity)

    # Batch-load all employees referenced by crew slots
    crew_ids = set()
    for unit in units:
        for eid in [unit.driver_id, unit.medical_id, unit.assist1_id, unit.assist2_id]:
            if eid:
                crew_ids.add(eid)
    emp_cache = {}
    if crew_ids:
        emp_cache = {e.id: e for e in Employee.query.filter(Employee.id.in_(crew_ids)).all()}

    calls_by_unit = {}
    for a in active_assignments:
        call = calls_bulk.get(a.call_id)
        if call:
            cd = _call_with_patient(call, alerts_by_patient)
            cd["assignment_id"] = a.id
            calls_by_unit.setdefault(a.unit_id, []).append(cd)

    completed_by_unit = {}
    for a in completed_assignments:
        call = calls_bulk.get(a.call_id)
        if call and call.status == "completed":
            cd = _call_with_patient(call, alerts_by_patient)
            cd["assignment_id"] = a.id
            completed_by_unit.setdefault(a.unit_id, []).append(cd)

    unit_dicts = []
    for unit in units:
        ud = unit.to_dict()
        ud["crewCount"] = _crew_count(unit)
        ud["crewNames"] = {
            "driver":  _emp_short(unit.driver_id, emp_cache),
            "medical": _emp_short(unit.medical_id, emp_cache),
        }
        ud["patientOrder"] = unit._parse_patient_order()
        ud["assignedCalls"] = calls_by_unit.get(unit.id, [])
        ud["completedCalls"] = completed_by_unit.get(unit.id, [])
        unit_dicts.append(ud)

    # Only "new" status calls appear in Open Calls column
    open_only     = [c for c in all_day_calls if c.status == "new"]
    completed_day = [c for c in all_day_calls if c.status == "completed"]
    cancelled_day = [c for c in all_day_calls if c.status == "cancelled"]

    # Batch-load last assignments for completed calls — avoids 1 query per completed call
    completed_day_ids = [c.id for c in completed_day]
    last_assignment_by_call = {}
    if completed_day_ids:
        from sqlalchemy import func
        subq = (
            db.session.query(
                CallAssignment.call_id,
                func.max(CallAssignment.id).label("max_id")
            )
            .filter(CallAssignment.call_id.in_(completed_day_ids), CallAssignment.is_active == False)
            .group_by(CallAssignment.call_id)
            .subquery()
        )
        for a in CallAssignment.query.join(subq, CallAssignment.id == subq.c.max_id).all():
            last_assignment_by_call[a.call_id] = a.id

    # Pre-cache patients for open/completed/cancelled calls
    day_calls_no_patient = [c for c in all_day_calls if not hasattr(c, "_patient_cache")]
    if day_calls_no_patient:
        day_patient_ids = list({c.patient_id for c in day_calls_no_patient if c.patient_id})
        if day_patient_ids:
            patients_map = {p.id: p for p in Patient.query.filter(Patient.id.in_(day_patient_ids)).all()}
            for c in day_calls_no_patient:
                c._patient_cache = patients_map.get(c.patient_id)

    def _completed_call_dict(call):
        d = _call_with_patient(call, alerts_by_patient)
        d["assignment_id"] = last_assignment_by_call.get(call.id)
        return d

    return jsonify({
        "date": date,
        "openCalls":      [_call_with_patient(c, alerts_by_patient) for c in open_only],
        "completedCalls": [_completed_call_dict(c) for c in completed_day],
        "cancelledCalls": [_call_with_patient(c, alerts_by_patient) for c in cancelled_day],
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
    uid, uname = _audit_user()
    log_action("call.assigned", "call", call_id,
               f"Call #{call_id}", {"unit_id": unit_id, "truck": unit.truck_number},
               user_id=uid, user_name=uname or data.get("assigned_by"))
    db.session.commit()

    # Warn if ALS call assigned to BLS unit.
    if (call.service_level or "").lower() == "als" and unit.unit_type.upper() == "BLS":
        create_notification(
            "call_als_on_bls", "warning",
            f"ALS call #{call.id} assigned to BLS unit {unit.truck_number}",
            f"{call.pickup_address or '?'} → {call.dropoff_address or '?'}",
            entity_type="call", entity_id=call.id,
        )

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

    uid, uname = _audit_user()
    log_action("call.unassigned", "call", assignment.call_id,
               f"Call #{assignment.call_id}", {"assignment_id": assignment_id},
               user_id=uid, user_name=uname)
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
        call.completed_at = datetime.now().isoformat(timespec="seconds")

    uid, uname = _audit_user()
    log_action("call.completed", "call", assignment.call_id,
               f"Call #{assignment.call_id}", {"assignment_id": assignment_id},
               user_id=uid, user_name=uname)
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

    uid, uname = _audit_user()
    log_action("call.reopened", "call", assignment.call_id,
               f"Call #{assignment.call_id}", {"assignment_id": assignment_id},
               user_id=uid, user_name=uname)
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

    # Live operational status transitions only apply to today's board. A unit on
    # a future date is in Planning Mode (assignments allowed, live lifecycle not)
    # and a past date is History Mode (read-only). This guards against a saved
    # /dispatch?date=... link accidentally advancing a non-today unit. shift_date
    # is a local operational date, so compare against local today (not UTC).
    today = datetime.now().strftime("%Y-%m-%d")
    if unit.shift_date and unit.shift_date != today:
        mode = "planning (future)" if unit.shift_date > today else "history (past)"
        return jsonify({
            "error": f"Live status changes are only allowed on today's board. "
                     f"Unit {unit.truck_number} is on {unit.shift_date} — {mode}.",
        }), 409

    old_status = unit.dispatch_status
    unit.dispatch_status = status
    unit.dispatch_status_changed_at = datetime.now().isoformat(timespec="seconds")
    uid, uname = _audit_user()

    # Stamp the active call on this unit with the corresponding lifecycle timestamp.
    STATUS_TO_CALL_FIELD = {
        "en_route":       "dispatched_at",
        "on_scene":       "arrived_pickup_at",
        "transporting":   "patient_loaded_at",
        "at_destination": "arrived_dest_at",
    }
    if status in STATUS_TO_CALL_FIELD:
        active_assignment = (
            CallAssignment.query
            .filter_by(unit_id=unit_id, is_active=True)
            .order_by(CallAssignment.id.desc())
            .first()
        )
        if active_assignment:
            active_call = db.session.get(Call, active_assignment.call_id)
            if active_call:
                field = STATUS_TO_CALL_FIELD[status]
                # Only stamp once — never overwrite an existing timestamp.
                if not getattr(active_call, field):
                    setattr(active_call, field, datetime.now().isoformat(timespec="seconds"))

    log_action("unit.status_changed", "unit", unit_id,
               f"Unit {unit.truck_number}",
               {"from": old_status, "to": status},
               user_id=uid, user_name=uname)
    db.session.commit()

    ud = unit.to_dict()
    ud["crewCount"] = _crew_count(unit)
    return jsonify(ud)


@dispatch_bp.route("/units/<int:unit_id>/call-order", methods=["PATCH"])
def update_call_order(unit_id):
    unit = db.session.get(DailyCrewUnit, unit_id)
    if not unit:
        return jsonify({"error": "Unit not found"}), 404
    data = request.get_json() or {}
    call_ids = data.get("callIds", [])
    unit.call_priority = json.dumps([int(i) for i in call_ids])
    db.session.commit()
    return jsonify({"ok": True, "callPriority": json.loads(unit.call_priority)})
