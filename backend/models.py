from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


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
        # Convert the Patient database object into a JSON-friendly dictionary.
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

    # Link this call to a patient.
    patient_id = db.Column(
        db.Integer,
        db.ForeignKey("patient.id"),
        nullable=True
    )

    # Dispatcher information.
    # Temporary implementation before authentication system.
    dispatcher_name = db.Column(db.String(100))

    # Call metadata.
    date_of_call = db.Column(db.String(20))
    trip_date = db.Column(db.String(20))
    pickup_time = db.Column(db.String(20))

    # Trip details.
    pickup_address = db.Column(db.Text)
    dropoff_address = db.Column(db.Text)

    # Operational fields.
    caller_type = db.Column(db.String(100))
    call_type = db.Column(db.String(100))
    service_level = db.Column(db.String(100))

    # Call quality tracking.
    quality_score = db.Column(db.Integer)

    # Missing fields are stored separately to support
    # future analytics and supervisor reporting.
    missing_critical_fields = db.Column(db.Text)
    missing_optional_fields = db.Column(db.Text)

    # Required explanation when critical data is missing.
    missing_info_explanation = db.Column(db.Text)

    # General notes.
    notes = db.Column(db.Text)

    def to_dict(self):
        # Convert the Call database object into a JSON-friendly dictionary.
        return {
            "id": self.id,

            "patient_id": self.patient_id,

            "dispatcher_name": self.dispatcher_name,

            "date_of_call": self.date_of_call,
            "trip_date": self.trip_date,
            "pickup_time": self.pickup_time,

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