"""Employee, HR events, pay, leave, and employee documents."""

from .base import db
from .org import Organization


def _decrypt_employee_field(employee, field):
    """Plaintext of an encrypted Employee field for output; plaintext/legacy values
    pass straight through, and an undecryptable value returns None (never a raw
    token). Mirrors _decrypt_patient_field for the employee entity."""
    value = getattr(employee, field, None)
    from core.security.crypto import is_ciphertext, DecryptionError
    if not is_ciphertext(value):
        return value
    from core.security.encrypted_fields import read_instance_field
    try:
        org = Organization.query.get(employee.org_id) if employee.org_id else None
        return read_instance_field(employee, org, "employee", field)
    except DecryptionError:
        return None


def _decrypt_document_field(doc, field):
    """Plaintext of an encrypted EmployeeDocument field. The document has no org_id
    of its own — its tenant is its Employee's — so the org (for the DEK) comes from
    the parent. Plaintext passthrough / undecryptable → None, like the others."""
    value = getattr(doc, field, None)
    from core.security.crypto import is_ciphertext, DecryptionError
    if not is_ciphertext(value):
        return value
    from core.security.encrypted_fields import read_instance_field
    try:
        org_id = doc.employee.org_id if doc.employee else None
        org = Organization.query.get(org_id) if org_id else None
        return read_instance_field(doc, org, "employee_document", field)
    except DecryptionError:
        return None


class Employee(db.Model):
    id = db.Column(db.Integer, primary_key=True)

    # Basic employee information.
    first_name = db.Column(db.String(100), nullable=False)
    last_name = db.Column(db.String(100), nullable=False)
    # Contact PII — encrypted at rest when a master key is configured (Text to hold
    # ciphertext); not searched, so no blind index.
    phone = db.Column(db.Text)
    email = db.Column(db.Text)
    employee_number = db.Column(db.String(50))
    hire_date = db.Column(db.String(20))
    # dob encrypted at rest (Text); the birthday calendar filters on the
    # non-identifying dob_month_day. Not searched, so no blind index.
    dob = db.Column(db.Text)
    dob_month_day = db.Column(db.String(5), index=True)
    # Annual PTO allotment in days; None falls back to the org default. Accrual is
    # monthly (annual / 12) — see utils/pto.py.
    pto_annual_days = db.Column(db.Float)

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
    # Kiosk clock-in PIN, stored **hashed** — never plaintext, never returned by the
    # API (to_dict exposes only `hasPin`). Set/verify via the methods below.
    kiosk_pin_hash = db.Column(db.Text)

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

    def set_kiosk_pin(self, pin):
        """Hash and store a kiosk PIN. An empty value leaves the current PIN
        unchanged (set-don't-view, like a password) — use clear_kiosk_pin() to remove."""
        from werkzeug.security import generate_password_hash
        pin = (pin or "").strip()
        if pin:
            self.kiosk_pin_hash = generate_password_hash(pin)

    def clear_kiosk_pin(self):
        self.kiosk_pin_hash = None

    def check_kiosk_pin(self, pin):
        """True when the PIN matches, or when no PIN is set (no PIN → not required,
        matching the prior behaviour). Constant-time via werkzeug."""
        from werkzeug.security import check_password_hash
        if not self.kiosk_pin_hash:
            return True
        return check_password_hash(self.kiosk_pin_hash, (pin or "").strip())

    def to_dict(self):
        # The kiosk PIN is a clock-in credential and is stored hashed; the payload
        # carries only whether one is set (`hasPin`), never the PIN itself.
        data = {
            "id": self.id,
            "firstName": self.first_name,
            "lastName": self.last_name,
            "phone": _decrypt_employee_field(self, "phone"),
            "email": _decrypt_employee_field(self, "email") or "",
            "employeeNumber": self.employee_number or "",
            "hireDate": self.hire_date or "",
            "dob": _decrypt_employee_field(self, "dob") or "",
            "ptoAnnualDays": self.pto_annual_days,
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

            "hasPin": bool(self.kiosk_pin_hash),
        }
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

    # A licence/certificate number — sensitive, encrypted at rest (Text to hold
    # ciphertext); not searched, so no blind index.
    document_number = db.Column(db.Text)
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
            "document_number": _decrypt_document_field(self, "document_number") or "",
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


class PtoLedgerEntry(db.Model):
    """One entry in an employee's PTO ledger. The balance is the *sum* of deltas —
    never a bare mutable number — so every change (a monthly accrual, a leave that
    spent days, a year-end carryover trim, a manual correction) is auditable and
    reversible. See utils/pto.py for the accrual/deduction logic."""
    __tablename__ = "pto_ledger_entry"

    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(db.Integer, db.ForeignKey("employee.id"), nullable=False, index=True)
    effective_date = db.Column(db.String(20), nullable=False)   # YYYY-MM-DD
    delta_days = db.Column(db.Float, nullable=False)            # + earned, − spent
    kind = db.Column(db.String(20), nullable=False)            # accrual|used|carryover|adjustment
    # Links a `used` entry back to the leave that spent it, so a cancel/deny can
    # reverse exactly what was taken.
    leave_request_id = db.Column(db.Integer, db.ForeignKey("employee_leave_request.id"), nullable=True, index=True)
    # YYYY-MM for an accrual/carryover, so re-running the accrual never double-posts.
    period = db.Column(db.String(7))
    note = db.Column(db.String(255))
    created_at = db.Column(db.String(50))
    created_by = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)

    org_id = db.Column(db.Integer, db.ForeignKey("organization.id"), nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "employeeId": self.employee_id,
            "effectiveDate": self.effective_date,
            "deltaDays": self.delta_days,
            "kind": self.kind,
            "leaveRequestId": self.leave_request_id,
            "note": self.note or "",
            "createdAt": self.created_at or "",
        }


class Holiday(db.Model):
    """A company-observed holiday. A holiday inside a leave range does not spend PTO
    (excluded, with weekends, from the business-day count). Org-scoped so each
    organisation keeps its own calendar."""
    __tablename__ = "holiday"
    __table_args__ = (db.UniqueConstraint("org_id", "date", name="uq_holiday_org_date"),)

    id = db.Column(db.Integer, primary_key=True)
    date = db.Column(db.String(20), nullable=False, index=True)   # YYYY-MM-DD
    name = db.Column(db.String(150), nullable=False)
    created_at = db.Column(db.String(50))

    org_id = db.Column(db.Integer, db.ForeignKey("organization.id"), nullable=True)

    def to_dict(self):
        return {"id": self.id, "date": self.date, "name": self.name}
