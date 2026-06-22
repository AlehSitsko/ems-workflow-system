import json

from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


class Organization(db.Model):
    __tablename__ = "organization"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    slug = db.Column(db.String(100), unique=True, nullable=False)  # subdomain identifier
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.String(50))
    settings_json = db.Column(db.Text)  # reserved for future per-org config (timezone, logo, etc.)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "slug": self.slug,
            "is_active": self.is_active,
            "created_at": self.created_at,
        }


class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)

    # Basic authentication information.
    username = db.Column(db.String(100), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)

    # Display name is used in the UI and as dispatcher identity.
    display_name = db.Column(db.String(150), nullable=False)

    # Role controls what the user can access.
    # Planned roles: admin, supervisor, dispatcher.
    role = db.Column(db.String(50), nullable=False, default="dispatcher")

    # Allows disabling users without deleting historical data.
    is_active = db.Column(db.Boolean, default=True)

    # Optional link to an Employee record (for clock-in/out from dashboard).
    employee_id = db.Column(db.Integer, db.ForeignKey("employee.id"), nullable=True)

    # Multi-tenancy foundation — nullable until full tenant isolation is enabled.
    org_id = db.Column(db.Integer, db.ForeignKey("organization.id"), nullable=True)

    def to_dict(self):
        # Never return password_hash to the frontend.
        return {
            "id": self.id,
            "username": self.username,
            "display_name": self.display_name,
            "role": self.role,
            "is_active": self.is_active,
            "employee_id": self.employee_id,
        }


class Employee(db.Model):
    id = db.Column(db.Integer, primary_key=True)

    # Basic employee information.
    first_name = db.Column(db.String(100), nullable=False)
    last_name = db.Column(db.String(100), nullable=False)
    phone = db.Column(db.String(30))
    email = db.Column(db.String(150))
    employee_number = db.Column(db.String(50))
    hire_date = db.Column(db.String(20))

    # Operational employee information.
    role = db.Column(db.String(50), default="EMT")
    status = db.Column(db.String(50), default="active")

    is_active = db.Column(db.Boolean, default=True)
    notes = db.Column(db.Text)
    kiosk_pin = db.Column(db.String(10))  # 4-digit PIN for Kiosk clock in/out

    # Multi-tenancy foundation.
    org_id = db.Column(db.Integer, db.ForeignKey("organization.id"), nullable=True)

    # CPR certification.
    cpr_has_license = db.Column(db.Boolean, default=False)
    cpr_license_name = db.Column(db.String(150))
    cpr_expiration_date = db.Column(db.String(20))

    # EVOC certification.
    evoc_has_license = db.Column(db.Boolean, default=False)
    evoc_license_name = db.Column(db.String(150))
    evoc_expiration_date = db.Column(db.String(20))

    # EMT certification.
    emt_has_license = db.Column(db.Boolean, default=False)
    emt_license_name = db.Column(db.String(150))
    emt_expiration_date = db.Column(db.String(20))

    # Paramedic certification.
    paramedic_has_license = db.Column(db.Boolean, default=False)
    paramedic_license_name = db.Column(db.String(150))
    paramedic_expiration_date = db.Column(db.String(20))

    def to_dict(self):
        return {
            "id": self.id,
            "firstName": self.first_name,
            "lastName": self.last_name,
            "phone": self.phone,
            "email": self.email or "",
            "employeeNumber": self.employee_number or "",
            "hireDate": self.hire_date or "",
            "role": self.role or "EMT",
            "status": self.status or "active",
            "isActive": self.is_active,
            "notes": self.notes,
            "kioskPin": self.kiosk_pin or "",

            "cpr": {
                "hasLicense": self.cpr_has_license,
                "licenseName": self.cpr_license_name or "",
                "expirationDate": self.cpr_expiration_date or "",
            },

            "evoc": {
                "hasLicense": self.evoc_has_license,
                "licenseName": self.evoc_license_name or "",
                "expirationDate": self.evoc_expiration_date or "",
            },

            "emt": {
                "hasLicense": self.emt_has_license,
                "licenseName": self.emt_license_name or "",
                "expirationDate": self.emt_expiration_date or "",
            },

            "paramedic": {
                "hasLicense": self.paramedic_has_license,
                "licenseName": self.paramedic_license_name or "",
                "expirationDate": self.paramedic_expiration_date or "",
            },
        }


class DailyCrewUnit(db.Model):
    id = db.Column(db.Integer, primary_key=True)

    # Shift date.
    shift_date = db.Column(db.String(20), nullable=False)

    # Unit information.
    unit_type = db.Column(db.String(50), nullable=False)
    truck_number = db.Column(db.String(50), nullable=False)
    start_time = db.Column(db.String(20), nullable=False)
    end_time = db.Column(db.String(20))       # HH:MM, optional
    end_date = db.Column(db.String(20))       # YYYY-MM-DD, for night shifts ending next day
    shift_type = db.Column(db.String(10), default="day")  # "day" | "night"

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


class Patient(db.Model):
    id = db.Column(db.Integer, primary_key=True)

    # Basic patient information.
    first_name = db.Column(db.String(100))
    last_name = db.Column(db.String(100))
    dob = db.Column(db.String(20))
    gender = db.Column(db.String(50))

    # Contact information.
    phone = db.Column(db.String(20))
    secondary_phone = db.Column(db.String(20))
    address = db.Column(db.Text)
    city = db.Column(db.String(100))
    state = db.Column(db.String(50))
    zip_code = db.Column(db.String(20))

    # Insurance information.
    insurance = db.Column(db.String(150))
    member_id = db.Column(db.String(100))
    policy_number = db.Column(db.String(100))
    requires_auth = db.Column(db.Boolean, default=False)
    copay_required = db.Column(db.Boolean, default=False)
    insurance_notes = db.Column(db.Text)

    # EMS-specific information.
    default_service_level = db.Column(db.String(50))
    weight = db.Column(db.String(20))
    oxygen_required = db.Column(db.Boolean, default=False)
    stairs = db.Column(db.Boolean, default=False)
    special_equipment_notes = db.Column(db.Text)

    # Facility and emergency contact.
    facility_name = db.Column(db.String(150))
    room_number = db.Column(db.String(50))
    emergency_contact_name = db.Column(db.String(150))
    emergency_contact_phone = db.Column(db.String(20))

    # General notes.
    notes = db.Column(db.Text)

    # Multi-tenancy foundation.
    org_id = db.Column(db.Integer, db.ForeignKey("organization.id"), nullable=True)

    def to_dict(self):
        return {
            "id": self.id,

            "first_name": self.first_name,
            "last_name": self.last_name,
            "dob": self.dob,
            "gender": self.gender,

            "phone": self.phone,
            "secondary_phone": self.secondary_phone,
            "address": self.address,
            "city": self.city,
            "state": self.state,
            "zip_code": self.zip_code,

            "insurance": self.insurance,
            "member_id": self.member_id,
            "policy_number": self.policy_number,
            "requires_auth": self.requires_auth,
            "copay_required": self.copay_required,
            "insurance_notes": self.insurance_notes,

            "default_service_level": self.default_service_level,
            "weight": self.weight,
            "oxygen_required": self.oxygen_required,
            "stairs": self.stairs,
            "special_equipment_notes": self.special_equipment_notes,

            "facility_name": self.facility_name,
            "room_number": self.room_number,
            "emergency_contact_name": self.emergency_contact_name,
            "emergency_contact_phone": self.emergency_contact_phone,

            "notes": self.notes,
        }


class Call(db.Model):
    id = db.Column(db.Integer, primary_key=True)

    patient_id = db.Column(
        db.Integer,
        db.ForeignKey("patient.id"),
        nullable=True
    )

    dispatcher_name = db.Column(db.String(100))

    # Exact timestamp when the call was received or created.
    received_at = db.Column(db.String(50))

    # Initial operational status for future dispatch lifecycle tracking.
    status = db.Column(db.String(50), default="new")

    date_of_call = db.Column(db.String(20))
    trip_date = db.Column(db.String(20))
    pickup_time = db.Column(db.String(20))
    appointment_time = db.Column(db.String(20))

    pickup_address = db.Column(db.Text)
    dropoff_address = db.Column(db.Text)

    caller_type = db.Column(db.String(100))
    call_type = db.Column(db.String(100))
    service_level = db.Column(db.String(100))

    # Captured at intake — may differ from patient record.
    caller_phone = db.Column(db.String(30))
    caller_note = db.Column(db.Text)

    quality_score = db.Column(db.Integer)

    missing_critical_fields = db.Column(db.Text)
    missing_optional_fields = db.Column(db.Text)

    missing_info_explanation = db.Column(db.Text)

    notes = db.Column(db.Text)

    cancel_reason = db.Column(db.Text)
    cancelled_at = db.Column(db.String(50))
    cancelled_by = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)

    # Dispatch lifecycle timestamps — set automatically by unit status transitions.
    dispatched_at      = db.Column(db.String(50))  # unit → en_route
    arrived_pickup_at  = db.Column(db.String(50))  # unit → on_scene
    patient_loaded_at  = db.Column(db.String(50))  # unit → transporting
    arrived_dest_at    = db.Column(db.String(50))  # unit → at_destination
    completed_at       = db.Column(db.String(50))  # call marked completed

    # Multi-tenancy foundation.
    org_id = db.Column(db.Integer, db.ForeignKey("organization.id"), nullable=True)

    def to_dict(self):
        return {
            "id": self.id,

            "patient_id": self.patient_id,

            "dispatcher_name": self.dispatcher_name,

            "received_at": self.received_at,
            "status": self.status or "new",

            "date_of_call": self.date_of_call,
            "trip_date": self.trip_date,
            "pickup_time": self.pickup_time,
            "appointment_time": self.appointment_time,

            "pickup_address": self.pickup_address,
            "dropoff_address": self.dropoff_address,

            "caller_type": self.caller_type,
            "call_type": self.call_type,
            "service_level": self.service_level,

            "caller_phone": self.caller_phone or "",
            "caller_note": self.caller_note or "",

            "quality_score": self.quality_score,

            "missing_critical_fields": self.missing_critical_fields,
            "missing_optional_fields": self.missing_optional_fields,
            "missing_info_explanation": self.missing_info_explanation,

            "notes": self.notes,

            "cancel_reason": self.cancel_reason,
            "cancelled_at": self.cancelled_at,
            "cancelled_by": self.cancelled_by,

            "dispatched_at":     self.dispatched_at,
            "arrived_pickup_at": self.arrived_pickup_at,
            "patient_loaded_at": self.patient_loaded_at,
            "arrived_dest_at":   self.arrived_dest_at,
            "completed_at":      self.completed_at,

            "patient_name": self._patient_name(),
        }

    def _patient_name(self):
        if not self.patient_id:
            return None
        # Patient is defined later in this file but available at call time
        p = db.session.get(Patient, self.patient_id)
        if not p:
            return None
        return f"{p.first_name} {p.last_name}".strip()


class NotificationEvent(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    type = db.Column(db.String(100), nullable=False)
    severity = db.Column(db.String(20), default="info")  # info | warning | critical
    title = db.Column(db.String(255), nullable=False)
    body = db.Column(db.Text)
    entity_type = db.Column(db.String(50))   # call | unit | employee
    entity_id = db.Column(db.Integer)
    created_at = db.Column(db.String(50), nullable=False)
    expires_at = db.Column(db.String(50))

    # Multi-tenancy foundation.
    org_id = db.Column(db.Integer, db.ForeignKey("organization.id"), nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "type": self.type,
            "severity": self.severity,
            "title": self.title,
            "body": self.body,
            "entity_type": self.entity_type,
            "entity_id": self.entity_id,
            "created_at": self.created_at,
            "expires_at": self.expires_at,
        }


class UserNotification(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    event_id = db.Column(db.Integer, db.ForeignKey("notification_event.id"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    is_read = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.String(50), nullable=False)

    def to_dict(self, event=None):
        e = event or NotificationEvent.query.get(self.event_id)
        base = e.to_dict() if e else {}
        base.update({
            "id": self.id,
            "event_id": self.event_id,
            "is_read": self.is_read,
            "created_at": self.created_at,
        })
        return base


class UserNotificationPrefs(db.Model):
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), primary_key=True)
    prefs_json = db.Column(db.Text)   # JSON: {"call_new_today": true, ...}
    push_sub_json = db.Column(db.Text)  # Web Push subscription object JSON
    dispatch_thresholds_json = db.Column(db.Text)  # JSON: {pickup_late_after: N, stuck_after: N}


class CallAssignment(db.Model):
    id = db.Column(db.Integer, primary_key=True)

    call_id = db.Column(
        db.Integer,
        db.ForeignKey("call.id"),
        nullable=False,
    )

    unit_id = db.Column(
        db.Integer,
        db.ForeignKey("daily_crew_unit.id"),
        nullable=False,
    )

    assigned_at = db.Column(db.String(50))
    assigned_by = db.Column(db.String(150))

    is_active = db.Column(db.Boolean, default=True)

    def to_dict(self):
        return {
            "id": self.id,
            "callId": self.call_id,
            "unitId": self.unit_id,
            "assignedAt": self.assigned_at,
            "assignedBy": self.assigned_by,
            "isActive": self.is_active,
        }


class TimeEntry(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(db.Integer, db.ForeignKey("employee.id"), nullable=False)

    clock_in = db.Column(db.String(50), nullable=False)   # ISO datetime
    clock_out = db.Column(db.String(50))                  # ISO datetime, null if still clocked in
    break_minutes = db.Column(db.Integer, default=0)

    # "clock" = kiosk/self, "manual" = HR/supervisor entry, "adjusted" = correction
    entry_type = db.Column(db.String(20), default="clock")

    # "approved" | "disputed"
    status = db.Column(db.String(20), default="approved")

    notes = db.Column(db.Text)
    flag_reason = db.Column(db.Text)    # populated when status=pending due to rule violation
    created_by = db.Column(db.Integer, db.ForeignKey("user.id"))
    approved_by = db.Column(db.Integer, db.ForeignKey("user.id"))
    approved_at = db.Column(db.String(50))

    def to_dict(self):
        from datetime import datetime
        duration_minutes = None
        if self.clock_in and self.clock_out:
            try:
                ci = datetime.fromisoformat(self.clock_in)
                co = datetime.fromisoformat(self.clock_out)
                duration_minutes = int((co - ci).total_seconds() / 60) - (self.break_minutes or 0)
            except Exception:
                pass
        return {
            "id": self.id,
            "employee_id": self.employee_id,
            "clock_in": self.clock_in,
            "clock_out": self.clock_out,
            "break_minutes": self.break_minutes or 0,
            "duration_minutes": duration_minutes,
            "entry_type": self.entry_type,
            "status": self.status,
            "flag_reason": self.flag_reason,
            "notes": self.notes,
            "created_by": self.created_by,
            "approved_by": self.approved_by,
            "approved_at": self.approved_at,
        }


class EmployeePayConfig(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(db.Integer, db.ForeignKey("employee.id"), nullable=False)

    # "hourly" | "salary"
    pay_type = db.Column(db.String(20), default="hourly")
    hourly_rate = db.Column(db.Float, default=0.0)
    overtime_rate = db.Column(db.Float, default=0.0)   # multiplier, e.g. 1.5
    overtime_after = db.Column(db.Integer, default=40)  # hours/week before OT kicks in
    effective_from = db.Column(db.String(20))           # YYYY-MM-DD

    def to_dict(self):
        return {
            "id": self.id,
            "employee_id": self.employee_id,
            "pay_type": self.pay_type,
            "hourly_rate": self.hourly_rate,
            "overtime_rate": self.overtime_rate,
            "overtime_after": self.overtime_after,
            "effective_from": self.effective_from,
        }


class PayPeriod(db.Model):
    __tablename__ = "pay_period"

    id = db.Column(db.Integer, primary_key=True)
    start_date = db.Column(db.String(20), nullable=False)   # YYYY-MM-DD
    end_date = db.Column(db.String(20), nullable=False)     # YYYY-MM-DD
    period_type = db.Column(db.String(20), default="weekly")  # weekly | biweekly
    # open → review → approved → exported
    status = db.Column(db.String(20), default="open")
    notes = db.Column(db.Text)
    created_by = db.Column(db.Integer, db.ForeignKey("user.id"))
    created_at = db.Column(db.String(50))
    exported_at = db.Column(db.String(50))
    exported_to = db.Column(db.String(50))   # gusto | adp | csv

    # Multi-tenancy foundation.
    org_id = db.Column(db.Integer, db.ForeignKey("organization.id"), nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "start_date": self.start_date,
            "end_date": self.end_date,
            "period_type": self.period_type,
            "status": self.status,
            "notes": self.notes,
            "created_by": self.created_by,
            "created_at": self.created_at,
            "exported_at": self.exported_at,
            "exported_to": self.exported_to,
        }


# ── HR Documents ──────────────────────────────────────────────────────────────

DOC_TYPES = [
    "drivers_license", "cdl", "cpr_cert", "evoc_cert",
    "emt_cert", "als_cert", "physical_exam",
    "employment_contract", "offer_letter", "background_check",
    "insurance_card", "other",
]

DOC_CATEGORIES = {
    "drivers_license": "certs",
    "cdl": "certs",
    "cpr_cert": "certs",
    "evoc_cert": "certs",
    "emt_cert": "certs",
    "als_cert": "certs",
    "physical_exam": "hr",
    "employment_contract": "hr",
    "offer_letter": "hr",
    "background_check": "hr",
    "insurance_card": "hr",
    "other": "hr",
}


class EmployeeDocument(db.Model):
    __tablename__ = "employee_document"

    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(db.Integer, db.ForeignKey("employee.id"), nullable=False)
    employee = db.relationship("Employee", foreign_keys=[employee_id], lazy="joined")

    doc_type = db.Column(db.String(50), nullable=False)
    title = db.Column(db.String(200), nullable=False)

    file_path = db.Column(db.String(500))   # relative path within uploads/documents/
    file_name = db.Column(db.String(255))   # original filename shown to user
    file_size = db.Column(db.Integer)       # bytes
    mime_type = db.Column(db.String(100))

    document_number = db.Column(db.String(100))
    issuing_body = db.Column(db.String(200))
    issued_date = db.Column(db.String(20))   # YYYY-MM-DD
    expiry_date = db.Column(db.String(20))   # YYYY-MM-DD, nullable

    notes = db.Column(db.Text)
    uploaded_by = db.Column(db.Integer, db.ForeignKey("user.id"))
    uploaded_at = db.Column(db.String(50))
    updated_by = db.Column(db.Integer, db.ForeignKey("user.id"))
    updated_at = db.Column(db.String(50))

    def expiry_status(self):
        """Returns 'expired'|'critical'|'warning'|'ok'|'none'."""
        if not self.expiry_date:
            return "none"
        from datetime import date
        try:
            exp = date.fromisoformat(self.expiry_date)
            today = date.today()
            days = (exp - today).days
            if days < 0:
                return "expired"
            if days <= 14:
                return "critical"
            if days <= 90:
                return "warning"
            return "ok"
        except ValueError:
            return "none"

    def to_dict(self):
        return {
            "id": self.id,
            "employee_id": self.employee_id,
            "doc_type": self.doc_type,
            "category": DOC_CATEGORIES.get(self.doc_type, "hr"),
            "title": self.title,
            "file_name": self.file_name,
            "file_size": self.file_size,
            "mime_type": self.mime_type,
            "document_number": self.document_number or "",
            "issuing_body": self.issuing_body or "",
            "issued_date": self.issued_date or "",
            "expiry_date": self.expiry_date or "",
            "expiry_status": self.expiry_status(),
            "notes": self.notes or "",
            "uploaded_by": self.uploaded_by,
            "uploaded_at": self.uploaded_at,
            "updated_at": self.updated_at,
            "has_file": bool(self.file_path),
        }


# ── Audit Log ──────────────────────────────────────────────────────────────────

class AuditLog(db.Model):
    __tablename__ = "audit_log"

    id            = db.Column(db.Integer, primary_key=True)
    timestamp     = db.Column(db.String(50), nullable=False)
    user_id       = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)
    user_name     = db.Column(db.String(150))        # denormalized for display after user deletion
    action        = db.Column(db.String(100), nullable=False)   # e.g. "call.assigned"
    entity_type   = db.Column(db.String(50))         # "call", "patient", "unit", "time_entry"
    entity_id     = db.Column(db.Integer)
    entity_label  = db.Column(db.String(255))        # human-readable: "Call #42", "John Doe"
    details       = db.Column(db.Text)               # JSON string with old/new values or extra context

    def to_dict(self):
        return {
            "id":           self.id,
            "timestamp":    self.timestamp,
            "user_id":      self.user_id,
            "user_name":    self.user_name or "System",
            "action":       self.action,
            "entity_type":  self.entity_type,
            "entity_id":    self.entity_id,
            "entity_label": self.entity_label or "",
            "details":      self.details or "",
        }
