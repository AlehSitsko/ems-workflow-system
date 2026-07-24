from datetime import datetime

from flask import Blueprint, jsonify, request

from models import db, TimeEntry, EmployeePayConfig, Employee
from audit_utils import log_action
from utils.auth_utils import get_request_user_id, get_request_user_name


def _audit_user():
    return get_request_user_id(), get_request_user_name()

time_bp = Blueprint("time", __name__, url_prefix="/api")


# ── Time Entries ───────────────────────────────────────────────────────────

@time_bp.route("/employees/<int:employee_id>/time-entries", methods=["GET"])
def get_time_entries(employee_id):
    Employee.query.get_or_404(employee_id)
    date_from = request.args.get("date_from", "").strip()
    date_to = request.args.get("date_to", "").strip()

    query = TimeEntry.query.filter(TimeEntry.employee_id == employee_id)
    if date_from:
        query = query.filter(TimeEntry.clock_in >= date_from)
    if date_to:
        query = query.filter(TimeEntry.clock_in < date_to + "T99")

    entries = query.order_by(TimeEntry.clock_in.desc()).all()
    return jsonify([e.to_dict() for e in entries])


@time_bp.route("/employees/<int:employee_id>/time-entries", methods=["POST"])
def create_time_entry(employee_id):
    Employee.query.get_or_404(employee_id)
    data = request.get_json() or {}

    entry = TimeEntry(
        employee_id=employee_id,
        clock_in=data.get("clock_in") or datetime.now().isoformat(timespec="seconds"),
        clock_out=data.get("clock_out"),
        break_minutes=data.get("break_minutes", 0),
        entry_type=data.get("entry_type", "manual"),
        status=data.get("status", "approved"),
        notes=data.get("notes"),
        created_by=data.get("created_by"),
    )
    db.session.add(entry)
    db.session.flush()
    if entry.entry_type == "manual":
        uid, uname = _audit_user()
        log_action("time_entry.created", "time_entry", entry.id,
                   f"Employee #{employee_id}",
                   {"clock_in": entry.clock_in, "clock_out": entry.clock_out, "type": "manual"},
                   user_id=uid, user_name=uname or data.get("created_by"))
    db.session.commit()
    return jsonify(entry.to_dict()), 201


@time_bp.route("/time-entries/<int:entry_id>", methods=["PATCH"])
def update_time_entry(entry_id):
    entry = TimeEntry.query.get_or_404(entry_id)
    data = request.get_json() or {}

    for field in ("clock_in", "clock_out", "break_minutes", "entry_type", "status", "notes"):
        if field in data:
            setattr(entry, field, data[field])

    if "approved_by" in data:
        entry.approved_by = data["approved_by"]
        entry.approved_at = datetime.now().isoformat(timespec="seconds")

    uid, uname = _audit_user()
    log_action("time_entry.updated", "time_entry", entry_id,
               f"Employee #{entry.employee_id}",
               {k: data[k] for k in ("clock_in", "clock_out", "status", "approved_by") if k in data},
               user_id=uid, user_name=uname)
    db.session.commit()
    return jsonify(entry.to_dict())


@time_bp.route("/time-entries/<int:entry_id>", methods=["DELETE"])
def delete_time_entry(entry_id):
    entry = TimeEntry.query.get_or_404(entry_id)
    uid, uname = _audit_user()
    log_action("time_entry.deleted", "time_entry", entry_id,
               f"Employee #{entry.employee_id}",
               {"clock_in": entry.clock_in, "clock_out": entry.clock_out},
               user_id=uid, user_name=uname)
    db.session.delete(entry)
    db.session.commit()
    return jsonify({"ok": True})


# ── Kiosk: clock in/out by employee id (no auth required) ─────────────────

@time_bp.route("/kiosk/employees", methods=["GET"])
def kiosk_employee_list():
    """Returns minimal employee list for kiosk PIN/name selection."""
    employees = Employee.query.filter(Employee.is_active.is_(True)).order_by(Employee.last_name).all()
    return jsonify([
        {"id": e.id, "name": f"{e.first_name} {e.last_name}", "has_pin": bool(e.kiosk_pin)}
        for e in employees
    ])


@time_bp.route("/kiosk/verify-pin", methods=["POST"])
def kiosk_verify_pin():
    data = request.get_json() or {}
    eid = data.get("employee_id")
    pin = data.get("pin", "")
    if not eid:
        return jsonify({"error": "employee_id required"}), 400
    employee = Employee.query.get_or_404(eid)
    if employee.kiosk_pin and pin != employee.kiosk_pin:
        return jsonify({"error": "Invalid PIN"}), 403
    return jsonify({"ok": True})


@time_bp.route("/kiosk/status/<int:employee_id>", methods=["GET"])
def kiosk_status(employee_id):
    """Returns current clock-in state for an employee."""
    active = TimeEntry.query.filter(
        TimeEntry.employee_id == employee_id,
        TimeEntry.clock_out == None,
        TimeEntry.entry_type == "clock",
    ).order_by(TimeEntry.clock_in.desc()).first()
    return jsonify({
        "clocked_in": active is not None,
        "entry_id": active.id if active else None,
        "clock_in": active.clock_in if active else None,
    })


@time_bp.route("/kiosk/clock-in", methods=["POST"])
def kiosk_clock_in(employee_id=None):
    data = request.get_json() or {}
    eid = data.get("employee_id")
    if not eid:
        return jsonify({"error": "employee_id required"}), 400

    employee = Employee.query.get_or_404(eid)

    if employee.kiosk_pin:
        if data.get("pin") != employee.kiosk_pin:
            return jsonify({"error": "Invalid PIN"}), 403

    # Prevent double clock-in
    active = TimeEntry.query.filter(
        TimeEntry.employee_id == eid,
        TimeEntry.clock_out == None,
        TimeEntry.entry_type == "clock",
    ).first()
    if active:
        return jsonify({"error": "Already clocked in", "entry_id": active.id}), 409

    entry = TimeEntry(
        employee_id=eid,
        clock_in=datetime.now().isoformat(timespec="seconds"),
        entry_type="clock",
        status="approved",
    )
    db.session.add(entry)
    db.session.commit()
    return jsonify({"ok": True, "entry": entry.to_dict()}), 201


@time_bp.route("/kiosk/clock-out", methods=["POST"])
def kiosk_clock_out():
    data = request.get_json() or {}
    eid = data.get("employee_id")
    if not eid:
        return jsonify({"error": "employee_id required"}), 400

    employee = Employee.query.get_or_404(eid)

    if employee.kiosk_pin:
        if data.get("pin") != employee.kiosk_pin:
            return jsonify({"error": "Invalid PIN"}), 403

    active = TimeEntry.query.filter(
        TimeEntry.employee_id == eid,
        TimeEntry.clock_out == None,
        TimeEntry.entry_type == "clock",
    ).order_by(TimeEntry.clock_in.desc()).first()

    if not active:
        return jsonify({"error": "Not clocked in"}), 409

    active.clock_out = datetime.now().isoformat(timespec="seconds")
    db.session.commit()
    return jsonify({"ok": True, "entry": active.to_dict()})


# ── Pay Config ─────────────────────────────────────────────────────────────

@time_bp.route("/employees/<int:employee_id>/pay-config", methods=["GET"])
def get_pay_config(employee_id):
    Employee.query.get_or_404(employee_id)
    config = EmployeePayConfig.query.filter_by(employee_id=employee_id).order_by(
        EmployeePayConfig.effective_from.desc()
    ).first()
    if not config:
        return jsonify(None)
    return jsonify(config.to_dict())


@time_bp.route("/employees/<int:employee_id>/pay-config", methods=["PUT"])
def upsert_pay_config(employee_id):
    Employee.query.get_or_404(employee_id)
    data = request.get_json() or {}

    config = EmployeePayConfig.query.filter_by(employee_id=employee_id).order_by(
        EmployeePayConfig.effective_from.desc()
    ).first()

    if not config:
        config = EmployeePayConfig(employee_id=employee_id)
        db.session.add(config)

    config.pay_type = data.get("pay_type", config.pay_type or "hourly")
    config.hourly_rate = data.get("hourly_rate", config.hourly_rate or 0.0)
    config.overtime_rate = data.get("overtime_rate", config.overtime_rate or 1.5)
    config.overtime_after = data.get("overtime_after", config.overtime_after or 40)
    config.effective_from = data.get("effective_from", config.effective_from)

    db.session.commit()
    return jsonify(config.to_dict())
