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
    # Usernames are unique *per organisation*, not globally — the same "admin" can
    # exist in two orgs, each reached by its own subdomain. A platform super-admin
    # is the exception: is_platform_admin with a NULL org, managing orgs from the
    # platform console rather than belonging to any one of them.
    __table_args__ = (
        db.UniqueConstraint("org_id", "username", name="uq_user_org_username"),
    )

    id = db.Column(db.Integer, primary_key=True)

    # Basic authentication information. (Unique per-org via __table_args__ above.)
    username = db.Column(db.String(100), nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)

    # A cross-org platform operator: creates and manages organisations, belongs to
    # none (org_id is NULL), and is only admitted on the platform host.
    is_platform_admin = db.Column(db.Boolean, nullable=False, default=False)
    # When the password was last set — drives optional rotation (see
    # Config.PASSWORD_MAX_AGE_DAYS). ISO datetime; stamped on every password set.
    password_changed_at = db.Column(db.String(50))

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

    # Per-user settings blob: {notifications:{...}, dispatch:{...}, ui:{...}}
    settings_json = db.Column(db.Text)

    def to_dict(self):
        # Never return password_hash to the frontend.
        return {
            "id": self.id,
            "username": self.username,
            "display_name": self.display_name,
            "role": self.role,
            "is_active": self.is_active,
            "employee_id": self.employee_id,
            "is_platform_admin": bool(self.is_platform_admin),
        }


class UserSession(db.Model):
    """A server-side record of one signed-in session (one device/browser).

    Flask's cookie is stateless, so on its own a session cannot be revoked before
    it expires. This registry gives each login a random `sid` (stored in the
    cookie); the auth guard checks the sid is still present and not revoked every
    request, so revoking a row signs that one device out on its next call —
    without touching the user's other sessions. A child of User with no org_id; it
    is only ever queried by sid or for the session user's own id."""
    __tablename__ = "user_session"

    id = db.Column(db.Integer, primary_key=True)
    sid = db.Column(db.String(64), unique=True, nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id", ondelete="CASCADE"),
                        nullable=False, index=True)
    created_at = db.Column(db.String(50), nullable=False)
    last_seen_at = db.Column(db.String(50))
    user_agent = db.Column(db.String(300))
    revoked = db.Column(db.Boolean, nullable=False, default=False, index=True)

    def to_dict(self, current_sid=None):
        return {
            "id": self.id,
            "createdAt": self.created_at,
            "lastSeenAt": self.last_seen_at or self.created_at,
            "userAgent": self.user_agent or "",
            "current": bool(current_sid and self.sid == current_sid),
        }


class PasswordHistory(db.Model):
    """Past password hashes, so a rotation can refuse reuse of a recent one (see
    Config.PASSWORD_HISTORY_DEPTH). A child of User with no org_id of its own — it
    is only ever queried for the session user's own id, never by a client id."""
    __tablename__ = "password_history"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id", ondelete="CASCADE"),
                        nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.String(50), nullable=False)


class Employee(db.Model):
    id = db.Column(db.Integer, primary_key=True)

    # Basic employee information.
    first_name = db.Column(db.String(100), nullable=False)
    last_name = db.Column(db.String(100), nullable=False)
    phone = db.Column(db.String(30))
    email = db.Column(db.String(150))
    employee_number = db.Column(db.String(50))
    hire_date = db.Column(db.String(20))
    dob = db.Column(db.String(20))  # YYYY-MM-DD; drives employee birthday calendar events

    # Operational employee information.
    # `role` used to conflate two independent axes. It is kept as a derived
    # legacy mirror (see to_dict / apply_employee_data) so existing readers don't
    # break, but the split columns below are authoritative:
    #   qualification — what the person is clinically/operationally qualified for
    #                   (driver_only / emt / paramedic / assist); drives crew
    #                   eligibility. Nullable: a pure administrator has none.
    #   admin_role    — organisational role (supervisor / manager / hr /
    #                   dispatcher / admin); NOT a clinical qualification.
    role = db.Column(db.String(50), default="EMT")
    qualification = db.Column(db.String(30))
    admin_role = db.Column(db.String(30))
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

    def to_dict(self, include_pin=False):
        # The kiosk PIN is a clock-in credential: with it you can clock a
        # colleague in or out at the shared kiosk. It must never travel in a
        # roster payload, so it is omitted by default and included only when a
        # caller that may manage it (the HR-gated detail endpoint) asks. The
        # kiosk's own endpoints already expose `has_pin`, never the PIN itself.
        data = {
            "id": self.id,
            "firstName": self.first_name,
            "lastName": self.last_name,
            "phone": self.phone,
            "email": self.email or "",
            "employeeNumber": self.employee_number or "",
            "hireDate": self.hire_date or "",
            "dob": self.dob or "",
            # Split axes are authoritative; `role` is the derived legacy mirror.
            "qualification": self.qualification,
            "adminRole": self.admin_role,
            "role": self.role or "EMT",
            "status": self.status or "active",
            "isActive": self.is_active,
            "notes": self.notes,

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
        if include_pin:
            data["kioskPin"] = self.kiosk_pin or ""
        return data


class EmploymentEvent(db.Model):
    """One entry in an employee's employment history — a hire, a position or
    status change, a termination, a rehire, or a free-form note.

    Append-only by design: the Employee row holds the *current* position and
    status (hire_date, role, status); this table is the record of how it got
    there, so an edit would rewrite history. Corrections are a delete of the
    wrong entry, not an in-place change.
    """
    __tablename__ = "employment_event"

    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(db.Integer, db.ForeignKey("employee.id"), nullable=False, index=True)

    # hired | position_change | status_change | pay_change | terminated | rehired | note
    event_type = db.Column(db.String(30), nullable=False)
    effective_date = db.Column(db.String(20), nullable=False, index=True)  # YYYY-MM-DD

    # The employment facts as of this event. All optional — a "note" event may
    # carry none of them, a "hired" event usually carries all three.
    title = db.Column(db.String(120))                # position / job title
    employment_type = db.Column(db.String(30))       # full_time | part_time | per_diem | contract
    status = db.Column(db.String(30))                # active | on_leave | inactive | terminated

    note = db.Column(db.Text)

    created_by = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)
    created_by_name = db.Column(db.String(150))
    created_at = db.Column(db.String(50))

    employee = db.relationship("Employee", foreign_keys=[employee_id])

    def to_dict(self):
        return {
            "id": self.id,
            "employeeId": self.employee_id,
            "eventType": self.event_type,
            "effectiveDate": self.effective_date or "",
            "title": self.title or "",
            "employmentType": self.employment_type or "",
            "status": self.status or "",
            "note": self.note or "",
            "createdBy": self.created_by,
            "createdByName": self.created_by_name or "",
            "createdAt": self.created_at,
        }


class DisciplinaryAction(db.Model):
    """One entry in an employee's disciplinary record — a verbal or written
    warning, a suspension, a corrective-action plan, or a note.

    Like employment history this is an append-only log (a correction deletes the
    wrong entry), with one mutable field: `acknowledged`, which flips when the
    employee has seen and signed off the action. It carries no clinical or
    operational data — it is an HR record, gated to admin/HR at the API.
    """
    __tablename__ = "disciplinary_action"

    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(db.Integer, db.ForeignKey("employee.id"), nullable=False, index=True)

    # verbal_warning | written_warning | final_warning | suspension |
    # corrective_action | note
    action_type = db.Column(db.String(30), nullable=False)
    action_date = db.Column(db.String(20), nullable=False, index=True)  # YYYY-MM-DD

    severity = db.Column(db.String(20))    # low | medium | high (optional)
    subject = db.Column(db.String(150))    # short headline (optional)
    description = db.Column(db.Text)       # the details (optional)

    # Whether the employee has acknowledged the action. The one field that
    # changes after creation — everything else is the record as issued.
    acknowledged = db.Column(db.Boolean, default=False, nullable=False)

    created_by = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)
    created_by_name = db.Column(db.String(150))
    created_at = db.Column(db.String(50))

    employee = db.relationship("Employee", foreign_keys=[employee_id])

    def to_dict(self):
        return {
            "id": self.id,
            "employeeId": self.employee_id,
            "actionType": self.action_type,
            "actionDate": self.action_date or "",
            "severity": self.severity or "",
            "subject": self.subject or "",
            "description": self.description or "",
            "acknowledged": bool(self.acknowledged),
            "createdBy": self.created_by,
            "createdByName": self.created_by_name or "",
            "createdAt": self.created_at,
        }


class Vehicle(db.Model):
    id = db.Column(db.Integer, primary_key=True)

    unit_name = db.Column(db.String(50), nullable=False)     # "Ambu-1"
    unit_number = db.Column(db.String(50), nullable=False, unique=True)   # "214"
    # Primary/legacy type. Real multi-capability support lives in `capabilities`;
    # this stays as the headline classification (canonical taxonomy value).
    unit_type = db.Column(db.String(50), nullable=False)
    is_active = db.Column(db.Boolean, default=True)
    notes = db.Column(db.Text)

    # What this physical vehicle can actually do — JSON array of canonical
    # capability values. A vehicle is often more than one thing (a stretcher van
    # that is also wheelchair capable), which a single unit_type cannot express.
    # Stored as JSON rather than a join table: the fleet is small and always read
    # whole, so a table would add joins without buying a query we need.
    capabilities = db.Column(db.Text)

    # Identity.
    vin = db.Column(db.String(32))
    license_plate = db.Column(db.String(20))
    plate_state = db.Column(db.String(10))
    model_year = db.Column(db.Integer)
    make = db.Column(db.String(50))
    model = db.Column(db.String(50))
    color = db.Column(db.String(30))
    ownership_type = db.Column(db.String(20))  # owned | leased | rented

    # Operational state. `is_active` is the administrative flag (in the fleet at
    # all); operational_status is what dispatch cares about today.
    operational_status = db.Column(db.String(30), default="in_service")  # in_service | out_of_service | maintenance
    out_of_service_reason = db.Column(db.Text)

    # Retire instead of delete: historical shifts and maintenance must keep a
    # valid vehicle reference.
    is_retired = db.Column(db.Boolean, default=False, nullable=False)
    retired_at = db.Column(db.String(50))
    retired_reason = db.Column(db.Text)

    # Compliance / maintenance dates (YYYY-MM-DD) — drive vehicle calendar events.
    inspection_expiry = db.Column(db.String(20))
    registration_expiry = db.Column(db.String(20))
    insurance_expiry = db.Column(db.String(20))
    next_maintenance_date = db.Column(db.String(20))

    # Mileage. The current reading is a cached convenience — the source of truth
    # is VehicleOdometerEntry (never store one mutable number without history).
    current_odometer = db.Column(db.Integer)
    odometer_unit = db.Column(db.String(5), default="mi")  # mi | km
    last_odometer_update = db.Column(db.String(50))

    # Maintenance summary (records live in VehicleMaintenanceRecord).
    last_service_date = db.Column(db.String(20))
    last_service_mileage = db.Column(db.Integer)
    next_service_mileage = db.Column(db.Integer)
    maintenance_notes = db.Column(db.Text)

    created_at = db.Column(db.String(50))
    updated_at = db.Column(db.String(50))

    def parsed_capabilities(self):
        """Capabilities as a list. Falls back to the headline unit_type so a
        vehicle that predates the field is still classified, not blank."""
        if self.capabilities:
            try:
                data = json.loads(self.capabilities)
                if isinstance(data, list):
                    return [str(c) for c in data]
            except (ValueError, TypeError):
                pass
        return [self.unit_type] if self.unit_type else []

    def is_available_for_service(self):
        """True when this vehicle may be put on a shift today."""
        return bool(self.is_active) and not self.is_retired and self.operational_status == "in_service"

    # Multi-tenancy foundation.
    org_id = db.Column(db.Integer, db.ForeignKey("organization.id"), nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "unitName": self.unit_name,
            "unitNumber": self.unit_number,
            "unitType": self.unit_type,
            "capabilities": self.parsed_capabilities(),
            "isActive": self.is_active,
            "notes": self.notes or "",

            "vin": self.vin or "",
            "licensePlate": self.license_plate or "",
            "plateState": self.plate_state or "",
            "modelYear": self.model_year,
            "make": self.make or "",
            "model": self.model or "",
            "color": self.color or "",
            "ownershipType": self.ownership_type or "",

            "operationalStatus": self.operational_status or "in_service",
            "outOfServiceReason": self.out_of_service_reason or "",
            "availableForService": self.is_available_for_service(),

            "isRetired": bool(self.is_retired),
            "retiredAt": self.retired_at or "",
            "retiredReason": self.retired_reason or "",

            "inspectionExpiry": self.inspection_expiry or "",
            "registrationExpiry": self.registration_expiry or "",
            "insuranceExpiry": self.insurance_expiry or "",
            "nextMaintenanceDate": self.next_maintenance_date or "",

            "currentOdometer": self.current_odometer,
            "odometerUnit": self.odometer_unit or "mi",
            "lastOdometerUpdate": self.last_odometer_update or "",

            "lastServiceDate": self.last_service_date or "",
            "lastServiceMileage": self.last_service_mileage,
            "nextServiceMileage": self.next_service_mileage,
            "maintenanceNotes": self.maintenance_notes or "",

            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
        }


class VehicleOdometerEntry(db.Model):
    """A mileage reading. The odometer is a history, not one mutable number —
    `Vehicle.current_odometer` is only a cache of the latest entry."""
    __tablename__ = "vehicle_odometer_entry"

    id = db.Column(db.Integer, primary_key=True)
    vehicle_id = db.Column(db.Integer, db.ForeignKey("vehicle.id"), nullable=False, index=True)

    reading = db.Column(db.Integer, nullable=False)
    unit = db.Column(db.String(5), default="mi")          # mi | km
    recorded_at = db.Column(db.String(50), nullable=False)
    recorded_by = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)
    recorded_by_name = db.Column(db.String(150))          # denormalized for display
    source = db.Column(db.String(20), default="manual")   # manual | service | import
    notes = db.Column(db.Text)

    vehicle = db.relationship("Vehicle", foreign_keys=[vehicle_id])

    def to_dict(self):
        return {
            "id": self.id,
            "vehicleId": self.vehicle_id,
            "reading": self.reading,
            "unit": self.unit or "mi",
            "recordedAt": self.recorded_at,
            "recordedBy": self.recorded_by,
            "recordedByName": self.recorded_by_name or "System",
            "source": self.source or "manual",
            "notes": self.notes or "",
        }


class VehicleMaintenanceRecord(db.Model):
    """Scheduled or completed work on a vehicle."""
    __tablename__ = "vehicle_maintenance_record"

    id = db.Column(db.Integer, primary_key=True)
    vehicle_id = db.Column(db.Integer, db.ForeignKey("vehicle.id"), nullable=False, index=True)

    maintenance_type = db.Column(db.String(50), nullable=False)   # oil_change | inspection | tires | repair | other
    status = db.Column(db.String(20), nullable=False, default="scheduled")  # scheduled | in_progress | completed | cancelled

    scheduled_date = db.Column(db.String(20), index=True)
    completed_date = db.Column(db.String(20))
    odometer_at_service = db.Column(db.Integer)

    vendor = db.Column(db.String(150))
    cost = db.Column(db.Float)
    description = db.Column(db.Text)
    notes = db.Column(db.Text)

    created_by = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)
    created_at = db.Column(db.String(50))
    updated_by = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)
    updated_at = db.Column(db.String(50))

    vehicle = db.relationship("Vehicle", foreign_keys=[vehicle_id])

    def to_dict(self):
        return {
            "id": self.id,
            "vehicleId": self.vehicle_id,
            "maintenanceType": self.maintenance_type,
            "status": self.status,
            "scheduledDate": self.scheduled_date or "",
            "completedDate": self.completed_date or "",
            "odometerAtService": self.odometer_at_service,
            "vendor": self.vendor or "",
            "cost": self.cost,
            "description": self.description or "",
            "notes": self.notes or "",
            "createdBy": self.created_by,
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
        }


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


class Patient(db.Model):
    id = db.Column(db.Integer, primary_key=True)

    # Basic patient information.
    first_name = db.Column(db.String(100))
    last_name = db.Column(db.String(100), index=True)
    dob = db.Column(db.String(20), index=True)
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

    # Dispatch-facing operational note — short, practical, not a medical note.
    dispatch_comment = db.Column(db.Text)

    # Transport / operational defaults.
    default_mobility_level = db.Column(db.String(50))
    transport_instructions = db.Column(db.Text)
    access_instructions = db.Column(db.Text)
    preferred_language = db.Column(db.String(50))
    requires_interpreter = db.Column(db.Boolean, default=False)

    # Reduced-exposure flag — UI may mask this patient's details in list views.
    is_sensitive = db.Column(db.Boolean, default=False)

    # Soft archive — replaces hard delete so call history keeps a valid patient reference.
    is_archived = db.Column(db.Boolean, default=False, nullable=False)
    archived_at = db.Column(db.String(50))
    archived_by = db.Column(db.String(150))
    archived_reason = db.Column(db.Text)

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

            "dispatch_comment": self.dispatch_comment,

            "default_mobility_level": self.default_mobility_level,
            "transport_instructions": self.transport_instructions,
            "access_instructions": self.access_instructions,
            "preferred_language": self.preferred_language,
            "requires_interpreter": self.requires_interpreter,

            "is_sensitive": self.is_sensitive,

            "is_archived": self.is_archived,
            "archived_at": self.archived_at,
            "archived_by": self.archived_by,
            "archived_reason": self.archived_reason,
        }


class PatientAlert(db.Model):
    __tablename__ = "patient_alert"

    id = db.Column(db.Integer, primary_key=True)
    patient_id = db.Column(db.Integer, db.ForeignKey("patient.id"), nullable=False)
    patient = db.relationship("Patient", foreign_keys=[patient_id])

    category = db.Column(db.String(30), nullable=False)     # transport/safety/contact/facility/billing/equipment/behavior/language/other
    severity = db.Column(db.String(20), nullable=False, default="info")  # info/warning/critical

    title = db.Column(db.String(120), nullable=False)
    description = db.Column(db.Text)

    is_active = db.Column(db.Boolean, default=True, nullable=False)
    expires_at = db.Column(db.String(20))  # YYYY-MM-DD, nullable = no expiration

    created_at = db.Column(db.String(50))
    created_by = db.Column(db.String(150))

    updated_at = db.Column(db.String(50))

    resolved_at = db.Column(db.String(50))
    resolved_by = db.Column(db.String(150))
    resolved_reason = db.Column(db.Text)

    def status(self):
        if not self.is_active:
            return "resolved" if self.resolved_at else "inactive"
        if self.expires_at:
            from datetime import date
            try:
                if date.fromisoformat(self.expires_at) < date.today():
                    return "expired"
            except ValueError:
                pass
        return "active"

    def to_dict(self):
        return {
            "id": self.id,
            "patient_id": self.patient_id,
            "category": self.category,
            "severity": self.severity,
            "title": self.title,
            "description": self.description,
            "is_active": self.is_active,
            "expires_at": self.expires_at,
            "status": self.status(),
            "created_at": self.created_at,
            "created_by": self.created_by,
            "updated_at": self.updated_at,
            "resolved_at": self.resolved_at,
            "resolved_by": self.resolved_by,
            "resolved_reason": self.resolved_reason,
        }


class PatientContact(db.Model):
    __tablename__ = "patient_contact"

    id = db.Column(db.Integer, primary_key=True)
    patient_id = db.Column(db.Integer, db.ForeignKey("patient.id"), nullable=False)
    patient = db.relationship("Patient", foreign_keys=[patient_id])

    name = db.Column(db.String(150), nullable=False)
    relationship_label = db.Column(db.String(100))  # "relationship" is reserved by SQLAlchemy declarative
    phone = db.Column(db.String(30))
    email = db.Column(db.String(150))
    is_primary = db.Column(db.Boolean, default=False)
    can_authorize_transport = db.Column(db.Boolean, default=False)
    preferred_contact_method = db.Column(db.String(30))  # phone/email/text
    notes = db.Column(db.Text)

    created_at = db.Column(db.String(50))
    updated_at = db.Column(db.String(50))

    def to_dict(self):
        return {
            "id": self.id,
            "patient_id": self.patient_id,
            "name": self.name,
            "relationship": self.relationship_label,
            "phone": self.phone,
            "email": self.email,
            "is_primary": self.is_primary,
            "can_authorize_transport": self.can_authorize_transport,
            "preferred_contact_method": self.preferred_contact_method,
            "notes": self.notes,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


class Call(db.Model):
    id = db.Column(db.Integer, primary_key=True)

    patient_id = db.Column(
        db.Integer,
        db.ForeignKey("patient.id"),
        nullable=True, index=True
    )
    patient = db.relationship("Patient", foreign_keys=[patient_id], lazy="select")

    dispatcher_name = db.Column(db.String(100))

    # Exact timestamp when the call was received or created.
    received_at = db.Column(db.String(50))

    # Initial operational status for future dispatch lifecycle tracking.
    status = db.Column(db.String(50), default="new", index=True)

    date_of_call = db.Column(db.String(20))
    trip_date = db.Column(db.String(20), index=True)
    pickup_time = db.Column(db.String(20))
    appointment_time = db.Column(db.String(20))

    # How long the trip is expected to take. Optional — set it and the app can
    # show a planned end time (pickup_time + this), so a scheduler sees when the
    # unit is expected free rather than guessing.
    estimated_duration_minutes = db.Column(db.Integer)

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

    # Confirmation call — dispatchers ring patients the day before to check the
    # trip is still on. Four states rather than a flag: "nobody answered" and
    # "not called yet" look the same on a board but mean opposite things to the
    # person working the list. Canonical values in utils.taxonomy.
    # Set when this call was generated from a standing order. Regenerating the
    # template only ever touches its own untouched calls.
    recurring_trip_id = db.Column(db.Integer, db.ForeignKey("recurring_trip.id"),
                                  nullable=True, index=True)
    # Raised the moment a human changes a generated call — its time, its unit,
    # its confirmation. From then on the template stops rewriting it, because a
    # schedule change must never quietly undo a dispatcher's correction.
    recurrence_locked = db.Column(db.Boolean, default=False)
    # The other leg of an outbound/return pair.
    linked_call_id = db.Column(db.Integer, db.ForeignKey("call.id"), nullable=True)

    confirmation_status = db.Column(db.String(20), default="not_called", index=True)
    confirmation_note = db.Column(db.Text)
    confirmed_at = db.Column(db.String(50))
    confirmed_by = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)
    confirmed_by_name = db.Column(db.String(150))

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
            "estimated_duration_minutes": self.estimated_duration_minutes,
            # Derived: pickup_time + estimated_duration. "" when either is missing,
            # so the client never has to redo the arithmetic or guess an end.
            "planned_end_time": self._compute_planned_end_time(),
            # True when the planned end lands on the following day (crosses midnight).
            "planned_end_next_day": self._planned_end_next_day(),

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

            "recurring_trip_id": self.recurring_trip_id,
            "recurrence_locked": bool(self.recurrence_locked),
            "linked_call_id": self.linked_call_id,

            "confirmation_status": self.confirmation_status or "not_called",
            "confirmation_note": self.confirmation_note or "",
            "confirmed_at": self.confirmed_at or "",
            "confirmed_by": self.confirmed_by,
            "confirmed_by_name": self.confirmed_by_name or "",
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
        # Avoid N+1: callers should join Patient and set _patient_cache when loading in bulk.
        if hasattr(self, "_patient_cache") and self._patient_cache is not None:
            p = self._patient_cache
            return f"{p.first_name} {p.last_name}".strip()
        if not self.patient_id:
            return None
        p = db.session.get(Patient, self.patient_id)
        if not p:
            return None
        return f"{p.first_name} {p.last_name}".strip()

    def _planned_end_datetime(self):
        """pickup_time + estimated_duration as a datetime, or None if either is
        missing or the time is malformed. Mirrors DailyCrewUnit's shift end."""
        if not self.pickup_time or not self.estimated_duration_minutes:
            return None
        try:
            from datetime import datetime, timedelta
            start = datetime.strptime(self.pickup_time.strip(), "%H:%M")
            return start + timedelta(minutes=int(self.estimated_duration_minutes))
        except (ValueError, TypeError):
            return None

    def _compute_planned_end_time(self):
        """HH:MM the unit is expected free, or "" when it cannot be computed."""
        end = self._planned_end_datetime()
        return end.strftime("%H:%M") if end else ""

    def _planned_end_next_day(self):
        """True when the planned end crosses midnight into the next day."""
        end = self._planned_end_datetime()
        # strptime with no date parses onto 1900-01-01; a later day means it wrapped.
        return bool(end and end.day != 1)


class NotificationEvent(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    type = db.Column(db.String(100), nullable=False)
    severity = db.Column(db.String(20), default="info")  # info | warning | critical
    title = db.Column(db.String(255), nullable=False)
    body = db.Column(db.Text)
    entity_type = db.Column(db.String(50))   # call | unit | employee
    entity_id = db.Column(db.Integer)
    created_at = db.Column(db.String(50), nullable=False, index=True)
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
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False, index=True)
    is_read = db.Column(db.Boolean, default=False, index=True)
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


class TimeEntry(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(db.Integer, db.ForeignKey("employee.id"), nullable=False, index=True)

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
    employee_id = db.Column(db.Integer, db.ForeignKey("employee.id"), nullable=False, index=True)
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
    expiry_date = db.Column(db.String(20), index=True)   # YYYY-MM-DD, nullable

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
    timestamp     = db.Column(db.String(50), nullable=False, index=True)
    user_id       = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)
    user_name     = db.Column(db.String(150))        # denormalized for display after user deletion
    action        = db.Column(db.String(100), nullable=False)   # e.g. "call.assigned"
    entity_type   = db.Column(db.String(50), index=True)         # "call", "patient", "unit", "time_entry"
    entity_id     = db.Column(db.Integer)
    entity_label  = db.Column(db.String(255))        # human-readable: "Call #42", "John Doe"
    details       = db.Column(db.Text)               # JSON string with old/new values or extra context

    # Tenant owner — so one organisation's admin cannot read another's audit trail.
    # Stamped automatically for in-request writes (tenant.py); a system-written entry
    # (no request context) has none and is not shown in any org's view.
    org_id        = db.Column(db.Integer, db.ForeignKey("organization.id"), nullable=True, index=True)

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


# ── Staff Tasks ─────────────────────────────────────────────────────────────

class Task(db.Model):
    __tablename__ = "task"

    id = db.Column(db.Integer, primary_key=True)

    # Tenant owner. The only top-level tenant entity that lacked org_id; added so
    # tasks are isolated like the other org-owned records (its child tables —
    # participants, comments, activity — inherit the tenant through the task).
    org_id = db.Column(db.Integer, db.ForeignKey("organization.id"), nullable=True, index=True)

    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, nullable=True)

    task_type = db.Column(db.String(50), nullable=False, default="General Task")
    status = db.Column(db.String(30), nullable=False, default="New", index=True)
    priority = db.Column(db.String(20), nullable=False, default="Normal")

    created_by_user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)
    assigned_to_employee_id = db.Column(db.Integer, db.ForeignKey("employee.id"), nullable=True, index=True)
    assigned_by_user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)

    # Polymorphic link to another module's record (call/patient/employee/crew/vehicle).
    # No FK constraint on purpose — related_module determines which table entity_id points to.
    related_module = db.Column(db.String(50), nullable=True)
    related_entity_id = db.Column(db.Integer, nullable=True)

    due_date = db.Column(db.String(20), nullable=True, index=True)  # YYYY-MM-DD, date-only
    completed_at = db.Column(db.String(50), nullable=True)

    created_at = db.Column(db.String(50), nullable=False)
    updated_at = db.Column(db.String(50), nullable=False)

    is_archived = db.Column(db.Boolean, default=False)

    # When true, the task is an announcement visible to every known-role user
    # (in addition to its creator/assignee/participants).
    visible_to_all = db.Column(db.Boolean, default=False, nullable=False)

    assignee = db.relationship("Employee", foreign_keys=[assigned_to_employee_id])
    creator = db.relationship("User", foreign_keys=[created_by_user_id])
    participants = db.relationship(
        "TaskParticipant", back_populates="task", cascade="all, delete-orphan"
    )

    TERMINAL_STATUSES = {"Completed", "Cancelled"}

    def participant_employee_ids(self):
        return [p.employee_id for p in self.participants]

    def is_overdue(self):
        if not self.due_date or self.status in self.TERMINAL_STATUSES:
            return False
        from datetime import date
        try:
            return date.fromisoformat(self.due_date) < date.today()
        except ValueError:
            return False

    def to_dict(self):
        emp = self.assignee
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "task_type": self.task_type,
            "status": self.status,
            "priority": self.priority,
            "created_by_user_id": self.created_by_user_id,
            "created_by_user_name": self.creator.display_name if self.creator else None,
            "assigned_to_employee_id": self.assigned_to_employee_id,
            "assigned_to_employee_name": f"{emp.first_name} {emp.last_name}" if emp else None,
            "assigned_to_employee_active": emp.is_active if emp else None,
            "assigned_by_user_id": self.assigned_by_user_id,
            "related_module": self.related_module,
            "related_entity_id": self.related_entity_id,
            "due_date": self.due_date,
            "completed_at": self.completed_at,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "is_archived": self.is_archived,
            "is_overdue": self.is_overdue(),
            "visible_to_all": bool(self.visible_to_all),
            "participant_employee_ids": self.participant_employee_ids(),
        }


class TaskParticipant(db.Model):
    """Additional employees who can see a task (beyond its creator/assignee).

    Kept employee-scoped to mirror `assigned_to_employee_id` so the same
    logged-in-user → employee_id resolution drives visibility everywhere.
    """
    __tablename__ = "task_participant"
    __table_args__ = (db.UniqueConstraint("task_id", "employee_id", name="uq_task_participant"),)

    id = db.Column(db.Integer, primary_key=True)
    task_id = db.Column(db.Integer, db.ForeignKey("task.id"), nullable=False)
    employee_id = db.Column(db.Integer, db.ForeignKey("employee.id"), nullable=False)

    task = db.relationship("Task", back_populates="participants")
    employee = db.relationship("Employee", foreign_keys=[employee_id])


class TaskComment(db.Model):
    __tablename__ = "task_comment"

    id = db.Column(db.Integer, primary_key=True)
    task_id = db.Column(db.Integer, db.ForeignKey("task.id"), nullable=False, index=True)
    author_user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)
    author_name = db.Column(db.String(150), nullable=True)  # denormalized for display after user deletion

    comment_text = db.Column(db.Text, nullable=False)

    created_at = db.Column(db.String(50), nullable=False)
    updated_at = db.Column(db.String(50), nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "task_id": self.task_id,
            "author_user_id": self.author_user_id,
            "author_name": self.author_name or "System",
            "comment_text": self.comment_text,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


class TaskActivityLog(db.Model):
    __tablename__ = "task_activity_log"

    id = db.Column(db.Integer, primary_key=True)
    task_id = db.Column(db.Integer, db.ForeignKey("task.id"), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)
    user_name = db.Column(db.String(150), nullable=True)  # denormalized for display after user deletion

    # created/assigned/status_changed/priority_changed/due_date_changed/completed/cancelled/commented
    action_type = db.Column(db.String(50), nullable=False)
    old_value = db.Column(db.Text, nullable=True)
    new_value = db.Column(db.Text, nullable=True)

    created_at = db.Column(db.String(50), nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "task_id": self.task_id,
            "user_id": self.user_id,
            "user_name": self.user_name or "System",
            "action_type": self.action_type,
            "old_value": self.old_value,
            "new_value": self.new_value,
            "created_at": self.created_at,
        }


# ── Employee leave / absence (roadmap Phase 4d) ─────────────────────────────

class EmployeeLeaveRequest(db.Model):
    """A period an employee is unavailable, as one row per request.

    A multi-day absence is a single row with a date range, never one row per day:
    the request is the thing being approved, and per-day rows would make an
    approval or a cancellation a multi-row edit that can half-fail.

    Privacy is structural, not cosmetic. `reason` and `private_notes` and — for
    the sensitive types — the type itself are only ever emitted by `to_dict` at
    the "hr" visibility level. Scheduling roles receive an entry that says the
    person is unavailable and nothing more, so a dispatcher looking at staffing
    physically cannot learn that a colleague is on medical leave.
    """
    __tablename__ = "employee_leave_request"

    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(db.Integer, db.ForeignKey("employee.id"), nullable=False, index=True)

    # Canonical value from utils.taxonomy.LEAVE_TYPES.
    leave_type = db.Column(db.String(30), nullable=False)

    # Inclusive YYYY-MM-DD range; a single day has start == end.
    start_date = db.Column(db.String(20), nullable=False, index=True)
    end_date = db.Column(db.String(20), nullable=False, index=True)

    # Partial day: HH:MM window inside the range. Only meaningful on a
    # single-day request, which the API enforces.
    start_time = db.Column(db.String(20))
    end_time = db.Column(db.String(20))

    # Canonical value from utils.taxonomy.LEAVE_STATUSES.
    status = db.Column(db.String(20), nullable=False, default="pending", index=True)

    # HR-visible only. `reason` is what the employee gave; `private_notes` is
    # what HR wrote about it.
    reason = db.Column(db.Text)
    private_notes = db.Column(db.Text)

    # Submission / review trail. Names are denormalized so the record still reads
    # correctly after a user account is removed.
    submitted_at = db.Column(db.String(50))
    submitted_by = db.Column(db.Integer, db.ForeignKey("user.id"))
    submitted_by_name = db.Column(db.String(150))
    reviewed_at = db.Column(db.String(50))
    reviewed_by = db.Column(db.Integer, db.ForeignKey("user.id"))
    reviewed_by_name = db.Column(db.String(150))
    review_note = db.Column(db.Text)

    created_at = db.Column(db.String(50))
    updated_at = db.Column(db.String(50))

    # Multi-tenancy foundation.
    org_id = db.Column(db.Integer, db.ForeignKey("organization.id"), nullable=True)

    employee = db.relationship("Employee", foreign_keys=[employee_id])

    def blocks_scheduling(self):
        """Approved leave makes the employee unavailable."""
        from utils.taxonomy import BLOCKING_LEAVE_STATUSES
        return self.status in BLOCKING_LEAVE_STATUSES

    def warns_scheduling(self):
        """A pending request is a soft warning — it may still be denied."""
        from utils.taxonomy import WARNING_LEAVE_STATUSES
        return self.status in WARNING_LEAVE_STATUSES

    def covers(self, date_str):
        """True when the given YYYY-MM-DD falls inside the inclusive range."""
        return bool(date_str) and self.start_date <= date_str <= self.end_date

    def to_dict(self, visibility="scheduling"):
        """Serialize at one of three levels.

        "hr"         — everything, for admin/HR.
        "self"       — the requester's own view: their real leave type, reason and
                       the review decision (who decided, when, and the note left
                       *for them*), but never HR's private notes.
        "scheduling" — who is away and when, and nothing else. Sensitive types
                       collapse to "unavailable"; reason, notes and the review
                       trail are omitted entirely rather than blanked, so they
                       cannot be recovered from the shape of the response.
        """
        from utils.taxonomy import is_sensitive_leave_type

        data = {
            "id": self.id,
            "employeeId": self.employee_id,
            "startDate": self.start_date,
            "endDate": self.end_date,
            "startTime": self.start_time or "",
            "endTime": self.end_time or "",
            "isPartialDay": bool(self.start_time or self.end_time),
            "status": self.status,
            "blocksScheduling": self.blocks_scheduling(),
        }

        if visibility == "hr":
            data.update({
                "leaveType": self.leave_type,
                "reason": self.reason or "",
                "privateNotes": self.private_notes or "",
                "submittedAt": self.submitted_at or "",
                "submittedBy": self.submitted_by,
                "submittedByName": self.submitted_by_name or "",
                "reviewedAt": self.reviewed_at or "",
                "reviewedBy": self.reviewed_by,
                "reviewedByName": self.reviewed_by_name or "",
                "reviewNote": self.review_note or "",
                "createdAt": self.created_at,
                "updatedAt": self.updated_at,
            })
        elif visibility == "self":
            # The employee filed this, so they see their own real type and reason,
            # plus the decision and the reviewer's note to them — but not the
            # HR-only private_notes, nor the raw reviewer/submitter user ids.
            data.update({
                "leaveType": self.leave_type,
                "reason": self.reason or "",
                "submittedAt": self.submitted_at or "",
                "reviewedAt": self.reviewed_at or "",
                "reviewedByName": self.reviewed_by_name or "",
                "reviewNote": self.review_note or "",
            })
        else:
            # A non-sensitive type is safe to name (Vacation, Training); anything
            # touching health or bereavement is reported as plain unavailability.
            data["leaveType"] = "unavailable" if is_sensitive_leave_type(self.leave_type) else self.leave_type

        return data


class OperationalDayClosure(db.Model):
    """A day someone has reviewed and signed off.

    Past dates are already read-only (see utils.operational_dates), so this is
    not a lock — it is the record that a human checked the day, what state it was
    in when they did, and what they said about it. Without it "yesterday is
    finished" is an assumption; with it, it is a fact with a name against it.

    The counts are a snapshot taken at closing time. They are stored rather than
    recomputed because the point is what the day looked like when it was signed
    off — a later edit to a call should not silently rewrite the handoff.
    """
    __tablename__ = "operational_day_closure"

    id = db.Column(db.Integer, primary_key=True)

    # One closure per operational day.
    day = db.Column(db.String(20), nullable=False, unique=True, index=True)

    closed_at = db.Column(db.String(50), nullable=False)
    closed_by = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)
    closed_by_name = db.Column(db.String(150))
    notes = db.Column(db.Text)

    # Snapshot of the day as it stood when it was closed.
    calls_total = db.Column(db.Integer, default=0)
    calls_completed = db.Column(db.Integer, default=0)
    calls_cancelled = db.Column(db.Integer, default=0)
    calls_unfinished = db.Column(db.Integer, default=0)
    units_total = db.Column(db.Integer, default=0)
    units_unfinished = db.Column(db.Integer, default=0)

    # Multi-tenancy foundation.
    org_id = db.Column(db.Integer, db.ForeignKey("organization.id"), nullable=True)

    def to_dict(self):
        return {
            "day": self.day,
            "closedAt": self.closed_at,
            "closedBy": self.closed_by,
            "closedByName": self.closed_by_name or "",
            "notes": self.notes or "",
            "snapshot": {
                "callsTotal": self.calls_total or 0,
                "callsCompleted": self.calls_completed or 0,
                "callsCancelled": self.calls_cancelled or 0,
                "callsUnfinished": self.calls_unfinished or 0,
                "unitsTotal": self.units_total or 0,
                "unitsUnfinished": self.units_unfinished or 0,
            },
        }


class RecurringTrip(db.Model):
    """A standing transport order — dialysis every Mon/Wed/Fri, and the like.

    The template does not replace the trips it produces: it materialises real
    Call rows a few weeks ahead. Every generated trip is an ordinary call, so the
    board, the calendar, the confirmation round and cancellation all work on it
    without knowing recurrence exists. The alternative — computing trips on the
    fly — would have meant teaching every one of those surfaces about records
    that do not exist yet.
    """
    __tablename__ = "recurring_trip"

    id = db.Column(db.Integer, primary_key=True)
    patient_id = db.Column(db.Integer, db.ForeignKey("patient.id"), nullable=False, index=True)

    # What the trip is, copied onto each generated call.
    service_level = db.Column(db.String(50))
    call_type = db.Column(db.String(50), default="Appointment")
    pickup_time = db.Column(db.String(20))
    pickup_address = db.Column(db.String(500))
    dropoff_address = db.Column(db.String(500))
    notes = db.Column(db.Text)

    # Weekdays as a JSON array of ints, Monday = 0 (matches date.weekday()).
    weekdays = db.Column(db.Text, nullable=False, default="[]")

    start_date = db.Column(db.String(20), nullable=False, index=True)
    end_date = db.Column(db.String(20))          # NULL = open-ended
    horizon_weeks = db.Column(db.Integer, default=4)

    # The return leg, when the patient is brought back the same day.
    return_pickup_time = db.Column(db.String(20))

    is_active = db.Column(db.Boolean, default=True, index=True)

    created_at = db.Column(db.String(50))
    created_by_name = db.Column(db.String(150))
    updated_at = db.Column(db.String(50))

    org_id = db.Column(db.Integer, db.ForeignKey("organization.id"), nullable=True)

    patient = db.relationship("Patient", foreign_keys=[patient_id])

    def parsed_weekdays(self):
        try:
            days = json.loads(self.weekdays or "[]")
            return sorted({int(d) for d in days if 0 <= int(d) <= 6})
        except (ValueError, TypeError):
            return []

    def to_dict(self):
        patient = self.patient
        return {
            "id": self.id,
            "patientId": self.patient_id,
            "patientName": f"{patient.first_name} {patient.last_name}".strip() if patient else "",
            "serviceLevel": self.service_level or "",
            "callType": self.call_type or "Appointment",
            "pickupTime": self.pickup_time or "",
            "pickupAddress": self.pickup_address or "",
            "dropoffAddress": self.dropoff_address or "",
            "notes": self.notes or "",
            "weekdays": self.parsed_weekdays(),
            "startDate": self.start_date,
            "endDate": self.end_date or "",
            "horizonWeeks": self.horizon_weeks or 4,
            "returnPickupTime": self.return_pickup_time or "",
            "isActive": bool(self.is_active),
            "createdAt": self.created_at or "",
            "createdByName": self.created_by_name or "",
            "updatedAt": self.updated_at or "",
        }


class CalendarEvent(db.Model):
    """A manually created calendar entry — a meeting, reminder, training day, or
    time-off marker — as opposed to the events the calendar derives from calls,
    shifts and certifications.

    Visibility decides who else sees it:
      personal — only the owner
      role     — everyone holding `visible_to_role`
      company  — everyone

    The API enforces this on read (the aggregator filters) and on write (only
    admin/supervisor may broadcast a role- or company-wide event; anyone may keep
    a personal one). Edits and deletes are the owner's or an admin's.
    """
    __tablename__ = "calendar_event"

    VISIBILITIES = ("personal", "role", "company")

    id = db.Column(db.Integer, primary_key=True)

    title = db.Column(db.String(150), nullable=False)
    description = db.Column(db.Text)

    event_date = db.Column(db.String(20), nullable=False, index=True)  # YYYY-MM-DD
    start_time = db.Column(db.String(20))   # HH:MM, optional
    end_time = db.Column(db.String(20))     # HH:MM, optional
    all_day = db.Column(db.Boolean, default=True, nullable=False)

    # meeting | reminder | training | time_off | other (free-ish; drives a colour)
    category = db.Column(db.String(30))

    visibility = db.Column(db.String(20), nullable=False, default="personal")
    visible_to_role = db.Column(db.String(30))  # set only when visibility == "role"

    # Recurrence: none | daily | weekly | monthly. The event is one row; the
    # calendar expands it into occurrences within the window it is rendering, and
    # editing or deleting the row changes the whole series (no per-occurrence
    # edits). recurrence_until (inclusive, optional) caps an otherwise open series.
    recurrence = db.Column(db.String(20), nullable=False, default="none")
    recurrence_until = db.Column(db.String(20))  # YYYY-MM-DD, optional

    # Minutes before the event's start to notify the owner + participants; 0 = no
    # reminder. For an all-day event the anchor is the start of the day. The scan
    # in run_temporal_checks() turns a crossed lead time into an `event_reminder`.
    reminder_minutes = db.Column(db.Integer, nullable=False, default=0)

    owner_user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False, index=True)
    owner_name = db.Column(db.String(150))

    created_at = db.Column(db.String(50))
    updated_at = db.Column(db.String(50))

    org_id = db.Column(db.Integer, db.ForeignKey("organization.id"), nullable=True)

    # Additional people invited to the event: they see it on their calendar and
    # receive the invite + reminder notifications. Employee-scoped to mirror task
    # participants (same picker, same logged-in-user → employee resolution).
    participants = db.relationship(
        "CalendarEventParticipant", back_populates="event",
        cascade="all, delete-orphan", passive_deletes=True,
    )

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description or "",
            "eventDate": self.event_date,
            "startTime": self.start_time or "",
            "endTime": self.end_time or "",
            "allDay": bool(self.all_day),
            "category": self.category or "",
            "visibility": self.visibility,
            "visibleToRole": self.visible_to_role or "",
            "recurrence": self.recurrence or "none",
            "recurrenceUntil": self.recurrence_until or "",
            "reminderMinutes": self.reminder_minutes or 0,
            "participants": [p.to_dict() for p in self.participants],
            "ownerUserId": self.owner_user_id,
            "ownerName": self.owner_name or "",
            "createdAt": self.created_at or "",
            "updatedAt": self.updated_at or "",
        }


class CalendarEventParticipant(db.Model):
    """An employee invited to a manual calendar event (beyond its owner).

    Mirrors TaskParticipant: employee-scoped so the same user → employee_id
    resolution drives both who sees the event and who its notifications reach
    (each participant employee's linked user account, if any)."""
    __tablename__ = "calendar_event_participant"
    __table_args__ = (
        db.UniqueConstraint("event_id", "employee_id", name="uq_calendar_event_participant"),
    )

    id = db.Column(db.Integer, primary_key=True)
    event_id = db.Column(
        db.Integer, db.ForeignKey("calendar_event.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    employee_id = db.Column(db.Integer, db.ForeignKey("employee.id"), nullable=False)

    event = db.relationship("CalendarEvent", back_populates="participants")
    employee = db.relationship("Employee", foreign_keys=[employee_id])

    def to_dict(self):
        emp = self.employee
        name = f"{emp.first_name} {emp.last_name}".strip() if emp else ""
        return {"employeeId": self.employee_id, "name": name}


# ── Tenant scoping ────────────────────────────────────────────────────────────
#
# The models that carry an `org_id` and are therefore isolated per organisation.
# Named once here so the tenant filter/stamp events (tenant.py) and any future
# tooling share one authoritative list rather than drifting apart. Child/detail
# tables (documents, assignments, task comments, …) are deliberately absent: they
# have no org_id and inherit their tenant through an org-owning parent.
ORG_SCOPED_MODELS = (
    User, Employee, Vehicle, DailyCrewUnit, CrewPreset, Patient, Call,
    NotificationEvent, PayPeriod, EmployeeLeaveRequest, OperationalDayClosure,
    RecurringTrip, CalendarEvent, Task, AuditLog,
)
