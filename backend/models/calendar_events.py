"""Manual calendar events and their participants."""

from .base import db


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
