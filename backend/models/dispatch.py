"""Crew units, crew presets, and call assignments."""

import json
from .base import db


class DailyCrewUnit(db.Model):
    id = db.Column(db.Integer, primary_key=True)

    # Shift date.
    shift_date = db.Column(db.String(20), nullable=False, index=True)

    # Unit information.
    unit_type = db.Column(db.String(50), nullable=False)

    # The physical vehicle this unit runs. Nullable on purpose: legacy units
    # recorded only a free-text truck_number that often does not correspond to
    # any fleet record, and history must not be rewritten to fit a new FK.
    vehicle_id = db.Column(db.Integer, db.ForeignKey("vehicle.id"), nullable=True)
    # The physical vehicle behind this shift, so a unit's real capabilities (for
    # assignment suitability) come from what the vehicle can actually do.
    vehicle = db.relationship("Vehicle", foreign_keys=[vehicle_id])

    # Kept for backward compatibility and as the display/snapshot value. New
    # shifts fill it from the selected vehicle; legacy rows keep whatever was typed.
    truck_number = db.Column(db.String(50), nullable=False)
    start_time = db.Column(db.String(20), nullable=False)
    end_time = db.Column(db.String(20))       # HH:MM, optional
    end_date = db.Column(db.String(20))       # YYYY-MM-DD, for night shifts ending next day
    shift_type = db.Column(db.String(10), default="day")  # "day" | "night"

    # Shift duration and status (Block 5.8).
    shift_duration_hours = db.Column(db.Float, nullable=True)   # 8 / 10 / 12 / custom
    shift_status = db.Column(db.String(20), default="scheduled")  # scheduled/active/near_end/delayed/completed/cancelled
    actual_end_time = db.Column(db.String(20), nullable=True)   # HH:MM recorded on completion
    delay_reason = db.Column(db.Text, nullable=True)

    # Crew assignments.
    driver_id = db.Column(
        db.Integer,
        db.ForeignKey("employee.id"),
        nullable=True,
    )

    medical_id = db.Column(
        db.Integer,
        db.ForeignKey("employee.id"),
        nullable=True,
    )

    assist1_id = db.Column(
        db.Integer,
        db.ForeignKey("employee.id"),
        nullable=True,
    )

    assist2_id = db.Column(
        db.Integer,
        db.ForeignKey("employee.id"),
        nullable=True,
    )

    # Patient order — legacy fields kept for migration compatibility.
    first_patient = db.Column(db.String(255), nullable=True)
    next_patients = db.Column(db.Text)

    # New: structured patient order [{name, time, callId}]
    patient_order = db.Column(db.Text)

    # Optional notes.
    notes = db.Column(db.Text)

    # Dispatch operational status.
    dispatch_status = db.Column(db.String(50), default="available")
    dispatch_status_changed_at = db.Column(db.String(50))  # when status last changed

    # Manual call priority order — JSON: [call_id, ...]. Empty = sort by pickup_time.
    call_priority = db.Column(db.Text)

    # Timestamps.
    created_at = db.Column(db.String(50))
    updated_at = db.Column(db.String(50))

    # Multi-tenancy foundation.
    org_id = db.Column(db.Integer, db.ForeignKey("organization.id"), nullable=True)

    def to_dict(self):
        # Prefer new patient_order; fall back to legacy first_patient/next_patients
        patient_order = self._parse_patient_order()

        return {
            "id": self.id,

            "shiftDate": self.shift_date,

            "unitType": self.unit_type,
            "vehicleId": self.vehicle_id,
            "truckNumber": self.truck_number,
            "startTime": self.start_time,
            "endTime": self.end_time or "",
            "endDate": self.end_date or "",
            "shiftType": self.shift_type or "day",

            "crew": {
                "driver": str(self.driver_id) if self.driver_id else "",
                "medical": str(self.medical_id) if self.medical_id else "",
                "assist1": str(self.assist1_id) if self.assist1_id else "",
                "assist2": str(self.assist2_id) if self.assist2_id else "",
            },

            "patientOrder": patient_order,

            # Legacy — kept so existing Crew Planner code doesn't break until removed
            "firstPatient": patient_order[0]["name"] if patient_order else self.first_patient,
            "nextPatients": [p["name"] for p in patient_order[1:]] if len(patient_order) > 1 else [],

            "notes": self.notes or "",

            "dispatchStatus": self.dispatch_status or "available",
            "statusChangedAt": self.dispatch_status_changed_at,

            "callPriority": json.loads(self.call_priority) if self.call_priority else [],

            "shiftDurationHours": self.shift_duration_hours,
            "shiftStatus": self.shift_status or "scheduled",
            "actualEndTime": self.actual_end_time or "",
            "delayReason": self.delay_reason or "",
            "plannedEndTime": self._compute_planned_end_time(),
            "delayMinutes": self._compute_delay_minutes(),

            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
        }

    def _parse_patient_order(self):
        """Return patient_order as list of {name, time, callId} dicts."""
        if self.patient_order:
            try:
                data = json.loads(self.patient_order)
                if isinstance(data, list):
                    return data
            except Exception:
                pass

        # Legacy fallback: build from first_patient / next_patients
        result = []
        if self.first_patient:
            result.append({"name": self.first_patient, "time": "", "callId": None})
        try:
            next_list = json.loads(self.next_patients) if self.next_patients else []
        except Exception:
            next_list = []
        for name in next_list:
            if isinstance(name, str) and name.strip():
                result.append({"name": name.strip(), "time": "", "callId": None})
        return result

    def _compute_planned_end_time(self):
        """Return HH:MM planned end time based on start_time + shift_duration_hours, or None."""
        if not self.start_time or not self.shift_duration_hours:
            return None
        try:
            from datetime import datetime, timedelta
            start = datetime.strptime(self.start_time, "%H:%M")
            end = start + timedelta(hours=self.shift_duration_hours)
            return end.strftime("%H:%M")
        except Exception:
            return None

    def _compute_delay_minutes(self):
        """Return minutes past planned end time if completed late, else None."""
        planned = self._compute_planned_end_time()
        if not planned or not self.actual_end_time:
            return None
        try:
            from datetime import datetime
            fmt = "%H:%M"
            planned_dt = datetime.strptime(planned, fmt)
            actual_dt = datetime.strptime(self.actual_end_time, fmt)
            delta = (actual_dt - planned_dt).total_seconds() / 60
            return int(delta) if delta > 0 else 0
        except Exception:
            return None


class CrewPreset(db.Model):
    id = db.Column(db.Integer, primary_key=True)

    # Preset name shown in the UI.
    preset_name = db.Column(db.String(150), nullable=False)

    # Default unit type for this crew.
    unit_type = db.Column(db.String(50), nullable=False, default="BLS")

    # Saved crew composition.
    driver_id = db.Column(db.Integer, db.ForeignKey("employee.id"), nullable=True)
    medical_id = db.Column(db.Integer, db.ForeignKey("employee.id"), nullable=True)
    assist1_id = db.Column(db.Integer, db.ForeignKey("employee.id"), nullable=True)
    assist2_id = db.Column(db.Integer, db.ForeignKey("employee.id"), nullable=True)

    # Optional notes.
    notes = db.Column(db.Text)

    # Multi-tenancy foundation.
    org_id = db.Column(db.Integer, db.ForeignKey("organization.id"), nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "presetName": self.preset_name,
            "unitType": self.unit_type,
            "crew": {
                "driver": str(self.driver_id) if self.driver_id else "",
                "medical": str(self.medical_id) if self.medical_id else "",
                "assist1": str(self.assist1_id) if self.assist1_id else "",
                "assist2": str(self.assist2_id) if self.assist2_id else "",
            },
            "notes": self.notes or "",
        }


class CallAssignment(db.Model):
    id = db.Column(db.Integer, primary_key=True)

    call_id = db.Column(
        db.Integer,
        db.ForeignKey("call.id"),
        nullable=False, index=True,
    )

    unit_id = db.Column(
        db.Integer,
        db.ForeignKey("daily_crew_unit.id"),
        nullable=False, index=True,
    )

    assigned_at = db.Column(db.String(50))
    assigned_by = db.Column(db.String(150))

    is_active = db.Column(db.Boolean, default=True, index=True)

    def to_dict(self):
        return {
            "id": self.id,
            "callId": self.call_id,
            "unitId": self.unit_id,
            "assignedAt": self.assigned_at,
            "assignedBy": self.assigned_by,
            "isActive": self.is_active,
        }
