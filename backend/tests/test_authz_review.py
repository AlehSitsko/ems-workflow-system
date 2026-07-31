"""Authorization-review regression tests.

Two gaps the manual authz pass found:
  1. Crew-preset routes had no role gate — any signed-in role could CRUD them.
  2. The notification blueprint trusted a client-supplied user_id, so one user
     could read or change another user's notifications and preferences (IDOR).
"""

import pytest

from models import db, NotificationEvent, UserNotification


# ── 1. Crew presets are crew-planning only ───────────────────────────────────

@pytest.mark.parametrize("method,path", [
    ("get", "/api/crew-presets"),
    ("post", "/api/crew-presets"),
    ("put", "/api/crew-presets/1"),
    ("delete", "/api/crew-presets/1"),
])
def test_hr_cannot_touch_crew_presets(clients, method, path):
    assert getattr(clients["hr"], method)(path, json={}).status_code == 403


def test_dispatcher_may_read_crew_presets(clients):
    assert clients["dispatcher"].get("/api/crew-presets").status_code == 200


# ── 2. Notifications are scoped to the session user, not a client id ──────────

def _give_notification(user_id, type_="call_new_today"):
    event = NotificationEvent(type=type_, title="Test", created_at="2026-08-01T00:00:00")
    db.session.add(event)
    db.session.flush()
    db.session.add(UserNotification(event_id=event.id, user_id=user_id, is_read=False,
                                    created_at="2026-08-01T00:00:00"))
    db.session.commit()
    return event.id


def test_a_user_cannot_read_another_users_notifications(clients, users):
    # The supervisor has a notification; the dispatcher must not see it even by
    # asking for the supervisor's id.
    _give_notification(users["supervisor"].id)

    hijack = clients["dispatcher"].get(
        f"/api/notifications?user_id={users['supervisor'].id}"
    ).get_json()
    assert hijack["unread_count"] == 0
    assert hijack["notifications"] == []

    # The owner still sees it.
    own = clients["supervisor"].get("/api/notifications").get_json()
    assert own["unread_count"] == 1


def test_a_user_cannot_flip_another_users_prefs(clients, users):
    # Dispatcher tries to disable a supervisor pref by naming the supervisor's id.
    resp = clients["dispatcher"].put("/api/notifications/prefs", json={
        "user_id": users["supervisor"].id,
        "prefs": {"call_new_today": False},
    })
    assert resp.status_code == 200

    # The supervisor's pref is untouched; the dispatcher changed only their own.
    sup = clients["supervisor"].get("/api/notifications/prefs").get_json()
    assert sup["call_new_today"]["enabled"] is True
    disp = clients["dispatcher"].get("/api/notifications/prefs").get_json()
    assert disp["call_new_today"]["enabled"] is False


def test_marking_read_only_affects_my_own(clients, users):
    # A notification belonging to the supervisor cannot be marked read by another
    # user passing its id.
    _give_notification(users["supervisor"].id)
    un_id = UserNotification.query.filter_by(user_id=users["supervisor"].id).first().id

    resp = clients["dispatcher"].post("/api/notifications/read",
                                      json={"user_id": users["supervisor"].id, "notification_id": un_id})
    assert resp.status_code == 404  # not the dispatcher's notification
    assert UserNotification.query.get(un_id).is_read is False
