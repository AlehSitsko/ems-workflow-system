import json
from datetime import datetime

from flask import Blueprint, jsonify, request

from models import db, Vehicle, VehicleOdometerEntry, VehicleMaintenanceRecord, DailyCrewUnit, Employee
from utils.validation_utils import check_length, is_valid_date
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

OPERATIONAL_STATUSES = {"in_service", "out_of_service", "maintenance"}
ODOMETER_UNITS = {"mi", "km"}
MAINTENANCE_TYPES = {"oil_change", "inspection", "tires", "brakes", "repair", "recall", "other"}
MAINTENANCE_STATUSES = {"scheduled", "in_progress", "completed", "cancelled"}

# A plausibility ceiling: a reading above this is far more likely a typo (an
# extra digit) than a real odometer, and a bad reading silently becomes the
# vehicle's "current" mileage.
MAX_ODOMETER_READING = 2_000_000


def _audit_user():
    return get_request_user_id(), get_request_user_name()


def _parse_capabilities(data, fallback):
    """Validated list of canonical capabilities, or [fallback] when absent.

    Raises ValueError on a malformed list or an unrecognised capability — a
    typo'd capability would silently make a vehicle look unsuitable for work it
    can actually do.
    """
    raw = data.get("capabilities")
    if raw is None:
        return [fallback]
    if not isinstance(raw, list):
        raise ValueError("capabilities must be a list")
    result = []
    for value in raw:
        canonical = normalize_vehicle_capability(value)
        if not canonical:
            raise ValueError(f"Invalid capability {value!r}. Must be one of: {VEHICLE_CAPABILITIES}")
        if canonical not in result:
            result.append(canonical)
    return result or [fallback]


def _int_or_none(value, field):
    """Parse an optional integer, raising ValueError with a useful message."""
    if value in ("", None):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        raise ValueError(f"{field} must be an integer")


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

    try:
        capabilities = _parse_capabilities(data, fallback=unit_type)
        model_year = _int_or_none(data.get("modelYear"), "modelYear")
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    now = datetime.now().isoformat(timespec="seconds")

    vehicle = Vehicle(
        unit_name=unit_name,
        unit_number=unit_number,
        unit_type=unit_type,
        capabilities=json.dumps(capabilities),
        is_active=data.get("isActive", True),
        notes=(data.get("notes") or "").strip(),
        inspection_expiry=(data.get("inspectionExpiry") or "").strip() or None,
        registration_expiry=(data.get("registrationExpiry") or "").strip() or None,
        insurance_expiry=(data.get("insuranceExpiry") or "").strip() or None,
        next_maintenance_date=(data.get("nextMaintenanceDate") or "").strip() or None,
        vin=(data.get("vin") or "").strip() or None,
        license_plate=(data.get("licensePlate") or "").strip() or None,
        plate_state=(data.get("plateState") or "").strip() or None,
        model_year=model_year,
        make=(data.get("make") or "").strip() or None,
        model=(data.get("model") or "").strip() or None,
        color=(data.get("color") or "").strip() or None,
        ownership_type=(data.get("ownershipType") or "").strip() or None,
        operational_status="in_service",
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

    try:
        capabilities = _parse_capabilities(data, fallback=unit_type)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    operational_status = (data.get("operationalStatus") or vehicle.operational_status or "in_service").strip()
    if operational_status not in OPERATIONAL_STATUSES:
        return jsonify({"error": f"Invalid operationalStatus. Must be one of: {sorted(OPERATIONAL_STATUSES)}"}), 400

    # Capture what actually changed, for the audit trail / Activity tab.
    incoming = {
        "unit_name": unit_name,
        "unit_number": unit_number,
        "unit_type": unit_type,
        "capabilities": json.dumps(capabilities),
        "is_active": data.get("isActive", vehicle.is_active),
        "notes": (data.get("notes") or "").strip(),
        "inspection_expiry": (data.get("inspectionExpiry") or "").strip() or None,
        "registration_expiry": (data.get("registrationExpiry") or "").strip() or None,
        "insurance_expiry": (data.get("insuranceExpiry") or "").strip() or None,
        "next_maintenance_date": (data.get("nextMaintenanceDate") or "").strip() or None,
        "operational_status": operational_status,
        "out_of_service_reason": (data.get("outOfServiceReason") or "").strip() or None,
        "vin": (data.get("vin") or "").strip() or None,
        "license_plate": (data.get("licensePlate") or "").strip() or None,
        "plate_state": (data.get("plateState") or "").strip() or None,
        "make": (data.get("make") or "").strip() or None,
        "model": (data.get("model") or "").strip() or None,
        "color": (data.get("color") or "").strip() or None,
        "ownership_type": (data.get("ownershipType") or "").strip() or None,
        "model_year": data.get("modelYear") if data.get("modelYear") not in ("", None) else None,
        "next_service_mileage": data.get("nextServiceMileage") if data.get("nextServiceMileage") not in ("", None) else None,
        "maintenance_notes": (data.get("maintenanceNotes") or "").strip() or None,
    }
    changed = [field for field, value in incoming.items() if getattr(vehicle, field) != value]

    for field, value in incoming.items():
        setattr(vehicle, field, value)
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

    # Never hard-delete a vehicle that history points at: shifts, maintenance and
    # odometer records must keep a valid reference. Retire it instead.
    shift_count = DailyCrewUnit.query.filter_by(vehicle_id=id).count()
    maintenance_count = VehicleMaintenanceRecord.query.filter_by(vehicle_id=id).count()
    odometer_count = VehicleOdometerEntry.query.filter_by(vehicle_id=id).count()
    if shift_count or maintenance_count or odometer_count:
        return jsonify({
            "error": f"Unit {vehicle.unit_number} has history and cannot be deleted. "
                     f"Retire it instead to keep that history intact.",
            "shifts": shift_count,
            "maintenanceRecords": maintenance_count,
            "odometerEntries": odometer_count,
        }), 409

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


# ── Shift history ───────────────────────────────────────────────────────────

@vehicle_bp.route("/<int:id>/shifts", methods=["GET"])
@require_role(*FLEET_VIEW_ROLES)
def list_vehicle_shifts(id):
    """Shifts this vehicle has been deployed on, newest first.

    Driven by the real `DailyCrewUnit.vehicle_id` link. Legacy units that only
    carry a matching `truck_number` are deliberately NOT included: truck numbers
    get reused and reassigned, so guessing would attribute another truck's work
    to this vehicle. Unlinked legacy shifts are surfaced by the
    `link-crew-units-to-vehicles` CLI instead.
    """
    Vehicle.query.get_or_404(id)

    try:
        limit = min(int(request.args.get("limit", 50)), 200)
    except (TypeError, ValueError):
        return jsonify({"error": "limit must be an integer"}), 400

    units = (DailyCrewUnit.query
             .filter_by(vehicle_id=id)
             .order_by(DailyCrewUnit.shift_date.desc(), DailyCrewUnit.start_time.desc())
             .limit(limit)
             .all())

    # Batch-load the crew so a long history does not fan out into one query per
    # shift per slot.
    crew_ids = {eid for u in units
                for eid in (u.driver_id, u.medical_id, u.assist1_id, u.assist2_id) if eid}
    employees = {}
    if crew_ids:
        employees = {e.id: e for e in Employee.query.filter(Employee.id.in_(crew_ids)).all()}

    def crew_name(emp_id):
        emp = employees.get(emp_id)
        if not emp:
            return None
        return f"{emp.first_name} {emp.last_name[0]}." if emp.last_name else emp.first_name

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
        "dispatchStatus": u.dispatch_status or "available",
        "crew": {
            "driver": crew_name(u.driver_id),
            "medical": crew_name(u.medical_id),
            "assist1": crew_name(u.assist1_id),
            "assist2": crew_name(u.assist2_id),
        },
        # Deep link back into the board for that operational day.
        "link": f"/dispatch?date={u.shift_date}&unit={u.id}",
    } for u in units])


# ── Odometer ────────────────────────────────────────────────────────────────

@vehicle_bp.route("/<int:id>/odometer", methods=["GET"])
@require_role(*FLEET_VIEW_ROLES)
def list_odometer_entries(id):
    """Mileage history, newest first."""
    Vehicle.query.get_or_404(id)
    entries = (VehicleOdometerEntry.query
               .filter_by(vehicle_id=id)
               .order_by(VehicleOdometerEntry.recorded_at.desc(), VehicleOdometerEntry.id.desc())
               .all())
    return jsonify([e.to_dict() for e in entries])


@vehicle_bp.route("/<int:id>/odometer", methods=["POST"])
@require_role(*FLEET_EDIT_ROLES)
def add_odometer_entry(id):
    """Record a mileage reading.

    An odometer only goes forward, so a reading below the current one is
    rejected unless the caller explicitly flags it as a correction — which is
    then recorded as such rather than quietly overwriting the history.
    """
    vehicle = Vehicle.query.get(id)
    if not vehicle:
        return jsonify({"error": "Vehicle not found"}), 404

    data = request.get_json() or {}

    try:
        reading = _int_or_none(data.get("reading"), "reading")
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    if reading is None:
        return jsonify({"error": "reading is required"}), 400
    if reading < 0:
        return jsonify({"error": "reading must not be negative"}), 400
    if reading > MAX_ODOMETER_READING:
        return jsonify({"error": f"reading looks implausible (over {MAX_ODOMETER_READING}) - check for a typo"}), 400

    unit = (data.get("unit") or vehicle.odometer_unit or "mi").strip()
    if unit not in ODOMETER_UNITS:
        return jsonify({"error": f"Invalid unit. Must be one of: {sorted(ODOMETER_UNITS)}"}), 400

    is_correction = bool(data.get("correction", False))
    if (vehicle.current_odometer is not None and reading < vehicle.current_odometer
            and not is_correction):
        return jsonify({
            "error": f"Reading {reading} is lower than the current odometer "
                     f"({vehicle.current_odometer}). An odometer does not run backwards - "
                     f"resend with correction=true if this is a correction.",
            "currentOdometer": vehicle.current_odometer,
        }), 409

    uid, uname = _audit_user()
    now = datetime.now().isoformat(timespec="seconds")
    entry = VehicleOdometerEntry(
        vehicle_id=id,
        reading=reading,
        unit=unit,
        recorded_at=now,
        recorded_by=uid,
        recorded_by_name=uname,
        source="correction" if is_correction else (data.get("source") or "manual"),
        notes=(data.get("notes") or "").strip() or None,
    )
    db.session.add(entry)

    # current_odometer is only a cache of the newest reading.
    latest = (VehicleOdometerEntry.query.filter_by(vehicle_id=id)
              .order_by(VehicleOdometerEntry.reading.desc()).first())
    if is_correction or latest is None or reading >= (latest.reading or 0):
        vehicle.current_odometer = reading
        vehicle.odometer_unit = unit
        vehicle.last_odometer_update = now

    log_action("vehicle.odometer_recorded", "vehicle", id, f"Unit {vehicle.unit_number}",
               {"reading": reading, "unit": unit, "correction": is_correction},
               user_id=uid, user_name=uname)
    db.session.commit()
    return jsonify(entry.to_dict()), 201


# ── Maintenance ─────────────────────────────────────────────────────────────

@vehicle_bp.route("/<int:id>/maintenance", methods=["GET"])
@require_role(*FLEET_VIEW_ROLES)
def list_maintenance(id):
    Vehicle.query.get_or_404(id)
    records = (VehicleMaintenanceRecord.query
               .filter_by(vehicle_id=id)
               .order_by(VehicleMaintenanceRecord.scheduled_date.desc(),
                         VehicleMaintenanceRecord.id.desc())
               .all())
    return jsonify([r.to_dict() for r in records])


def _validate_maintenance_payload(data, existing=None):
    """Shared validation for maintenance create/update.

    Returns a field dict, or raises ValueError with a message for the caller.
    """
    maintenance_type = (data.get("maintenanceType")
                        or (existing.maintenance_type if existing else "")).strip()
    if maintenance_type not in MAINTENANCE_TYPES:
        raise ValueError(f"Invalid maintenanceType. Must be one of: {sorted(MAINTENANCE_TYPES)}")

    status = (data.get("status") or (existing.status if existing else "scheduled")).strip()
    if status not in MAINTENANCE_STATUSES:
        raise ValueError(f"Invalid status. Must be one of: {sorted(MAINTENANCE_STATUSES)}")

    scheduled_date = data.get("scheduledDate", existing.scheduled_date if existing else None)
    scheduled_date = (scheduled_date or "").strip() or None
    if scheduled_date and not is_valid_date(scheduled_date):
        raise ValueError("scheduledDate must be a real calendar date in YYYY-MM-DD format")

    completed_date = data.get("completedDate", existing.completed_date if existing else None)
    completed_date = (completed_date or "").strip() or None
    if completed_date and not is_valid_date(completed_date):
        raise ValueError("completedDate must be a real calendar date in YYYY-MM-DD format")

    # A completed job with no completion date is how "when was this serviced?"
    # becomes unanswerable, so fill it rather than leaving the gap.
    if status == "completed" and not completed_date:
        completed_date = datetime.now().strftime("%Y-%m-%d")

    odometer_at_service = _int_or_none(
        data.get("odometerAtService", existing.odometer_at_service if existing else None),
        "odometerAtService")
    if odometer_at_service is not None and odometer_at_service < 0:
        raise ValueError("odometerAtService must not be negative")

    cost = data.get("cost", existing.cost if existing else None)
    if cost in ("", None):
        cost = None
    else:
        try:
            cost = float(cost)
        except (TypeError, ValueError):
            raise ValueError("cost must be a number")
        if cost < 0:
            raise ValueError("cost must not be negative")

    check_length(data.get("vendor"), 150, "vendor")
    check_length(data.get("description"), 2000, "description")
    check_length(data.get("notes"), 2000, "notes")

    return {
        "maintenance_type": maintenance_type,
        "status": status,
        "scheduled_date": scheduled_date,
        "completed_date": completed_date,
        "odometer_at_service": odometer_at_service,
        "vendor": (data.get("vendor") or (existing.vendor if existing else "") or "").strip() or None,
        "cost": cost,
        "description": (data.get("description") or (existing.description if existing else "") or "").strip() or None,
        "notes": (data.get("notes") or (existing.notes if existing else "") or "").strip() or None,
    }


def _sync_vehicle_service_summary(vehicle, record):
    """Keep the vehicle's last-service cache in step with its records.

    The records are the source of truth; these columns exist so the fleet list
    and readiness checks don't have to join history on every read.
    """
    if record.status != "completed" or not record.completed_date:
        return
    if not vehicle.last_service_date or record.completed_date >= vehicle.last_service_date:
        vehicle.last_service_date = record.completed_date
        if record.odometer_at_service is not None:
            vehicle.last_service_mileage = record.odometer_at_service


@vehicle_bp.route("/<int:id>/maintenance", methods=["POST"])
@require_role(*FLEET_EDIT_ROLES)
def create_maintenance(id):
    vehicle = Vehicle.query.get(id)
    if not vehicle:
        return jsonify({"error": "Vehicle not found"}), 404

    data = request.get_json() or {}
    try:
        fields = _validate_maintenance_payload(data)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    uid, uname = _audit_user()
    now = datetime.now().isoformat(timespec="seconds")
    record = VehicleMaintenanceRecord(vehicle_id=id, created_by=uid, created_at=now,
                                      updated_by=uid, updated_at=now, **fields)
    db.session.add(record)
    _sync_vehicle_service_summary(vehicle, record)

    log_action("vehicle.maintenance_created", "vehicle", id, f"Unit {vehicle.unit_number}",
               {"type": fields["maintenance_type"], "status": fields["status"]},
               user_id=uid, user_name=uname)
    db.session.commit()
    return jsonify(record.to_dict()), 201


@vehicle_bp.route("/maintenance/<int:record_id>", methods=["PATCH"])
@require_role(*FLEET_EDIT_ROLES)
def update_maintenance(record_id):
    record = VehicleMaintenanceRecord.query.get(record_id)
    # The record has no org_id; reach it through the org-filtered vehicle so one
    # org cannot edit another's maintenance by guessing a record id.
    if not record or not Vehicle.query.filter_by(id=record.vehicle_id).first():
        return jsonify({"error": "Maintenance record not found"}), 404

    data = request.get_json() or {}
    try:
        fields = _validate_maintenance_payload(data, existing=record)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    changed = [f for f, v in fields.items() if getattr(record, f) != v]
    for field, value in fields.items():
        setattr(record, field, value)

    uid, uname = _audit_user()
    record.updated_by = uid
    record.updated_at = datetime.now().isoformat(timespec="seconds")

    vehicle = db.session.get(Vehicle, record.vehicle_id)
    if vehicle:
        _sync_vehicle_service_summary(vehicle, record)
        log_action("vehicle.maintenance_updated", "vehicle", vehicle.id,
                   f"Unit {vehicle.unit_number}",
                   {"record_id": record_id, "changed_fields": sorted(changed)},
                   user_id=uid, user_name=uname)
    db.session.commit()
    return jsonify(record.to_dict())


# ── Retire / restore ────────────────────────────────────────────────────────

@vehicle_bp.route("/<int:id>/retire", methods=["POST"])
@require_role(*FLEET_EDIT_ROLES)
def retire_vehicle(id):
    """Retire a vehicle instead of deleting it.

    Shifts, maintenance and odometer history must keep a valid vehicle
    reference, so a vehicle leaves service by being retired, never removed.
    """
    vehicle = Vehicle.query.get(id)
    if not vehicle:
        return jsonify({"error": "Vehicle not found"}), 404
    if vehicle.is_retired:
        return jsonify({"error": f"Unit {vehicle.unit_number} is already retired"}), 409

    data = request.get_json() or {}
    reason = (data.get("reason") or "").strip()
    if not reason:
        return jsonify({"error": "A reason is required to retire a vehicle"}), 400

    vehicle.is_retired = True
    vehicle.retired_at = datetime.now().isoformat(timespec="seconds")
    vehicle.retired_reason = reason
    vehicle.is_active = False
    vehicle.updated_at = vehicle.retired_at

    uid, uname = _audit_user()
    log_action("vehicle.retired", "vehicle", id, f"Unit {vehicle.unit_number}",
               {"reason": reason}, user_id=uid, user_name=uname)
    db.session.commit()
    return jsonify(vehicle.to_dict())


@vehicle_bp.route("/<int:id>/unretire", methods=["POST"])
@require_role(*FLEET_EDIT_ROLES)
def unretire_vehicle(id):
    vehicle = Vehicle.query.get(id)
    if not vehicle:
        return jsonify({"error": "Vehicle not found"}), 404
    if not vehicle.is_retired:
        return jsonify({"error": f"Unit {vehicle.unit_number} is not retired"}), 409

    vehicle.is_retired = False
    vehicle.retired_at = None
    vehicle.retired_reason = None
    vehicle.is_active = True
    vehicle.updated_at = datetime.now().isoformat(timespec="seconds")

    uid, uname = _audit_user()
    log_action("vehicle.unretired", "vehicle", id, f"Unit {vehicle.unit_number}",
               None, user_id=uid, user_name=uname)
    db.session.commit()
    return jsonify(vehicle.to_dict())
