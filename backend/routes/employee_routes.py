from flask import Blueprint, jsonify, request

from models import db, Employee
from utils.employee_utils import apply_employee_data


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


# Create a new employee record.
@employee_bp.route("", methods=["POST"])
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


# Update an existing employee record.
@employee_bp.route("/<int:id>", methods=["PUT"])
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
def delete_employee(id):
    employee = Employee.query.get(id)

    if not employee:
        return jsonify({"error": "Employee not found"}), 404

    db.session.delete(employee)
    db.session.commit()

    return jsonify({"message": "Employee deleted"})