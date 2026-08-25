"""Patients and their alerts / contacts."""

from .base import db
from .org import Organization


def _decrypt_patient_field(patient, field):
    """Return the plaintext of an encrypted Patient field for output.

    Plaintext values (encryption off, or legacy rows) pass straight through with no
    key work. A ciphertext value is decrypted with the patient's org key; a value
    that cannot be decrypted (missing key or tamper) returns None rather than a raw
    token, so the API never leaks ciphertext or crashes serialization.
    """
    value = getattr(patient, field, None)
    from core.security.crypto import is_ciphertext, DecryptionError
    if not is_ciphertext(value):
        return value
    from core.security.encrypted_fields import read_instance_field
    try:
        org = Organization.query.get(patient.org_id) if patient.org_id else None
        return read_instance_field(patient, org, "patient", field)
    except DecryptionError:
        return None


class Patient(db.Model):
    id = db.Column(db.Integer, primary_key=True)

    # Basic patient information.
    first_name = db.Column(db.String(100))
    last_name = db.Column(db.String(100), index=True)
    # dob is sensitive (the year is identifying) and encrypted at rest (Text). Exact
    # search / duplicate detection go through dob_bidx (a blind index); the birthday
    # calendar filters on the non-identifying dob_month_day ("MM-DD"). See
    # docs/design/DOB_LASTNAME_ENCRYPTION.md. last_name/first_name stay plaintext by
    # design (substring-searched + alphabetically paginated).
    dob = db.Column(db.Text)
    dob_bidx = db.Column(db.String(64), index=True)
    dob_month_day = db.Column(db.String(5), index=True)
    gender = db.Column(db.String(50))

    # Contact information. phone / secondary_phone / address are sensitive PII and
    # encrypted at rest when a master key is configured (Text to hold ciphertext);
    # not searched, so no blind index. city / state / zip stay plaintext (coarse,
    # and used for grouping/display, not identifying).
    phone = db.Column(db.Text)
    secondary_phone = db.Column(db.Text)
    address = db.Column(db.Text)
    city = db.Column(db.String(100))
    state = db.Column(db.String(50))
    zip_code = db.Column(db.String(20))

    # Insurance information.
    insurance = db.Column(db.String(150))
    # member_id is a sensitive identifier: at rest it holds ciphertext when a master
    # key is configured (else plaintext), so it is Text (ciphertext is longer). Its
    # blind index enables exact-match search without decryption.
    member_id = db.Column(db.Text)
    member_id_bidx = db.Column(db.String(64), index=True)
    # policy_number and insurance_notes are sensitive and encrypted at rest too
    # (Text to hold ciphertext); not searched, so no blind index.
    policy_number = db.Column(db.Text)
    requires_auth = db.Column(db.Boolean, default=False)
    copay_required = db.Column(db.Boolean, default=False)
    insurance_notes = db.Column(db.Text)

    # EMS-specific information.
    default_service_level = db.Column(db.String(50))
    weight = db.Column(db.String(20))
    oxygen_required = db.Column(db.Boolean, default=False)
    stairs = db.Column(db.Boolean, default=False)
    special_equipment_notes = db.Column(db.Text)

    # Facility and emergency contact — sensitive PII, encrypted at rest (Text).
    facility_name = db.Column(db.Text)
    room_number = db.Column(db.Text)
    emergency_contact_name = db.Column(db.Text)
    emergency_contact_phone = db.Column(db.Text)

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
            "dob": _decrypt_patient_field(self, "dob"),
            "gender": self.gender,

            "phone": _decrypt_patient_field(self, "phone"),
            "secondary_phone": _decrypt_patient_field(self, "secondary_phone"),
            "address": _decrypt_patient_field(self, "address"),
            "city": self.city,
            "state": self.state,
            "zip_code": self.zip_code,

            "insurance": self.insurance,
            "member_id": _decrypt_patient_field(self, "member_id"),
            "policy_number": _decrypt_patient_field(self, "policy_number"),
            "requires_auth": self.requires_auth,
            "copay_required": self.copay_required,
            "insurance_notes": _decrypt_patient_field(self, "insurance_notes"),

            "default_service_level": self.default_service_level,
            "weight": self.weight,
            "oxygen_required": self.oxygen_required,
            "stairs": self.stairs,
            "special_equipment_notes": _decrypt_patient_field(self, "special_equipment_notes"),

            "facility_name": _decrypt_patient_field(self, "facility_name"),
            "room_number": _decrypt_patient_field(self, "room_number"),
            "emergency_contact_name": _decrypt_patient_field(self, "emergency_contact_name"),
            "emergency_contact_phone": _decrypt_patient_field(self, "emergency_contact_phone"),

            "notes": _decrypt_patient_field(self, "notes"),

            "dispatch_comment": _decrypt_patient_field(self, "dispatch_comment"),

            "default_mobility_level": self.default_mobility_level,
            "transport_instructions": _decrypt_patient_field(self, "transport_instructions"),
            "access_instructions": _decrypt_patient_field(self, "access_instructions"),
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
