from flask import Blueprint, jsonify, request

from models import db, Employee, DailyCrewUnit
from utils.employee_utils import apply_employee_data
from notification_utils import create_notification
from utils.auth_utils import require_role

# Managing employee records is an admin/supervisor/HR function. The LIST stays
# open to any signed-in user on purpose: the Dispatch Board and Crew Planner
# (dispatcher-accessible) read it to populate crew dropdowns, and it carries no
# salary data. Detail and mutations are the HR-record surface and are gated.
_RECORD_ROLES = ("admin", "supervisor", "hr")


# Blueprint for employee management routes.
employee_bp = Blueprint("employee", __name__, url_prefix="/api/employees")


# Return all employees ordered by last name and first name.
@employee_bp.route("", methods=["GET"])
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
    return jsonify(employee.to_dict(include_pin=True))


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

    SLOT_ROLES = {
        "driver_id": "Driver",
        "medical_id": "Medical",
        "assist1_id": "Assist",
        "assist2_id": "Assist",
    }

    units = (DailyCrewUnit.query
             .filter(db.or_(
                 DailyCrewUnit.driver_id == id,
                 DailyCrewUnit.medical_id == id,
                 DailyCrewUnit.assist1_id == id,
                 DailyCrewUnit.assist2_id == id,
             ))
             .order_by(DailyCrewUnit.shift_date.desc(), DailyCrewUnit.start_time.desc())
             .limit(limit)
             .all())

    def role_on(unit):
        for slot, label in SLOT_ROLES.items():
            if getattr(unit, slot) == id:
                return label
        return None

    return jsonify([{
        "id": u.id,
        "shiftDate": u.shift_date,
        "unitType": u.unit_type,
        "truckNumber": u.truck_number,
        "startTime": u.start_time,
        "endTime": u.end_time or "",
        "endDate": u.end_date or "",
        "shiftType": u.shift_type or "day",
        "shiftStatus": u.shift_status or "scheduled",
        "role": role_on(u),
    } for u in units])


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