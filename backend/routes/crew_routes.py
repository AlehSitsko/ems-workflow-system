import json
from datetime import datetime, timedelta

from flask import Blueprint, jsonify, request

from models import db, DailyCrewUnit, Vehicle
from utils.employee_utils import parse_optional_employee_id
from utils.validation_utils import is_valid_date, is_valid_time, check_length
from utils.auth_utils import require_role
from utils.operational_dates import prohibit_historical_mutation
from utils.taxonomy import canonicalize_or_keep, normalize_unit_type


# Crew units carry the day's patient order (PHI) and are operational planning
# data, so HR is excluded and anonymous requests are rejected outright.
CREW_ROLES = ("admin", "supervisor", "dispatcher")
from notification_utils import create_notification


crew_bp = Blueprint("crew", __name__, url_prefix="/api/crew-units")


def _validate_shift_datetimes(shift_date, start_time, end_time, end_date):
    """Return an error message string if any date/time field is malformed, else None."""
    if not is_valid_date(shift_date):
        return "Invalid shiftDate. Expected YYYY-MM-DD."
    if not is_valid_time(start_time):
        return "Invalid startTime. Expected HH:MM."
    if end_time and not is_valid_time(end_time):
        return "Invalid endTime. Expected HH:MM."
    if end_date and not is_valid_date(end_date):
        return "Invalid endDate. Expected YYYY-MM-DD."
    return None


def _resolve_vehicle(data, current_vehicle_id=None):
    """Resolve the fleet vehicle a shift runs on.

    Returns (vehicle_id, truck_number, error). `truck_number` is a snapshot of
    the vehicle's unit number so historical shifts keep reading correctly even
    if the vehicle is later renumbered.

    Clients that predate the fleet link send only `truckNumber`; that path is
    still accepted (the unit simply carries no vehicle_id) so the API does not
    break for them. Re-saving an existing unit without `vehicleId` keeps the
    link it already has rather than silently dropping it.
    """
    raw = data.get("vehicleId", "__absent__")

    if raw == "__absent__":
        return current_vehicle_id, (data.get("truckNumber") or "").strip(), None

    # An explicit null/empty clears the link (back to a free-text truck number).
    if raw is None or raw == "":
        return None, (data.get("truckNumber") or "").strip(), None

    try:
        vehicle_id = int(raw)
    except (TypeError, ValueError):
        return None, None, "vehicleId must be an integer"

    vehicle = Vehicle.query.get(vehicle_id)
    if not vehicle:
        return None, None, "Selected vehicle does not exist"
    if vehicle.is_retired:
        return None, None, f"{vehicle.unit_name} is retired and cannot be assigned to a shift"
    if not vehicle.is_active:
        return None, None, f"{vehicle.unit_name} is inactive and cannot be assigned to a shift"

    # An out-of-service vehicle is only a warning, not an error: the frontend
    # surfaces it, and dispatch may legitimately plan ahead of a repair.
    return vehicle.id, vehicle.unit_number, None


def _parse_duration(value):
    """Coerce shiftDurationHours to float, return None for invalid/missing values."""
    if value is None or value == "" or value == "custom":
        return None
    try:
        v = float(value)
        return v if v > 0 else None
    except (TypeError, ValueError):
        return None


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
@require_role(*CREW_ROLES)
def get_daily_crew_units():
    shift_date = request.args.get("shift_date", "").strip()
    query = DailyCrewUnit.query
    if shift_date:
        query = query.filter(DailyCrewUnit.shift_date == shift_date)
    units = query.order_by(DailyCrewUnit.start_time.asc(), DailyCrewUnit.id.asc()).all()
    return jsonify([unit.to_dict() for unit in units])


@crew_bp.route("", methods=["POST"])
@require_role(*CREW_ROLES)
def create_daily_crew_unit():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    shift_date = data.get("shiftDate", "").strip()
    start_time = data.get("startTime", "").strip()

    vehicle_id, truck_number, vehicle_error = _resolve_vehicle(data)
    if vehicle_error:
        return jsonify({"error": vehicle_error}), 400

    if not shift_date:
        return jsonify({"error": "Shift date is required"}), 400
    if not truck_number:
        return jsonify({"error": "Truck Number is required"}), 400
    if not start_time:
        return jsonify({"error": "Start Time is required"}), 400

    end_time = (data.get("endTime") or "").strip() or None
    end_date = (data.get("endDate") or "").strip() or None
    dt_error = _validate_shift_datetimes(shift_date, start_time, end_time, end_date)
    if dt_error:
        return jsonify({"error": dt_error}), 400

    # Crew shifts are planned for today or the future; a past board is read-only.
    historical = prohibit_historical_mutation(shift_date, "Saving a crew shift")
    if historical:
        return jsonify(historical[0]), historical[1]

    try:
        check_length(truck_number, 50, "truckNumber")
        check_length(data.get("notes"), 5000, "notes")
        check_length(data.get("delayReason"), 1000, "delayReason")
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    crew = data.get("crew") or {}

    try:
        driver_id = parse_optional_employee_id(crew.get("driver"))
        medical_id = parse_optional_employee_id(crew.get("medical"))
        assist1_id = parse_optional_employee_id(crew.get("assist1"))
        assist2_id = parse_optional_employee_id(crew.get("assist2"))
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    unit = DailyCrewUnit(
        shift_date=shift_date,
        unit_type=canonicalize_or_keep(data.get("unitType", "BLS"), normalize_unit_type),
        vehicle_id=vehicle_id,
        truck_number=truck_number,
        start_time=start_time,
        end_time=end_time,
        end_date=end_date,
        shift_type=data.get("shiftType", "day"),
        shift_duration_hours=_parse_duration(data.get("shiftDurationHours")),
        shift_status=data.get("shiftStatus", "scheduled"),
        actual_end_time=(data.get("actualEndTime") or "").strip() or None,
        delay_reason=(data.get("delayReason") or "").strip() or None,
        driver_id=driver_id,
        medical_id=medical_id,
        assist1_id=assist1_id,
        assist2_id=assist2_id,
        notes=data.get("notes", "").strip(),
        created_at=data.get("createdAt"),
        updated_at=data.get("updatedAt"),
    )
    _apply_patient_order(unit, data)

    try:
        db.session.add(unit)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

    if not any([unit.driver_id, unit.medical_id, unit.assist1_id, unit.assist2_id]):
        create_notification(
            "unit_understaffed", "warning",
            f"Unit {unit.truck_number} has no crew for {unit.shift_date}",
            f"Unit type: {unit.unit_type}. Please assign crew members.",
            entity_type="unit", entity_id=unit.id,
        )

    return jsonify(unit.to_dict()), 201


@crew_bp.route("/<int:id>", methods=["PUT"])
@require_role(*CREW_ROLES)
def update_daily_crew_unit(id):
    unit = DailyCrewUnit.query.get(id)
    if not unit:
        return jsonify({"error": "Crew unit not found"}), 404

    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    shift_date = data.get("shiftDate", "").strip()
    start_time = data.get("startTime", "").strip()

    vehicle_id, truck_number, vehicle_error = _resolve_vehicle(data, unit.vehicle_id)
    if vehicle_error:
        return jsonify({"error": vehicle_error}), 400

    if not shift_date:
        return jsonify({"error": "Shift date is required"}), 400
    if not truck_number:
        return jsonify({"error": "Truck Number is required"}), 400
    if not start_time:
        return jsonify({"error": "Start Time is required"}), 400

    end_time = (data.get("endTime") or "").strip() or None
    end_date = (data.get("endDate") or "").strip() or None
    dt_error = _validate_shift_datetimes(shift_date, start_time, end_time, end_date)
    if dt_error:
        return jsonify({"error": dt_error}), 400

    # Crew shifts are planned for today or the future; a past board is read-only.
    historical = prohibit_historical_mutation(shift_date, "Saving a crew shift")
    if historical:
        return jsonify(historical[0]), historical[1]

    try:
        check_length(truck_number, 50, "truckNumber")
        check_length(data.get("notes"), 5000, "notes")
        check_length(data.get("delayReason"), 1000, "delayReason")
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    crew = data.get("crew") or {}

    try:
        driver_id = parse_optional_employee_id(crew.get("driver"))
        medical_id = parse_optional_employee_id(crew.get("medical"))
        assist1_id = parse_optional_employee_id(crew.get("assist1"))
        assist2_id = parse_optional_employee_id(crew.get("assist2"))
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    unit.shift_date = shift_date
    unit.unit_type = canonicalize_or_keep(data.get("unitType", "BLS"), normalize_unit_type)
    unit.vehicle_id = vehicle_id
    unit.truck_number = truck_number
    unit.start_time = start_time
    unit.end_time = end_time
    unit.end_date = end_date
    unit.shift_type = data.get("shiftType", unit.shift_type or "day")
    if "shiftDurationHours" in data:
        unit.shift_duration_hours = _parse_duration(data.get("shiftDurationHours"))
    if "shiftStatus" in data:
        unit.shift_status = data.get("shiftStatus") or "scheduled"
    if "actualEndTime" in data:
        unit.actual_end_time = (data.get("actualEndTime") or "").strip() or None
    if "delayReason" in data:
        unit.delay_reason = (data.get("delayReason") or "").strip() or None
    unit.driver_id = driver_id
    unit.medical_id = medical_id
    unit.assist1_id = assist1_id
    unit.assist2_id = assist2_id
    unit.notes = data.get("notes", "").strip()
    unit.updated_at = data.get("updatedAt")
    _apply_patient_order(unit, data)

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500
    return jsonify(unit.to_dict())


@crew_bp.route("/<int:id>", methods=["DELETE"])
@require_role(*CREW_ROLES)
def delete_daily_crew_unit(id):
    unit = DailyCrewUnit.query.get(id)
    if not unit:
        return jsonify({"error": "Crew unit not found"}), 404

    historical = prohibit_historical_mutation(unit.shift_date, "Deleting a crew shift")
    if historical:
        return jsonify(historical[0]), historical[1]

    try:
        db.session.delete(unit)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500
    return jsonify({"message": "Crew unit deleted"})


@crew_bp.route("/<int:id>/make-night", methods=["POST"])
@require_role(*CREW_ROLES)
def make_night_crew(id):
    source = DailyCrewUnit.query.get_or_404(id)

    historical = prohibit_historical_mutation(source.shift_date, "Creating a night crew")
    if historical:
        return jsonify(historical[0]), historical[1]

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
        vehicle_id=source.vehicle_id,
        truck_number=source.truck_number,
        start_time=data.get("startTime", source.start_time),
        end_time=end_time,
        end_date=end_date,
        shift_duration_hours=source.shift_duration_hours,
        shift_status="scheduled",
        actual_end_time=None,
        delay_reason=None,
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
    try:
        db.session.add(night_unit)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500
    return jsonify(night_unit.to_dict()), 201


# ---------------------------------------------------------------------------
# Shift alert helper
# ---------------------------------------------------------------------------

def _compute_shift_alerts(unit, now_dt=None):
    """
    Return an alert dict for a unit if it is near_end or delayed, else None.

    Severity tiers:
      - near_end:  minutes_left in (15, 30]  → "warning"
                   minutes_left in (0, 15]   → "serious"
      - delayed:   delay_min in [1, 30)      → "minor"
                   delay_min in [30, 60)     → "warning"
                   delay_min in [60, 120)    → "serious"
                   delay_min >= 120          → "critical"
    """
    if not unit.start_time or not unit.shift_duration_hours:
        return None
    if unit.shift_status in ("completed", "cancelled"):
        return None

    planned_end_str = unit._compute_planned_end_time()
    if not planned_end_str:
        return None

    if now_dt is None:
        now_dt = datetime.now()

    try:
        planned_end_dt = datetime.strptime(
            f"{unit.shift_date} {planned_end_str}", "%Y-%m-%d %H:%M"
        )
        # Midnight crossover: planned end time earlier than start time means next day.
        if planned_end_str < unit.start_time:
            planned_end_dt += timedelta(days=1)
    except Exception:
        return None

    minutes_left = (planned_end_dt - now_dt).total_seconds() / 60

    if minutes_left > 30:
        return None  # not yet near end

    if minutes_left > 0:
        # Near-end window
        severity = "serious" if minutes_left <= 15 else "warning"
        return {
            "unitId": unit.id,
            "truckNumber": unit.truck_number,
            "unitType": unit.unit_type,
            "shiftDate": unit.shift_date,
            "alertType": "near_end",
            "severity": severity,
            "minutesLeft": round(minutes_left),
            "plannedEndTime": planned_end_str,
        }
    else:
        # Past planned end — delayed
        delay_min = abs(minutes_left)
        if delay_min < 30:
            severity = "minor"
        elif delay_min < 60:
            severity = "warning"
        elif delay_min < 120:
            severity = "serious"
        else:
            severity = "critical"
        return {
            "unitId": unit.id,
            "truckNumber": unit.truck_number,
            "unitType": unit.unit_type,
            "shiftDate": unit.shift_date,
            "alertType": "delayed",
            "severity": severity,
            "delayMinutes": round(delay_min),
            "plannedEndTime": planned_end_str,
        }


@crew_bp.route("/alerts", methods=["GET"])
@require_role(*CREW_ROLES)
def get_shift_alerts():
    """
    Return active near-end and delayed alerts for all non-completed units today.
    Optional ?date=YYYY-MM-DD to check a specific date.
    """
    date_filter = request.args.get("date", datetime.now().strftime("%Y-%m-%d"))
    units = DailyCrewUnit.query.filter_by(shift_date=date_filter).all()

    now_dt = datetime.now()
    alerts = []
    for unit in units:
        alert = _compute_shift_alerts(unit, now_dt)
        if alert:
            alerts.append(alert)

    # Sort: critical first
    severity_order = {"critical": 0, "serious": 1, "warning": 2, "minor": 3}
    alerts.sort(key=lambda a: severity_order.get(a["severity"], 9))

    return jsonify(alerts)
