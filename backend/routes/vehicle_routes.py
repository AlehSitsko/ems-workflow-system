from datetime import datetime

from flask import Blueprint, jsonify, request

from models import db, Vehicle
from utils.validation_utils import check_length
from utils.taxonomy import VEHICLE_CAPABILITIES, normalize_vehicle_capability
from utils.auth_utils import require_role, get_request_user_id, get_request_user_name
from audit_utils import log_action


vehicle_bp = Blueprint(
    "vehicle",
    __name__,
    url_prefix="/api/vehicles"
)

# Fleet is operational data. Admin/supervisor manage it; dispatchers need
# read-only visibility of what is available or out of service; HR has no
# operational reason to see the fleet.
FLEET_VIEW_ROLES = ("admin", "supervisor", "dispatcher")
FLEET_EDIT_ROLES = ("admin", "supervisor")


def _audit_user():
    return get_request_user_id(), get_request_user_name()


# Vehicle types come from the canonical taxonomy (utils/taxonomy.py) - they are
# no longer duplicated here or in the frontend. Legacy spellings ('BARI') are
# normalized to their canonical form ('Bariatric') on write.


# Return all vehicles. ?active=1 filters to active vehicles only.
@vehicle_bp.route("", methods=["GET"])
@require_role(*FLEET_VIEW_ROLES)
def get_vehicles():
    query = Vehicle.query

    if request.args.get("active") == "1":
        query = query.filter_by(is_active=True)

    vehicles = query.order_by(Vehicle.unit_name.asc()).all()

    return jsonify([v.to_dict() for v in vehicles])


# Return a single vehicle. Backs the Vehicle Workspace deep link
# (/fleet/vehicles/:id), so a shared URL resolves without loading the whole list.
@vehicle_bp.route("/<int:id>", methods=["GET"])
@require_role(*FLEET_VIEW_ROLES)
def get_vehicle(id):
    vehicle = Vehicle.query.get(id)

    if not vehicle:
        return jsonify({"error": "Vehicle not found"}), 404

    return jsonify(vehicle.to_dict())


# Create a new vehicle.
@vehicle_bp.route("", methods=["POST"])
@require_role(*FLEET_EDIT_ROLES)
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
    unit_type = normalize_vehicle_capability(unit_type)
    if not unit_type:
        return jsonify({"error": f"Invalid unit type. Must be one of: {VEHICLE_CAPABILITIES}"}), 400

    try:
        check_length(unit_name, 50, "unitName")
        check_length(unit_number, 50, "unitNumber")
        check_length(data.get("notes"), 2000, "notes")
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    if Vehicle.query.filter_by(unit_number=unit_number).first():
        return jsonify({"error": f"Vehicle with unit number '{unit_number}' already exists"}), 409

    now = datetime.now().isoformat(timespec="seconds")

    vehicle = Vehicle(
        unit_name=unit_name,
        unit_number=unit_number,
        unit_type=unit_type,
        is_active=data.get("isActive", True),
        notes=(data.get("notes") or "").strip(),
        inspection_expiry=(data.get("inspectionExpiry") or "").strip() or None,
        registration_expiry=(data.get("registrationExpiry") or "").strip() or None,
        insurance_expiry=(data.get("insuranceExpiry") or "").strip() or None,
        next_maintenance_date=(data.get("nextMaintenanceDate") or "").strip() or None,
        created_at=now,
        updated_at=now,
    )

    try:
        db.session.add(vehicle)
        db.session.flush()
        uid, uname = _audit_user()
        log_action("vehicle.created", "vehicle", vehicle.id,
                   f"Unit {vehicle.unit_number}",
                   {"unitName": vehicle.unit_name, "unitType": vehicle.unit_type},
                   user_id=uid, user_name=uname)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

    return jsonify(vehicle.to_dict()), 201


# Update an existing vehicle.
@vehicle_bp.route("/<int:id>", methods=["PUT"])
@require_role(*FLEET_EDIT_ROLES)
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
    unit_type = normalize_vehicle_capability(unit_type)
    if not unit_type:
        return jsonify({"error": f"Invalid unit type. Must be one of: {VEHICLE_CAPABILITIES}"}), 400

    try:
        check_length(unit_name, 50, "unitName")
        check_length(unit_number, 50, "unitNumber")
        check_length(data.get("notes"), 2000, "notes")
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    existing = Vehicle.query.filter_by(unit_number=unit_number).first()
    if existing and existing.id != id:
        return jsonify({"error": f"Vehicle with unit number '{unit_number}' already exists"}), 409

    # Capture what actually changed, for the audit trail / Activity tab.
    incoming = {
        "unit_name": unit_name,
        "unit_number": unit_number,
        "unit_type": unit_type,
        "is_active": data.get("isActive", vehicle.is_active),
        "notes": (data.get("notes") or "").strip(),
        "inspection_expiry": (data.get("inspectionExpiry") or "").strip() or None,
        "registration_expiry": (data.get("registrationExpiry") or "").strip() or None,
        "insurance_expiry": (data.get("insuranceExpiry") or "").strip() or None,
        "next_maintenance_date": (data.get("nextMaintenanceDate") or "").strip() or None,
    }
    changed = [field for field, value in incoming.items() if getattr(vehicle, field) != value]

    vehicle.unit_name = unit_name
    vehicle.unit_number = unit_number
    vehicle.unit_type = unit_type
    vehicle.is_active = data.get("isActive", vehicle.is_active)
    vehicle.notes = (data.get("notes") or "").strip()
    vehicle.inspection_expiry = (data.get("inspectionExpiry") or "").strip() or None
    vehicle.registration_expiry = (data.get("registrationExpiry") or "").strip() or None
    vehicle.insurance_expiry = (data.get("insuranceExpiry") or "").strip() or None
    vehicle.next_maintenance_date = (data.get("nextMaintenanceDate") or "").strip() or None
    vehicle.updated_at = datetime.now().isoformat(timespec="seconds")

    try:
        uid, uname = _audit_user()
        log_action("vehicle.updated", "vehicle", vehicle.id,
                   f"Unit {vehicle.unit_number}",
                   {"changed_fields": sorted(changed)},
                   user_id=uid, user_name=uname)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

    return jsonify(vehicle.to_dict())


# Deactivate/reactivate a vehicle without deleting history.
@vehicle_bp.route("/<int:id>/toggle-active", methods=["PATCH"])
@require_role(*FLEET_EDIT_ROLES)
def toggle_vehicle_active(id):
    vehicle = Vehicle.query.get(id)

    if not vehicle:
        return jsonify({"error": "Vehicle not found"}), 404

    vehicle.is_active = not vehicle.is_active
    vehicle.updated_at = datetime.now().isoformat(timespec="seconds")

    try:
        uid, uname = _audit_user()
        log_action("vehicle.activated" if vehicle.is_active else "vehicle.deactivated",
                   "vehicle", vehicle.id, f"Unit {vehicle.unit_number}",
                   {"isActive": vehicle.is_active},
                   user_id=uid, user_name=uname)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

    return jsonify(vehicle.to_dict())


# Delete a vehicle.
@vehicle_bp.route("/<int:id>", methods=["DELETE"])
@require_role(*FLEET_EDIT_ROLES)
def delete_vehicle(id):
    vehicle = Vehicle.query.get(id)

    if not vehicle:
        return jsonify({"error": "Vehicle not found"}), 404

    try:
        uid, uname = _audit_user()
        log_action("vehicle.deleted", "vehicle", vehicle.id,
                   f"Unit {vehicle.unit_number}",
                   {"unitName": vehicle.unit_name, "unitType": vehicle.unit_type},
                   user_id=uid, user_name=uname)
        db.session.delete(vehicle)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

    return jsonify({"message": "Vehicle deleted"})
