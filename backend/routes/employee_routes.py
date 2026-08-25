from datetime import datetime

from flask import Blueprint, jsonify, request

from models import db, Employee, DailyCrewUnit, EmploymentEvent, DisciplinaryAction, Organization
from utils.employee_utils import apply_employee_data
from utils.employee_shifts import employee_shifts
from notification_utils import create_notification
from utils.auth_utils import require_role, get_request_user_id, get_request_user_name, ALL_ROLES
from utils.validation_utils import is_valid_date
from audit_utils import log_action
from core.security.keyring import encryption_configured
from core.security.encrypted_fields import encrypt_instance

# Contact PII encrypted at rest (mirrors the patient pattern). Not searched, so no
# blind index. A no-op when no master key is configured (plaintext passthrough).
_EMPLOYEE_ENC_FIELDS = [("phone", None), ("email", None), ("dob", None)]


def _encrypt_employee_fields(employee):
    # dob_month_day is kept in sync by a model-level listener (models/__init__.py).
    if not encryption_configured():
        return
    org = Organization.query.get(employee.org_id) if employee.org_id else None
    encrypt_instance(employee, org, "employee", _EMPLOYEE_ENC_FIELDS)

# Managing employee records is an admin/supervisor/HR function. The LIST is
# readable by every *staff* role — the Dispatch Board and Crew Planner
# (dispatcher-accessible) read it to populate crew dropdowns, and it carries no
# salary data — but not by an `employee` portal login, which has no business with
# the roster (and it would otherwise leak names + dates of birth). ALL_ROLES is
# the four staff roles; `employee` is deliberately not in it. Detail and mutations
# are the HR-record surface and are gated tighter.
_RECORD_ROLES = ("admin", "supervisor", "hr")


# Blueprint for employee management routes.
employee_bp = Blueprint("employee", __name__, url_prefix="/api/employees")


# Return all employees ordered by last name and first name.
@employee_bp.route("", methods=["GET"])
@require_role(*ALL_ROLES)
def get_employees():
    employees = Employee.query.order_by(
        Employee.last_name.asc(),
        Employee.first_name.asc()
    ).all()

    return jsonify([employee.to_dict() for employee in employees])


# Return a single employee by id — backs the Employee Workspace.
@employee_bp.route("/<int:id>", methods=["GET"])
@require_role(*_RECORD_ROLES)
def get_employee(id):
    employee = Employee.query.get(id)

    if not employee:
        return jsonify({"error": "Employee not found"}), 404

    # Detail is HR-gated and backs the edit form, which prefills the kiosk PIN —
    # the one payload allowed to carry it (see Employee.to_dict).
    return jsonify(employee.to_dict())


# Shifts this employee has been rostered on, newest first — backs the Employee
# Workspace "Schedule" tab. An employee can hold any of the four crew slots, so
# the shift also reports which role they worked.
@employee_bp.route("/<int:id>/shifts", methods=["GET"])
@require_role(*_RECORD_ROLES)
def list_employee_shifts(id):
    employee = Employee.query.get(id)
    if not employee:
        return jsonify({"error": "Employee not found"}), 404

    try:
        limit = min(int(request.args.get("limit", 50)), 200)
    except (TypeError, ValueError):
        return jsonify({"error": "limit must be an integer"}), 400

    return jsonify(employee_shifts(id, limit))


# Create a new employee record.
@employee_bp.route("", methods=["POST"])
@require_role(*_RECORD_ROLES)
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
    db.session.flush()               # id now known → AAD can bind it
    _encrypt_employee_fields(employee)
    db.session.commit()

    create_notification(
        "employee_added", "info",
        f"New employee added: {employee.first_name} {employee.last_name}",
        f"Role: {employee.role or 'EMT'}",
        entity_type="employee", entity_id=employee.id,
    )

    return jsonify(employee.to_dict()), 201


# Update an existing employee record.
@employee_bp.route("/<int:id>", methods=["PUT"])
@require_role(*_RECORD_ROLES)
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

    _encrypt_employee_fields(employee)   # re-encrypt any changed contact fields
    db.session.commit()

    return jsonify(employee.to_dict())


# Delete an employee record.
@employee_bp.route("/<int:id>", methods=["DELETE"])
@require_role(*_RECORD_ROLES)
def delete_employee(id):
    employee = Employee.query.get(id)

    if not employee:
        return jsonify({"error": "Employee not found"}), 404

    db.session.delete(employee)
    db.session.commit()

    return jsonify({"message": "Employee deleted"})


# ── Employment history ───────────────────────────────────────────────────────
#
# A per-employee timeline of hires, position and status changes, terminations,
# rehires and notes. Append-only: the Employee row holds the *current* position
# and status, so this records how it got there rather than being edited in place.
# Same HR-record gate as the rest of the employee detail surface.

_EMPLOYMENT_EVENT_TYPES = {
    "hired", "position_change", "status_change",
    "pay_change", "terminated", "rehired", "note",
}


@employee_bp.route("/<int:id>/employment", methods=["GET"])
@require_role(*_RECORD_ROLES)
def list_employment_events(id):
    if not Employee.query.get(id):
        return jsonify({"error": "Employee not found"}), 404

    # Newest first — the timeline reads top-down from the most recent change.
    events = (
        EmploymentEvent.query
        .filter_by(employee_id=id)
        .order_by(EmploymentEvent.effective_date.desc(), EmploymentEvent.id.desc())
        .all()
    )
    return jsonify([e.to_dict() for e in events])


@employee_bp.route("/<int:id>/employment", methods=["POST"])
@require_role(*_RECORD_ROLES)
def create_employment_event(id):
    employee = Employee.query.get(id)
    if not employee:
        return jsonify({"error": "Employee not found"}), 404

    data = request.get_json() or {}

    event_type = (data.get("eventType") or "").strip()
    if event_type not in _EMPLOYMENT_EVENT_TYPES:
        return jsonify({"error": "Invalid or missing eventType"}), 400

    effective_date = (data.get("effectiveDate") or "").strip()
    if not is_valid_date(effective_date):
        return jsonify({"error": "effectiveDate must be a real YYYY-MM-DD date"}), 400

    uid, uname = get_request_user_id(), get_request_user_name()
    event = EmploymentEvent(
        employee_id=id,
        event_type=event_type,
        effective_date=effective_date,
        title=(data.get("title") or "").strip() or None,
        employment_type=(data.get("employmentType") or "").strip() or None,
        status=(data.get("status") or "").strip() or None,
        note=(data.get("note") or "").strip() or None,
        created_by=uid,
        created_by_name=uname,
        created_at=datetime.now().isoformat(timespec="seconds"),
    )
    db.session.add(event)

    log_action(
        "employment.event_added", "employee", id,
        f"{employee.first_name} {employee.last_name}",
        {"type": event_type, "effectiveDate": effective_date},
        user_id=uid, user_name=uname,
    )
    db.session.commit()
    return jsonify(event.to_dict()), 201


@employee_bp.route("/employment/<int:event_id>", methods=["DELETE"])
@require_role(*_RECORD_ROLES)
def delete_employment_event(event_id):
    """Remove a mistaken entry. The history is append-only, so a correction is a
    delete of the wrong row, not an edit of it."""
    event = EmploymentEvent.query.get(event_id)
    # The event carries no org_id; reach it through the org-filtered employee so
    # one org cannot delete another's history by guessing an event id.
    if not event or not Employee.query.filter_by(id=event.employee_id).first():
        return jsonify({"error": "Employment event not found"}), 404

    uid, uname = get_request_user_id(), get_request_user_name()
    log_action(
        "employment.event_removed", "employee", event.employee_id,
        None, {"eventId": event_id, "type": event.event_type},
        user_id=uid, user_name=uname,
    )
    db.session.delete(event)
    db.session.commit()
    return jsonify({"message": "Employment event deleted"})


# ── Disciplinary record ──────────────────────────────────────────────────────
#
# Warnings, suspensions, corrective actions and notes. More sensitive than the
# rest of the employee surface, so it is narrowed to admin/HR — a supervisor who
# can open the workspace still cannot read or write this record, and the tab is
# hidden from them in the UI to match. Append-only like employment history, with
# one field (acknowledged) that changes after issuance.

_HR_RECORD_ROLES = ("admin", "hr")

_DISCIPLINARY_ACTION_TYPES = {
    "verbal_warning", "written_warning", "final_warning",
    "suspension", "corrective_action", "note",
}
_DISCIPLINARY_SEVERITIES = {"", "low", "medium", "high"}


@employee_bp.route("/<int:id>/disciplinary", methods=["GET"])
@require_role(*_HR_RECORD_ROLES)
def list_disciplinary_actions(id):
    if not Employee.query.get(id):
        return jsonify({"error": "Employee not found"}), 404

    actions = (
        DisciplinaryAction.query
        .filter_by(employee_id=id)
        .order_by(DisciplinaryAction.action_date.desc(), DisciplinaryAction.id.desc())
        .all()
    )
    return jsonify([a.to_dict() for a in actions])


@employee_bp.route("/<int:id>/disciplinary", methods=["POST"])
@require_role(*_HR_RECORD_ROLES)
def create_disciplinary_action(id):
    employee = Employee.query.get(id)
    if not employee:
        return jsonify({"error": "Employee not found"}), 404

    data = request.get_json() or {}

    action_type = (data.get("actionType") or "").strip()
    if action_type not in _DISCIPLINARY_ACTION_TYPES:
        return jsonify({"error": "Invalid or missing actionType"}), 400

    action_date = (data.get("actionDate") or "").strip()
    if not is_valid_date(action_date):
        return jsonify({"error": "actionDate must be a real YYYY-MM-DD date"}), 400

    severity = (data.get("severity") or "").strip()
    if severity not in _DISCIPLINARY_SEVERITIES:
        return jsonify({"error": "severity must be low, medium or high"}), 400

    uid, uname = get_request_user_id(), get_request_user_name()
    action = DisciplinaryAction(
        employee_id=id,
        action_type=action_type,
        action_date=action_date,
        severity=severity or None,
        subject=(data.get("subject") or "").strip() or None,
        description=(data.get("description") or "").strip() or None,
        acknowledged=bool(data.get("acknowledged", False)),
        created_by=uid,
        created_by_name=uname,
        created_at=datetime.now().isoformat(timespec="seconds"),
    )
    db.session.add(action)

    # The details never enter the audit trail — only that an action was recorded,
    # so the audit log itself does not become a second copy of the HR record.
    log_action(
        "disciplinary.action_added", "employee", id,
        f"{employee.first_name} {employee.last_name}",
        {"type": action_type, "actionDate": action_date},
        user_id=uid, user_name=uname,
    )
    db.session.commit()
    return jsonify(action.to_dict()), 201


@employee_bp.route("/disciplinary/<int:action_id>", methods=["PATCH"])
@require_role(*_HR_RECORD_ROLES)
def update_disciplinary_action(action_id):
    """Only the acknowledgement flips after issuance; the rest is the record as
    written and is not editable in place."""
    action = DisciplinaryAction.query.get(action_id)
    if not action or not Employee.query.filter_by(id=action.employee_id).first():
        return jsonify({"error": "Disciplinary action not found"}), 404

    data = request.get_json() or {}
    if "acknowledged" not in data:
        return jsonify({"error": "Only 'acknowledged' can be updated"}), 400

    action.acknowledged = bool(data["acknowledged"])
    uid, uname = get_request_user_id(), get_request_user_name()
    log_action(
        "disciplinary.action_acknowledged", "employee", action.employee_id,
        None, {"actionId": action_id, "acknowledged": action.acknowledged},
        user_id=uid, user_name=uname,
    )
    db.session.commit()
    return jsonify(action.to_dict())


@employee_bp.route("/disciplinary/<int:action_id>", methods=["DELETE"])
@require_role(*_HR_RECORD_ROLES)
def delete_disciplinary_action(action_id):
    action = DisciplinaryAction.query.get(action_id)
    if not action or not Employee.query.filter_by(id=action.employee_id).first():
        return jsonify({"error": "Disciplinary action not found"}), 404

    uid, uname = get_request_user_id(), get_request_user_name()
    log_action(
        "disciplinary.action_removed", "employee", action.employee_id,
        None, {"actionId": action_id, "type": action.action_type},
        user_id=uid, user_name=uname,
    )
    db.session.delete(action)
    db.session.commit()
    return jsonify({"message": "Disciplinary action deleted"})