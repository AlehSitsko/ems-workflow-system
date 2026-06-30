from datetime import datetime

from flask import Blueprint, jsonify, request

from models import db, Vehicle


vehicle_bp = Blueprint(
    "vehicle",
    __name__,
    url_prefix="/api/vehicles"
)


# Return all vehicles. ?active=1 filters to active vehicles only.
@vehicle_bp.route("", methods=["GET"])
def get_vehicles():
    query = Vehicle.query

    if request.args.get("active") == "1":
        query = query.filter_by(is_active=True)

    vehicles = query.order_by(Vehicle.unit_name.asc()).all()

    return jsonify([v.to_dict() for v in vehicles])


# Create a new vehicle.
@vehicle_bp.route("", methods=["POST"])
def create_vehicle():
    data = request.get_json()

    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    unit_name = (data.get("unitName") or "").strip()
    unit_number = (data.get("unitNumber") or "").strip()
    unit_type = (data.get("unitType") or "").strip()

    if not unit_name:
        return jsonify({"error": "Unit name is required"}), 400
    if not unit_number:
        return jsonify({"error": "Unit number is required"}), 400
    if not unit_type:
        return jsonify({"error": "Unit type is required"}), 400

    if Vehicle.query.filter_by(unit_number=unit_number).first():
        return jsonify({"error": f"Vehicle with unit number '{unit_number}' already exists"}), 409

    now = datetime.now().isoformat(timespec="seconds")

    vehicle = Vehicle(
        unit_name=unit_name,
        unit_number=unit_number,
        unit_type=unit_type,
        is_active=data.get("isActive", True),
        notes=(data.get("notes") or "").strip(),
        created_at=now,
        updated_at=now,
    )

    try:
        db.session.add(vehicle)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

    return jsonify(vehicle.to_dict()), 201


# Update an existing vehicle.
@vehicle_bp.route("/<int:id>", methods=["PUT"])
def update_vehicle(id):
    vehicle = Vehicle.query.get(id)

    if not vehicle:
        return jsonify({"error": "Vehicle not found"}), 404

    data = request.get_json()

    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    unit_name = (data.get("unitName") or "").strip()
    unit_number = (data.get("unitNumber") or "").strip()
    unit_type = (data.get("unitType") or "").strip()

    if not unit_name:
        return jsonify({"error": "Unit name is required"}), 400
    if not unit_number:
        return jsonify({"error": "Unit number is required"}), 400
    if not unit_type:
        return jsonify({"error": "Unit type is required"}), 400

    existing = Vehicle.query.filter_by(unit_number=unit_number).first()
    if existing and existing.id != id:
        return jsonify({"error": f"Vehicle with unit number '{unit_number}' already exists"}), 409

    vehicle.unit_name = unit_name
    vehicle.unit_number = unit_number
    vehicle.unit_type = unit_type
    vehicle.is_active = data.get("isActive", vehicle.is_active)
    vehicle.notes = (data.get("notes") or "").strip()
    vehicle.updated_at = datetime.now().isoformat(timespec="seconds")

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

    return jsonify(vehicle.to_dict())


# Deactivate/reactivate a vehicle without deleting history.
@vehicle_bp.route("/<int:id>/toggle-active", methods=["PATCH"])
def toggle_vehicle_active(id):
    vehicle = Vehicle.query.get(id)

    if not vehicle:
        return jsonify({"error": "Vehicle not found"}), 404

    vehicle.is_active = not vehicle.is_active
    vehicle.updated_at = datetime.now().isoformat(timespec="seconds")

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

    return jsonify(vehicle.to_dict())


# Delete a vehicle.
@vehicle_bp.route("/<int:id>", methods=["DELETE"])
def delete_vehicle(id):
    vehicle = Vehicle.query.get(id)

    if not vehicle:
        return jsonify({"error": "Vehicle not found"}), 404

    try:
        db.session.delete(vehicle)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

    return jsonify({"message": "Vehicle deleted"})
