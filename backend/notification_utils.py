import json
import time as _time
from datetime import datetime, timedelta

from models import db, User, NotificationEvent, UserNotification, UserNotificationPrefs
from push_utils import send_push

# Throttle for run_temporal_checks(): every GET /api/notifications poll calls it,
# and under concurrent polling (multiple users/tabs) that means many simultaneous
# requests each re-scanning all calls/employees/documents for the same instant in
# time. Skipping re-checks within this window avoids redundant duplicate work
# without meaningfully delaying alert freshness (client polls every 10s anyway).
_TEMPORAL_CHECK_MIN_INTERVAL_S = 5
_last_temporal_check_at = 0.0

# Calendar invites and reminders are directed at named participants (not a role
# broadcast), so every role that can hold a calendar event may receive them.
_CALENDAR_TYPES = {"event_invite", "event_reminder"}

# Which event types each role can receive.
ROLE_EVENT_TYPES = {
    "admin":      {"call_unassigned_soon", "call_new_today", "call_als_on_bls",
                   "unit_stuck_status", "unit_understaffed", "cert_expiring", "employee_added",
                   "doc_expiring", "cert_no_scan",
                   "unit_shift_near_end", "unit_shift_overdue", "task_assigned"} | _CALENDAR_TYPES,
    "supervisor": {"call_unassigned_soon", "call_new_today", "call_als_on_bls",
                   "unit_stuck_status", "unit_understaffed", "cert_expiring", "doc_expiring",
                   "cert_no_scan", "unit_shift_near_end", "unit_shift_overdue", "task_assigned"} | _CALENDAR_TYPES,
    "dispatcher": {"call_unassigned_soon", "call_new_today", "call_als_on_bls", "unit_stuck_status",
                   "unit_shift_near_end", "unit_shift_overdue", "task_assigned"} | _CALENDAR_TYPES,
    "hr":         {"cert_expiring", "employee_added", "doc_expiring", "cert_no_scan",
                   "task_assigned"} | _CALENDAR_TYPES,
}

# Human-readable label for each notification type, shown in Notification Settings.
NOTIFICATION_LABELS = {
    "call_new_today":        "New calls today",
    "call_unassigned_soon":  "Unassigned call soon",
    "call_als_on_bls":       "Call assigned to an unsuitable unit",
    "unit_stuck_status":     "Unit status stuck",
    "unit_understaffed":     "Understaffed unit",
    "cert_expiring":         "Certification expiring",
    "employee_added":        "Employee added",
    "doc_expiring":          "Document expiring",
    "cert_no_scan":          "Certification scan missing",
    "unit_shift_near_end":   "Unit shift near end",
    "unit_shift_overdue":    "Unit shift overdue",
    "task_assigned":         "Task assigned to you",
    "event_invite":          "Added to a calendar event",
    "event_reminder":        "Calendar event reminder",
}

# Roles that receive each event type.
EVENT_TARGET_ROLES = {
    "call_unassigned_soon":  ["admin", "supervisor", "dispatcher"],
    "call_new_today":        ["admin", "supervisor", "dispatcher"],
    "call_als_on_bls":       ["admin", "supervisor", "dispatcher"],
    "unit_stuck_status":     ["admin", "supervisor", "dispatcher"],
    "unit_understaffed":     ["admin", "supervisor"],
    "cert_expiring":         ["admin", "supervisor", "hr"],
    "employee_added":        ["admin", "hr"],
    "doc_expiring":          ["admin", "supervisor", "hr"],
    "cert_no_scan":          ["admin", "supervisor", "hr"],
    "unit_shift_near_end":   ["admin", "supervisor", "dispatcher"],
    "unit_shift_overdue":    ["admin", "supervisor", "dispatcher"],
}


def _now_iso():
    return datetime.now().isoformat(timespec="seconds")


def _get_user_prefs(user_id):
    prefs = UserNotificationPrefs.query.get(user_id)
    if not prefs or not prefs.prefs_json:
        return {}
    try:
        return json.loads(prefs.prefs_json)
    except Exception:
        return {}


def _event_exists_recently(event_type, entity_id, minutes=60):
    cutoff = (datetime.now() - timedelta(minutes=minutes)).isoformat(timespec="seconds")
    return db.session.query(NotificationEvent).filter(
        NotificationEvent.type == event_type,
        NotificationEvent.entity_id == entity_id,
        NotificationEvent.created_at >= cutoff,
    ).first() is not None


def create_notification(event_type, severity, title, body, entity_type=None, entity_id=None, dedup_minutes=60):
    """Create a NotificationEvent and UserNotification rows for all eligible users."""
    if entity_id is not None and _event_exists_recently(event_type, entity_id, dedup_minutes):
        return

    event = NotificationEvent(
        type=event_type,
        severity=severity,
        title=title,
        body=body,
        entity_type=entity_type,
        entity_id=entity_id,
        created_at=_now_iso(),
    )
    db.session.add(event)
    db.session.flush()

    target_roles = EVENT_TARGET_ROLES.get(event_type, [])
    users = User.query.filter(User.role.in_(target_roles), User.is_active == True).all()
    push_targets = []  # (user_prefs_row,) for Web Push after commit
    for user in users:
        # Respect per-user preference (default on).
        prefs_data = _get_user_prefs(user.id)
        if not prefs_data.get(event_type, True):
            continue
        db.session.add(UserNotification(
            event_id=event.id,
            user_id=user.id,
            is_read=False,
            created_at=_now_iso(),
        ))
        # Collect push subscription if present.
        prefs_row = UserNotificationPrefs.query.get(user.id)
        if prefs_row and prefs_row.push_sub_json:
            push_targets.append((user.id, prefs_row.push_sub_json))

    db.session.commit()

    # Send Web Push after commit so DB is consistent even if push fails.
    for user_id, sub_json in push_targets:
        try:
            gone = False
            try:
                send_push(sub_json, title, body or "")
            except Exception as e:
                # 410 Gone — subscription expired, clean it up.
                if hasattr(e, "response") and e.response is not None and e.response.status_code == 410:
                    gone = True
            if gone:
                row = UserNotificationPrefs.query.get(user_id)
                if row:
                    row.push_sub_json = None
                    db.session.commit()
        except Exception:
            pass


def notify_user(user_id, event_type, severity, title, body, entity_type=None, entity_id=None, dedup_minutes=1):
    """Create a NotificationEvent + a single UserNotification row for exactly
    one user (e.g. a task assignee), bypassing the role-based broadcast that
    create_notification() does. dedup_minutes defaults low since each call
    here represents a distinct action (e.g. a specific assignment), not a
    recurring background scan."""
    if entity_id is not None and _event_exists_recently(event_type, entity_id, dedup_minutes):
        return

    user = User.query.get(user_id)
    if not user or not user.is_active:
        return
    prefs_data = _get_user_prefs(user.id)
    if not prefs_data.get(event_type, True):
        return

    event = NotificationEvent(
        type=event_type,
        severity=severity,
        title=title,
        body=body,
        entity_type=entity_type,
        entity_id=entity_id,
        created_at=_now_iso(),
    )
    db.session.add(event)
    db.session.flush()
    db.session.add(UserNotification(
        event_id=event.id,
        user_id=user.id,
        is_read=False,
        created_at=_now_iso(),
    ))
    db.session.commit()

    prefs_row = UserNotificationPrefs.query.get(user.id)
    if prefs_row and prefs_row.push_sub_json:
        try:
            send_push(prefs_row.push_sub_json, title, body or "")
        except Exception:
            pass


def notify_users(user_ids, event_type, severity, title, body,
                 entity_type=None, entity_id=None, dedup_minutes=60, dedup=True):
    """One NotificationEvent, fanned out to each listed active user that hasn't
    turned the type off. For *directed* events (a calendar invite, a reminder)
    that reach a specific set of people rather than everyone in a role.

    Unlike calling notify_user() in a loop, this creates a single event so the
    recency dedup does not swallow the second recipient. `dedup=False` skips the
    recency guard entirely — use it for one-shot actions (an invite fires once per
    add) where the entity may already carry an earlier notification of the type."""
    ids = [i for i in dict.fromkeys(user_ids) if i is not None]
    if not ids:
        return
    if dedup and entity_id is not None and _event_exists_recently(event_type, entity_id, dedup_minutes):
        return

    users = User.query.filter(User.id.in_(ids), User.is_active == True).all()
    if not users:
        return

    event = NotificationEvent(
        type=event_type,
        severity=severity,
        title=title,
        body=body,
        entity_type=entity_type,
        entity_id=entity_id,
        created_at=_now_iso(),
    )
    db.session.add(event)
    db.session.flush()

    push_targets = []
    for user in users:
        if not _get_user_prefs(user.id).get(event_type, True):
            continue
        db.session.add(UserNotification(
            event_id=event.id,
            user_id=user.id,
            is_read=False,
            created_at=_now_iso(),
        ))
        prefs_row = UserNotificationPrefs.query.get(user.id)
        if prefs_row and prefs_row.push_sub_json:
            push_targets.append(prefs_row.push_sub_json)

    db.session.commit()

    for sub_json in push_targets:
        try:
            send_push(sub_json, title, body or "")
        except Exception:
            pass


def run_temporal_checks():
    """Generate time-based notifications. Called on each polling request.

    Throttled: skips re-scanning calls/employees/documents if it already ran
    within the last _TEMPORAL_CHECK_MIN_INTERVAL_S seconds, since concurrent
    pollers would otherwise all trigger the same expensive scan at once.
    """
    global _last_temporal_check_at
    now_monotonic = _time.monotonic()
    if now_monotonic - _last_temporal_check_at < _TEMPORAL_CHECK_MIN_INTERVAL_S:
        return
    _last_temporal_check_at = now_monotonic

    today = datetime.now().strftime("%Y-%m-%d")
    now_dt = datetime.now()

    # Import here to avoid circular imports at module level.
    from models import Call, Employee, EmployeeDocument

    # call_unassigned_soon: unassigned calls with pickup < 30 min away.
    calls_today = Call.query.filter(
        Call.trip_date == today,
        Call.status == "new",
    ).all()
    for call in calls_today:
        if not call.pickup_time:
            continue
        try:
            parts = call.pickup_time.split(":")
            pickup_dt = now_dt.replace(hour=int(parts[0]), minute=int(parts[1]), second=0, microsecond=0)
            diff_min = (pickup_dt - now_dt).total_seconds() / 60
            if 0 < diff_min <= 30:
                create_notification(
                    "call_unassigned_soon", "warning",
                    f"Unassigned call in {int(diff_min)} min",
                    f"Call #{call.id} — {call.pickup_address or '?'} → {call.dropoff_address or '?'}",
                    entity_type="call", entity_id=call.id, dedup_minutes=25,
                )
        except Exception:
            pass

    # cert_expiring: check employee certifications.
    cert_fields = [
        (1, "cpr_has_license",       "cpr_expiration_date",       "CPR"),
        (2, "evoc_has_license",      "evoc_expiration_date",      "EVOC"),
        (3, "emt_has_license",       "emt_expiration_date",       "EMT"),
        (4, "paramedic_has_license", "paramedic_expiration_date", "Paramedic"),
    ]
    thresholds = {90, 60, 30, 14, 7, 0}
    employees = Employee.query.filter(Employee.is_active == True).all()
    for emp in employees:
        for cert_idx, has_field, exp_field, cert_name in cert_fields:
            if not getattr(emp, has_field, False):
                continue
            exp_date_str = getattr(emp, exp_field, None)
            if not exp_date_str:
                continue
            try:
                exp_dt = datetime.strptime(exp_date_str, "%Y-%m-%d")
                days_left = (exp_dt.date() - now_dt.date()).days
                if days_left > 0 and days_left not in thresholds:
                    continue
                if days_left < 0:
                    continue
                severity = "critical" if days_left <= 14 else "warning"
                composite_id = emp.id * 10 + cert_idx
                label = "expired" if days_left == 0 else f"expiring in {days_left} days"
                create_notification(
                    "cert_expiring", severity,
                    f"{emp.first_name} {emp.last_name} — {cert_name} {label}",
                    f"Certificate expires: {exp_date_str}",
                    entity_type="employee", entity_id=composite_id, dedup_minutes=23 * 60,
                )
            except Exception:
                pass

    # cert_no_scan: active employees with cert checked but no matching EmployeeDocument file.
    # Mapping: (has_field, doc_type, cert_label, cert_idx)
    CERT_DOC_MAP = [
        ("cpr_has_license",       "cpr_cert",  "CPR",       1),
        ("evoc_has_license",      "evoc_cert", "EVOC",      2),
        ("emt_has_license",       "emt_cert",  "EMT",       3),
        ("paramedic_has_license", "als_cert",  "Paramedic", 4),
    ]
    # Build a set of (employee_id, doc_type) that have an uploaded file
    from models import EmployeeDocument as ED
    docs_with_file = db.session.query(ED.employee_id, ED.doc_type).filter(
        ED.file_path.isnot(None)
    ).all()
    scans_index = {(r[0], r[1]) for r in docs_with_file}

    for emp in employees:
        for has_field, doc_type, cert_label, cert_idx in CERT_DOC_MAP:
            if not getattr(emp, has_field, False):
                continue
            if (emp.id, doc_type) in scans_index:
                continue
            composite_id = emp.id * 100 + cert_idx
            create_notification(
                "cert_no_scan", "warning",
                f"{emp.first_name} {emp.last_name} — {cert_label} scan missing",
                f"{cert_label} certification is recorded but no scan/photo has been uploaded.",
                entity_type="employee", entity_id=composite_id, dedup_minutes=23 * 60,
            )

    # unit_shift_near_end / unit_shift_overdue: check shift timing alerts.
    from models import DailyCrewUnit
    from routes.crew_routes import _compute_shift_alerts
    day_units = DailyCrewUnit.query.filter_by(shift_date=today).all()
    for unit in day_units:
        alert = _compute_shift_alerts(unit, now_dt)
        if not alert:
            continue
        if alert["alertType"] == "near_end":
            create_notification(
                "unit_shift_near_end", alert["severity"],
                f"Unit {unit.truck_number} ending soon",
                f"Planned end {alert['plannedEndTime']} — {alert['minutesLeft']} min remaining.",
                entity_type="unit", entity_id=unit.id, dedup_minutes=25,
            )
        else:
            create_notification(
                "unit_shift_overdue", alert["severity"],
                f"Unit {unit.truck_number} overdue",
                f"Planned end was {alert['plannedEndTime']} — {alert['delayMinutes']} min ago.",
                entity_type="unit", entity_id=unit.id, dedup_minutes=55,
            )

    # doc_expiring: check HR documents with expiry_date set.
    doc_thresholds = {90, 60, 30, 14, 7}
    docs = EmployeeDocument.query.filter(EmployeeDocument.expiry_date != None).all()
    for doc in docs:
        try:
            exp_dt = datetime.strptime(doc.expiry_date, "%Y-%m-%d")
            days_left = (exp_dt.date() - now_dt.date()).days
            if days_left < 0:
                continue
            # Fire at threshold milestones; also fire daily once inside 7 days.
            if days_left > 7 and days_left not in doc_thresholds:
                continue
            severity = "critical" if days_left <= 14 else "warning"
            label = f"expiring in {days_left} days" if days_left > 0 else "expired today"
            emp = doc.employee
            emp_name = f"{emp.first_name} {emp.last_name}" if emp else f"Employee #{doc.employee_id}"
            create_notification(
                "doc_expiring", severity,
                f"{emp_name} — {doc.title} {label}",
                f"Document type: {doc.doc_type}. Expires: {doc.expiry_date}",
                entity_type="employee_document", entity_id=doc.id, dedup_minutes=23 * 60,
            )
        except Exception:
            pass

    # event_reminder: manual calendar events whose lead time has just been crossed.
    # Fires to the owner + each participant's linked user. The anchor is the start
    # time (or the start of the day for an all-day event); a recurring event uses
    # its nearest occurrence in a small look-ahead window (a lead can point at
    # tomorrow). Dedup keeps a single occurrence from re-firing across polls.
    from models import CalendarEvent, User as _User
    from utils.event_recurrence import occurrences_in
    win_start = now_dt.date()
    win_end = win_start + timedelta(days=2)
    reminder_events = CalendarEvent.query.filter(CalendarEvent.reminder_minutes > 0).all()
    for ev in reminder_events:
        lead = ev.reminder_minutes
        for occ in occurrences_in(ev.event_date, ev.recurrence, ev.recurrence_until, win_start, win_end):
            try:
                occ_dt = datetime.strptime(occ, "%Y-%m-%d")
            except Exception:
                continue
            if ev.all_day or not ev.start_time:
                anchor = occ_dt.replace(hour=0, minute=0)
            else:
                try:
                    h, m = ev.start_time.split(":")
                    anchor = occ_dt.replace(hour=int(h), minute=int(m))
                except Exception:
                    continue
            trigger = anchor - timedelta(minutes=lead)
            if not (trigger <= now_dt < anchor):
                continue
            recipient_ids = {ev.owner_user_id}
            part_emp_ids = [p.employee_id for p in ev.participants]
            if part_emp_ids:
                linked = _User.query.filter(
                    _User.employee_id.in_(part_emp_ids), _User.is_active == True
                ).all()
                recipient_ids.update(u.id for u in linked)
            when = "today" if (ev.all_day or not ev.start_time) else f"at {ev.start_time}"
            notify_users(
                list(recipient_ids), "event_reminder", "info",
                f"Reminder: {ev.title}",
                f"{ev.title} — {occ} {when}",
                entity_type="calendar_event", entity_id=ev.id,
                dedup_minutes=max(lead + 5, 60),
            )
            break  # the nearest upcoming occurrence is enough for one scan
