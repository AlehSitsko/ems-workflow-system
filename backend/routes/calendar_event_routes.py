"""Manually created calendar events, with personal / role / company visibility.

Separate from the calendar aggregator (which only *reads* derived events): this
owns the CRUD for the one kind of calendar entry a user creates by hand. The
aggregator reuses `visible_events_filter` so a manual event shows up alongside
calls and shifts, filtered by exactly the same rule enforced here.
"""

from datetime import datetime, timedelta, timezone

from flask import Blueprint, jsonify, request, Response
from sqlalchemy.orm import selectinload

from models import db, CalendarEvent, CalendarEventParticipant, Employee, User


def event_list_options():
    """Eager-load each event's participants and their employees in two extra
    queries total, instead of one lazy load per event plus one per participant.
    CalendarEvent.to_dict() serializes every participant (name via the linked
    Employee), so listing a month of events was a nested N+1: measured 53 SELECTs
    for 40 events x3 participants, 2 with this."""
    return selectinload(CalendarEvent.participants).joinedload(CalendarEventParticipant.employee)
from utils.auth_utils import (
    require_role, get_request_role, get_request_user_id, get_request_user_name,
    ALL_ROLES,
)
from utils.validation_utils import is_valid_date, check_length
from utils.event_recurrence import VALID_RECURRENCES


calendar_event_bp = Blueprint("calendar_event", __name__, url_prefix="/api/calendar-events")

# Broadcasting an event to a whole role or the whole company is a supervisory
# act; keeping a personal one is not.
_BROADCAST_ROLES = ("admin", "supervisor")
_MAX_RANGE_DAYS = 93

# The lead times the UI offers, in minutes; 0 means no reminder. Kept a closed
# set so a stored value always maps to a menu option.
ALLOWED_REMINDERS = (0, 10, 30, 60, 120, 1440)


def _caller_employee_id():
    """The employee record linked to the signed-in user, or None. Drives the
    participant-visibility clause (a participant is an employee)."""
    uid = get_request_user_id()
    user = User.query.get(uid) if uid else None
    return user.employee_id if user else None


def visible_events_filter(user_id, role, employee_id=None):
    """A SQLAlchemy predicate: the calendar events this caller may see.

    company — everyone; personal — only the owner; role — only holders of the
    named role; plus any event the caller is a *participant* of. Shared with the
    calendar aggregator so both agree.
    """
    clauses = [
        CalendarEvent.visibility == "company",
        db.and_(CalendarEvent.visibility == "personal", CalendarEvent.owner_user_id == user_id),
        db.and_(CalendarEvent.visibility == "role", CalendarEvent.visible_to_role == role),
    ]
    if employee_id is not None:
        clauses.append(CalendarEvent.id.in_(
            db.select(CalendarEventParticipant.event_id)
            .where(CalendarEventParticipant.employee_id == employee_id)
        ))
    return db.or_(*clauses)


def _validate_time(value, field):
    """HH:MM or empty. Raises ValueError otherwise."""
    if not value:
        return None
    try:
        h, m = value.split(":")
        if not (0 <= int(h) <= 23 and 0 <= int(m) <= 59):
            raise ValueError
    except (ValueError, AttributeError):
        raise ValueError(f"{field} must be HH:MM")
    return value


def _parse_body(data, role):
    """Validate and normalise a create/update payload. Returns a dict of column
    values, or raises ValueError with a message."""
    out = {}

    if "title" in data:
        title = (data.get("title") or "").strip()
        if not title:
            raise ValueError("title is required")
        check_length(title, 150, "title")
        out["title"] = title

    if "eventDate" in data:
        if not is_valid_date(data.get("eventDate") or ""):
            raise ValueError("eventDate must be a real YYYY-MM-DD date")
        out["event_date"] = data["eventDate"]

    if "description" in data:
        check_length(data.get("description"), 2000, "description")
        out["description"] = (data.get("description") or "").strip() or None

    if "category" in data:
        out["category"] = (data.get("category") or "").strip() or None

    if "allDay" in data:
        out["all_day"] = bool(data.get("allDay"))

    if "startTime" in data:
        out["start_time"] = _validate_time((data.get("startTime") or "").strip(), "startTime")
    if "endTime" in data:
        out["end_time"] = _validate_time((data.get("endTime") or "").strip(), "endTime")

    if "visibility" in data:
        visibility = (data.get("visibility") or "").strip()
        if visibility not in CalendarEvent.VISIBILITIES:
            raise ValueError("visibility must be personal, role or company")
        if visibility in ("role", "company") and role not in _BROADCAST_ROLES:
            raise ValueError("only admin or supervisor may create role- or company-wide events")
        out["visibility"] = visibility
        if visibility == "role":
            target = (data.get("visibleToRole") or "").strip()
            if target not in ALL_ROLES:
                raise ValueError("visibleToRole must be a valid role for a role-scoped event")
            out["visible_to_role"] = target
        else:
            # personal/company never carry a role target.
            out["visible_to_role"] = None

    if "recurrence" in data:
        recurrence = (data.get("recurrence") or "none").strip() or "none"
        if recurrence not in VALID_RECURRENCES:
            raise ValueError("recurrence must be none, daily, weekly or monthly")
        out["recurrence"] = recurrence
        if recurrence == "none":
            # A one-off carries no end-of-series date.
            out["recurrence_until"] = None

    if "recurrenceUntil" in data:
        until = (data.get("recurrenceUntil") or "").strip()
        if until and not is_valid_date(until):
            raise ValueError("recurrenceUntil must be a real YYYY-MM-DD date")
        # A non-recurring event never keeps an until date, whatever was sent.
        if out.get("recurrence", data.get("recurrence")) == "none":
            out["recurrence_until"] = None
        else:
            out["recurrence_until"] = until or None

    if "reminderMinutes" in data:
        raw = data.get("reminderMinutes") or 0
        try:
            minutes = int(raw)
        except (TypeError, ValueError):
            raise ValueError("reminderMinutes must be a whole number of minutes")
        if minutes not in ALLOWED_REMINDERS:
            allowed = ", ".join(str(m) for m in ALLOWED_REMINDERS)
            raise ValueError(f"reminderMinutes must be one of: {allowed}")
        out["reminder_minutes"] = minutes

    return out


def _parse_participant_ids(data):
    """The `participantEmployeeIds` list normalised to a de-duped list of ints,
    validated to real employees. Absent → None (leave participants untouched)."""
    if "participantEmployeeIds" not in data:
        return None
    raw = data.get("participantEmployeeIds") or []
    if not isinstance(raw, list):
        raise ValueError("participantEmployeeIds must be a list")
    ids = []
    for value in raw:
        try:
            ids.append(int(value))
        except (TypeError, ValueError):
            raise ValueError("participantEmployeeIds must be employee ids")
    ids = list(dict.fromkeys(ids))  # de-dupe, keep order
    if ids:
        found = {e.id for e in Employee.query.filter(Employee.id.in_(ids)).all()}
        missing = [i for i in ids if i not in found]
        if missing:
            raise ValueError(f"unknown employee id(s): {', '.join(map(str, missing))}")
    return ids


def _sync_participants(event, employee_ids, actor_uid):
    """Replace the event's participant set and invite the newly added ones.

    Returns the list of employee_ids that were added (so the caller can notify).
    A no-op when employee_ids is None (field absent from the payload)."""
    if employee_ids is None:
        return []
    current = {p.employee_id for p in event.participants}
    wanted = set(employee_ids)

    for participant in list(event.participants):
        if participant.employee_id not in wanted:
            event.participants.remove(participant)
    added = wanted - current
    for emp_id in employee_ids:
        if emp_id in added:
            event.participants.append(CalendarEventParticipant(employee_id=emp_id))
    return [e for e in employee_ids if e in added]


def _invite_participants(event, added_employee_ids, actor_uid):
    """Send an `event_invite` to each newly added participant's linked user,
    skipping the actor themself. Best-effort — never blocks the write."""
    if not added_employee_ids:
        return
    from notification_utils import notify_users
    users = User.query.filter(
        User.employee_id.in_(added_employee_ids), User.is_active == True
    ).all()
    recipient_ids = [u.id for u in users if u.id != actor_uid]
    if not recipient_ids:
        return
    when = event.event_date + ("" if event.all_day else f" at {event.start_time}")
    notify_users(
        recipient_ids, "event_invite", "info",
        f"You were added to: {event.title}",
        f"{event.title} — {when}",
        entity_type="calendar_event", entity_id=event.id, dedup=False,
    )


@calendar_event_bp.route("", methods=["GET"])
@require_role(*ALL_ROLES)
def list_events():
    """Events visible to the caller in [start, end]."""
    start = request.args.get("start", "")
    end = request.args.get("end", "")
    if not is_valid_date(start) or not is_valid_date(end):
        return jsonify({"error": "start and end must be valid YYYY-MM-DD dates"}), 400
    if end < start:
        return jsonify({"error": "end must not be before start"}), 400

    uid, role = get_request_user_id(), get_request_role()
    events = (
        CalendarEvent.query
        .filter(CalendarEvent.event_date >= start, CalendarEvent.event_date <= end,
                visible_events_filter(uid, role, _caller_employee_id()))
        .options(event_list_options())
        .order_by(CalendarEvent.event_date.asc(), CalendarEvent.start_time.asc())
        .all()
    )
    return jsonify([e.to_dict() for e in events])


@calendar_event_bp.route("", methods=["POST"])
@require_role(*ALL_ROLES)
def create_event():
    data = request.get_json() or {}
    role = get_request_role()

    # Default an unspecified scope to personal so a missing field cannot silently
    # broadcast; require the fields that have no sensible default.
    data.setdefault("visibility", "personal")
    if "title" not in data or "eventDate" not in data:
        return jsonify({"error": "title and eventDate are required"}), 400

    try:
        fields = _parse_body(data, role)
        participant_ids = _parse_participant_ids(data)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    now = datetime.now().isoformat(timespec="seconds")
    actor_uid = get_request_user_id()
    event = CalendarEvent(
        owner_user_id=actor_uid,
        owner_name=get_request_user_name(),
        created_at=now,
        updated_at=now,
        all_day=fields.get("all_day", True),
        visibility=fields.get("visibility", "personal"),
        **{k: v for k, v in fields.items() if k not in ("all_day", "visibility")},
    )
    db.session.add(event)
    db.session.flush()  # assign event.id before attaching participants
    added = _sync_participants(event, participant_ids, actor_uid)
    db.session.commit()
    _invite_participants(event, added, actor_uid)
    return jsonify(event.to_dict()), 201


def _load_owned_or_admin(event_id):
    """Return (event, None) when the caller may modify it, else (None, response)."""
    event = CalendarEvent.query.get(event_id)
    if not event:
        return None, (jsonify({"error": "Event not found"}), 404)
    uid, role = get_request_user_id(), get_request_role()
    if event.owner_user_id != uid and role != "admin":
        return None, (jsonify({"error": "Only the owner or an admin may change this event"}), 403)
    return event, None


@calendar_event_bp.route("/<int:event_id>", methods=["PATCH"])
@require_role(*ALL_ROLES)
def update_event(event_id):
    event, err = _load_owned_or_admin(event_id)
    if err:
        return err

    data = request.get_json() or {}
    try:
        fields = _parse_body(data, get_request_role())
        participant_ids = _parse_participant_ids(data)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    for key, value in fields.items():
        setattr(event, key, value)
    actor_uid = get_request_user_id()
    added = _sync_participants(event, participant_ids, actor_uid)
    event.updated_at = datetime.now().isoformat(timespec="seconds")
    db.session.commit()
    _invite_participants(event, added, actor_uid)
    return jsonify(event.to_dict())


@calendar_event_bp.route("/<int:event_id>", methods=["DELETE"])
@require_role(*ALL_ROLES)
def delete_event(event_id):
    event, err = _load_owned_or_admin(event_id)
    if err:
        return err
    db.session.delete(event)
    db.session.commit()
    return jsonify({"message": "Event deleted"})


# ── ICS export ───────────────────────────────────────────────────────────────
#
# The same events the calendar shows, as an .ics file the user can import into
# Google Calendar or Outlook. Read-only and one-way: an export is a snapshot, not
# a live subscription, so nothing here changes when the source event does.

def _ics_escape(text):
    """Escape a value for an iCalendar TEXT field (RFC 5545 §3.3.11)."""
    return (
        (text or "")
        .replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\r\n", "\\n")
        .replace("\n", "\\n")
    )


def _ics_fold(line):
    """Fold a content line to ≤75 octets with CRLF + space continuations."""
    encoded = line.encode("utf-8")
    if len(encoded) <= 75:
        return line
    chunks, start = [], 0
    # 75 octets on the first line, 74 on continuations (the leading space counts).
    limit = 75
    while start < len(encoded):
        chunk = encoded[start:start + limit]
        chunks.append(chunk.decode("utf-8", "ignore"))
        start += limit
        limit = 74
    return "\r\n ".join(chunks)


def _event_to_vevent(event, dtstamp):
    lines = [
        "BEGIN:VEVENT",
        f"UID:calendar-event-{event.id}@ems-workflow-system",
        f"DTSTAMP:{dtstamp}",
    ]
    compact = event.event_date.replace("-", "")
    if event.all_day or not event.start_time:
        # DTEND is exclusive for an all-day event: the day after.
        end_day = (datetime.strptime(event.event_date, "%Y-%m-%d") + timedelta(days=1)).strftime("%Y%m%d")
        lines.append(f"DTSTART;VALUE=DATE:{compact}")
        lines.append(f"DTEND;VALUE=DATE:{end_day}")
    else:
        # Floating local time — the app does not track a zone per event.
        lines.append(f"DTSTART:{compact}T{event.start_time.replace(':', '')}00")
        if event.end_time:
            lines.append(f"DTEND:{compact}T{event.end_time.replace(':', '')}00")

    # A recurring event is exported as a rule, not expanded — that is what lets a
    # calendar app keep it as one repeating entry the user can later edit.
    if event.recurrence and event.recurrence != "none":
        freq = {"daily": "DAILY", "weekly": "WEEKLY", "monthly": "MONTHLY"}[event.recurrence]
        rule = f"RRULE:FREQ={freq}"
        if event.recurrence_until:
            until = event.recurrence_until.replace("-", "")
            # UNTIL matches DTSTART's value type: DATE for all-day, UTC DATE-TIME otherwise.
            rule += f";UNTIL={until}" if (event.all_day or not event.start_time) else f";UNTIL={until}T235959Z"
        lines.append(rule)

    lines.append(f"SUMMARY:{_ics_escape(event.title)}")
    if event.description:
        lines.append(f"DESCRIPTION:{_ics_escape(event.description)}")
    if event.category:
        lines.append(f"CATEGORIES:{_ics_escape(event.category.upper())}")
    lines.append("END:VEVENT")
    return [_ics_fold(l) for l in lines]


@calendar_event_bp.route("/export.ics", methods=["GET"])
@require_role(*ALL_ROLES)
def export_ics():
    """The caller's visible events in [start, end] as an iCalendar file."""
    start = request.args.get("start", "")
    end = request.args.get("end", "")
    if not is_valid_date(start) or not is_valid_date(end):
        return jsonify({"error": "start and end must be valid YYYY-MM-DD dates"}), 400
    if end < start:
        return jsonify({"error": "end must not be before start"}), 400

    uid, role = get_request_user_id(), get_request_role()
    events = (
        CalendarEvent.query
        .filter(CalendarEvent.event_date >= start, CalendarEvent.event_date <= end,
                visible_events_filter(uid, role, _caller_employee_id()))
        .order_by(CalendarEvent.event_date.asc(), CalendarEvent.start_time.asc())
        .all()
    )

    dtstamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//EMS Workflow System//Calendar//EN",
        "CALSCALE:GREGORIAN",
    ]
    for event in events:
        lines.extend(_event_to_vevent(event, dtstamp))
    lines.append("END:VCALENDAR")

    body = "\r\n".join(lines) + "\r\n"
    return Response(
        body,
        mimetype="text/calendar",
        headers={"Content-Disposition": f"attachment; filename=ems-calendar_{start}_{end}.ics"},
    )
