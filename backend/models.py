import json

from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


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

    def to_dict(self):
        # Never return password_hash to the frontend.
        return {
            "id": self.id,
            "username": self.username,
            "display_name": self.display_name,
            "role": self.role,
            "is_active": self.is_active,
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

    # Patient order.
    first_patient = db.Column(db.String(255), nullable=False)

    # Stored as JSON text.
    next_patients = db.Column(db.Text)

    # Optional notes.
    notes = db.Column(db.Text)

    # Dispatch operational status.
    dispatch_status = db.Column(db.String(50), default="available")

    # Timestamps.
    created_at = db.Column(db.String(50))
    updated_at = db.Column(db.String(50))

    def to_dict(self):
        try:
            parsed_next_patients = json.loads(
                self.next_patients
            ) if self.next_patients else []
        except Exception as e:
            import sys
            print(f"[WARN] DailyCrewUnit {self.id} next_patients parse error: {e}", file=sys.stderr)
            parsed_next_patients = []

        return {
            "id": self.id,

            "shiftDate": self.shift_date,

            "unitType": self.unit_type,
            "truckNumber": self.truck_number,
            "startTime": self.start_time,

            "crew": {
                "driver": str(self.driver_id) if self.driver_id else "",
                "medical": str(self.medical_id) if self.medical_id else "",
                "assist1": str(self.assist1_id) if self.assist1_id else "",
                "assist2": str(self.assist2_id) if self.assist2_id else "",
            },

            "firstPatient": self.first_patient,

            "nextPatients": parsed_next_patients,

            "notes": self.notes or "",

            "dispatchStatus": self.dispatch_status or "available",

            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
        }


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

    quality_score = db.Column(db.Integer)

    missing_critical_fields = db.Column(db.Text)
    missing_optional_fields = db.Column(db.Text)

    missing_info_explanation = db.Column(db.Text)

    notes = db.Column(db.Text)

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

            "quality_score": self.quality_score,

            "missing_critical_fields": self.missing_critical_fields,
            "missing_optional_fields": self.missing_optional_fields,
            "missing_info_explanation": self.missing_info_explanation,

            "notes": self.notes,
        }


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