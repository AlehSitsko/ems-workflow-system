"""Calls, call notes, and recurring trip templates."""

import json
from .base import db
from .org import Organization
from .patient import Patient  # Call.to_dict resolves a patient label by primary key


def _decrypt_call_field(call, field):
    """Plaintext of an encrypted Call field for output; plaintext/legacy passes
    through, undecryptable → None. Call is org-scoped (has its own org_id)."""
    value = getattr(call, field, None)
    from core.security.crypto import is_ciphertext, DecryptionError
    if not is_ciphertext(value):
        return value
    from core.security.encrypted_fields import read_instance_field
    try:
        org = Organization.query.get(call.org_id) if call.org_id else None
        return read_instance_field(call, org, "call", field)
    except DecryptionError:
        return None


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
    # Caller contact details — sensitive, encrypted at rest (Text). Not searched,
    # so no blind index. (pickup/dropoff addresses stay plaintext: operational data
    # shown to all dispatchers and carried by realtime events/notifications.)
    caller_phone = db.Column(db.Text)
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

            "caller_phone": _decrypt_call_field(self, "caller_phone") or "",
            "caller_note": _decrypt_call_field(self, "caller_note") or "",

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


class CallNote(db.Model):
    """An append-only communication log entry on a call — who said/did what and
    when, for handoffs and dispatch history. Notes are never edited or deleted."""
    __tablename__ = "call_note"

    id = db.Column(db.Integer, primary_key=True)
    call_id = db.Column(db.Integer, db.ForeignKey("call.id"), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)
    user_name = db.Column(db.String(150))
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.String(50))
    org_id = db.Column(db.Integer, db.ForeignKey("organization.id"), nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "callId": self.call_id,
            "userId": self.user_id,
            "userName": self.user_name or "System",
            "content": self.content,
            "createdAt": self.created_at,
        }
