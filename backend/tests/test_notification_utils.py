"""Backend tests for the notification engine (notification_utils.py).

Covers the two behaviours the HTTP tests don't reach directly: role-targeted
fan-out (create_notification only reaches users whose role is in the event's
target set) and recency de-duplication (a repeat within the window is a no-op).
Plus notify_user for a single recipient.

Run: pytest backend/tests/test_notification_utils.py -v
"""

from models import db, User, NotificationEvent, UserNotification
from notification_utils import create_notification, notify_user
from conftest import make_user


def _users():
    return {r: make_user(r, username=f"nu_{r}") for r in ("admin", "supervisor", "dispatcher", "hr")}


def _recipients_of_last_event():
    ev = NotificationEvent.query.order_by(NotificationEvent.id.desc()).first()
    rows = UserNotification.query.filter_by(event_id=ev.id).all()
    return {User.query.get(un.user_id).role for un in rows}


def test_fan_out_targets_only_the_events_roles(app):
    _users()
    # call_new_today -> admin/supervisor/dispatcher, NOT hr
    create_notification("call_new_today", "info", "New calls", "body", entity_id=1)
    db.session.commit()
    assert _recipients_of_last_event() == {"admin", "supervisor", "dispatcher"}


def test_fan_out_for_an_hr_event(app):
    _users()
    # employee_added -> admin/hr only
    create_notification("employee_added", "info", "New employee", "body", entity_id=2)
    db.session.commit()
    assert _recipients_of_last_event() == {"admin", "hr"}


def test_recency_dedup_suppresses_a_repeat(app):
    _users()
    create_notification("call_new_today", "info", "T", "b", entity_id=5, dedup_minutes=60)
    create_notification("call_new_today", "info", "T", "b", entity_id=5, dedup_minutes=60)
    db.session.commit()
    # only one event for that entity within the window
    assert NotificationEvent.query.filter_by(type="call_new_today", entity_id=5).count() == 1


def test_a_different_entity_is_not_deduped(app):
    _users()
    create_notification("call_new_today", "info", "T", "b", entity_id=10, dedup_minutes=60)
    create_notification("call_new_today", "info", "T", "b", entity_id=11, dedup_minutes=60)
    db.session.commit()
    assert NotificationEvent.query.filter_by(type="call_new_today").count() == 2


def test_notify_user_reaches_exactly_one_user(app):
    users = _users()
    notify_user(users["admin"].id, "task_assigned", "info", "Task", "body", entity_id=99)
    db.session.commit()
    ev = NotificationEvent.query.order_by(NotificationEvent.id.desc()).first()
    rows = UserNotification.query.filter_by(event_id=ev.id).all()
    assert len(rows) == 1 and rows[0].user_id == users["admin"].id


def test_inactive_user_is_excluded_from_fan_out(app):
    from conftest import make_user
    active = make_user("admin", username="nu_active")
    inactive = make_user("admin", username="nu_inactive")
    inactive.is_active = False
    db.session.commit()
    create_notification("call_new_today", "info", "T", "b", entity_id=201)
    db.session.commit()
    ev = NotificationEvent.query.order_by(NotificationEvent.id.desc()).first()
    recipients = {un.user_id for un in UserNotification.query.filter_by(event_id=ev.id)}
    assert active.id in recipients and inactive.id not in recipients


def test_event_with_no_eligible_recipients_creates_no_user_rows(app):
    from conftest import make_user
    make_user("dispatcher", username="nu_disp")  # dispatcher can't receive employee_added
    create_notification("employee_added", "info", "T", "b", entity_id=202)
    db.session.commit()
    ev = NotificationEvent.query.filter_by(type="employee_added", entity_id=202).first()
    assert ev is not None  # the event row is still recorded
    assert UserNotification.query.filter_by(event_id=ev.id).count() == 0
