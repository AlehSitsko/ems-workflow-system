import json
from datetime import datetime, timedelta

from models import db, User, NotificationEvent, UserNotification, UserNotificationPrefs
from push_utils import send_push

# Which event types each role can receive.
ROLE_EVENT_TYPES = {
    "admin":      {"call_unassigned_soon", "call_new_today", "call_als_on_bls",
                   "unit_stuck_status", "unit_understaffed", "cert_expiring", "employee_added"},
    "supervisor": {"call_unassigned_soon", "call_new_today", "call_als_on_bls",
                   "unit_stuck_status", "unit_understaffed", "cert_expiring"},
    "dispatcher": {"call_unassigned_soon", "call_new_today", "call_als_on_bls", "unit_stuck_status"},
    "hr":         {"cert_expiring", "employee_added"},
}

# Roles that receive each event type.
EVENT_TARGET_ROLES = {
    "call_unassigned_soon": ["admin", "supervisor", "dispatcher"],
    "call_new_today":       ["admin", "supervisor", "dispatcher"],
    "call_als_on_bls":      ["admin", "supervisor", "dispatcher"],
    "unit_stuck_status":    ["admin", "supervisor", "dispatcher"],
    "unit_understaffed":    ["admin", "supervisor"],
    "cert_expiring":        ["admin", "supervisor", "hr"],
    "employee_added":       ["admin", "hr"],
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


def run_temporal_checks():
    """Generate time-based notifications. Called on each polling request."""
    today = datetime.now().strftime("%Y-%m-%d")
    now_dt = datetime.now()

    # Import here to avoid circular imports at module level.
    from models import Call, Employee

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
