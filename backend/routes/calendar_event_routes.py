"""Manually created calendar events, with personal / role / company visibility.

Separate from the calendar aggregator (which only *reads* derived events): this
owns the CRUD for the one kind of calendar entry a user creates by hand. The
aggregator reuses `visible_events_filter` so a manual event shows up alongside
calls and shifts, filtered by exactly the same rule enforced here.
"""

from datetime import datetime, timedelta, timezone

from flask import Blueprint, jsonify, request, Response

from models import db, CalendarEvent
from utils.auth_utils import (
    require_role, get_request_role, get_request_user_id, get_request_user_name,
    ALL_ROLES,
)
from utils.validation_utils import is_valid_date, check_length


calendar_event_bp = Blueprint("calendar_event", __name__, url_prefix="/api/calendar-events")

# Broadcasting an event to a whole role or the whole company is a supervisory
# act; keeping a personal one is not.
_BROADCAST_ROLES = ("admin", "supervisor")
_MAX_RANGE_DAYS = 93


def visible_events_filter(user_id, role):
    """A SQLAlchemy predicate: the calendar events this caller may see.

    company — everyone; personal — only the owner; role — only holders of the
    named role. Shared with the calendar aggregator so both agree.
    """
    return db.or_(
        CalendarEvent.visibility == "company",
        db.and_(CalendarEvent.visibility == "personal", CalendarEvent.owner_user_id == user_id),
        db.and_(CalendarEvent.visibility == "role", CalendarEvent.visible_to_role == role),
    )


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

    return out


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
                visible_events_filter(uid, role))
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
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    now = datetime.now().isoformat(timespec="seconds")
    event = CalendarEvent(
        owner_user_id=get_request_user_id(),
        owner_name=get_request_user_name(),
        created_at=now,
        updated_at=now,
        all_day=fields.get("all_day", True),
        visibility=fields.get("visibility", "personal"),
        **{k: v for k, v in fields.items() if k not in ("all_day", "visibility")},
    )
    db.session.add(event)
    db.session.commit()
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

    try:
        fields = _parse_body(request.get_json() or {}, get_request_role())
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    for key, value in fields.items():
        setattr(event, key, value)
    event.updated_at = datetime.now().isoformat(timespec="seconds")
    db.session.commit()
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
                visible_events_filter(uid, role))
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
