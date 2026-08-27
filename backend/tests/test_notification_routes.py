"""Backend tests for the notification HTTP surface (routes/notification_routes.py)
and the push seam (push_utils via the route).

Covers: the unread list (role-filtered), mark-read / mark-all-read, per-user
isolation (you cannot mark another user's notification read), preferences get/put,
the public VAPID key, and the Web Push subscribe / unsubscribe / test-push flow —
including that a push-provider failure returns a clean error and clears an expired
subscription, never a 500 that breaks the caller.

Run: pytest backend/tests/test_notification_routes.py -v
"""

from models import db, UserNotification, UserNotificationPrefs
from notification_utils import notify_user


# call_new_today is in admin's ROLE_EVENT_TYPES and enabled by default, so a seeded one shows.
def _seed(user_id, event_type="call_new_today", entity_id=None):
    notify_user(user_id, event_type, "info", "Title", "Body", entity_id=entity_id)
    db.session.commit()


# ── list + unread ─────────────────────────────────────────────────────────────

def test_anonymous_is_unauthorized(anon, app):
    assert anon.get("/api/notifications").status_code == 401


def test_list_returns_unread_and_notifications(users, clients, app):
    _seed(users["admin"].id, entity_id=1)
    body = clients["admin"].get("/api/notifications").get_json()
    assert body["unread_count"] == 1
    assert len(body["notifications"]) == 1
    assert body["notifications"][0]["is_read"] is False


def test_role_filtering_hides_types_the_role_cannot_receive(users, clients, app):
    # "employee_added" is NOT in the dispatcher role's allowed types -> hidden.
    _seed(users["dispatcher"].id, event_type="employee_added", entity_id=2)
    body = clients["dispatcher"].get("/api/notifications").get_json()
    assert body["unread_count"] == 0 and body["notifications"] == []


# ── mark read ─────────────────────────────────────────────────────────────────

def test_mark_read(users, clients, app):
    _seed(users["admin"].id, entity_id=3)
    nid = UserNotification.query.filter_by(user_id=users["admin"].id).first().id
    assert clients["admin"].post("/api/notifications/read", json={"notification_id": nid}).status_code == 200
    assert UserNotification.query.get(nid).is_read is True


def test_cannot_mark_another_users_notification_read(users, clients, app):
    # A notification that belongs to the HR user...
    _seed(users["hr"].id, event_type="employee_added", entity_id=4)
    other_nid = UserNotification.query.filter_by(user_id=users["hr"].id).first().id
    # ...cannot be marked read by admin (filter_by user_id -> 404, not a cross-user write).
    assert clients["admin"].post("/api/notifications/read", json={"notification_id": other_nid}).status_code == 404
    assert UserNotification.query.get(other_nid).is_read is False


def test_mark_all_read(users, clients, app):
    for i in range(3):
        _seed(users["admin"].id, entity_id=100 + i)
    assert clients["admin"].post("/api/notifications/read-all").status_code == 200
    remaining = UserNotification.query.filter_by(user_id=users["admin"].id, is_read=False).count()
    assert remaining == 0


# ── preferences ───────────────────────────────────────────────────────────────

def test_prefs_get_lists_role_types_enabled_by_default(users, clients, app):
    prefs = clients["hr"].get("/api/notifications/prefs").get_json()
    assert "cert_expiring" in prefs and prefs["cert_expiring"]["enabled"] is True


def test_prefs_put_persists_and_filters_out_unknown_types(users, clients, app):
    api = clients["admin"]
    r = api.put("/api/notifications/prefs",
                json={"prefs": {"call_new_today": False, "not_a_real_type": True}})
    assert r.status_code == 200
    got = api.get("/api/notifications/prefs").get_json()
    assert got["call_new_today"]["enabled"] is False
    assert "not_a_real_type" not in got  # unknown type dropped


# (The public /vapid-public-key endpoint + key derivation are covered by
#  test_push_vapid.py, so they are not re-tested here.)

# ── push subscribe / unsubscribe ─────────────────────────────────────────────

def test_push_subscribe_requires_subscription(clients, app):
    assert clients["admin"].post("/api/notifications/push-subscribe", json={}).status_code == 400


def test_push_subscribe_then_unsubscribe(users, clients, app):
    api = clients["admin"]
    sub = {"endpoint": "https://example.com/ep", "keys": {"p256dh": "x", "auth": "y"}}
    assert api.post("/api/notifications/push-subscribe", json={"subscription": sub}).status_code == 200
    prefs = UserNotificationPrefs.query.get(users["admin"].id)
    assert prefs and prefs.push_sub_json and "example.com" in prefs.push_sub_json

    assert api.post("/api/notifications/push-unsubscribe").status_code == 200
    assert UserNotificationPrefs.query.get(users["admin"].id).push_sub_json is None


# ── test-push: provider outcomes must never 500 ──────────────────────────────

def _subscribe(api, user_id):
    api.post("/api/notifications/push-subscribe",
             json={"subscription": {"endpoint": "https://example.com/ep",
                                    "keys": {"p256dh": "x", "auth": "y"}}})


def test_test_push_without_subscription_is_400(clients, app):
    assert clients["admin"].post("/api/notifications/test-push").status_code == 400


def test_test_push_success(users, clients, app, monkeypatch):
    monkeypatch.setattr("push_utils.send_push", lambda *a, **k: True)
    _subscribe(clients["admin"], users["admin"].id)
    assert clients["admin"].post("/api/notifications/test-push").status_code == 200


def test_test_push_provider_returns_false_is_502_not_500(users, clients, app, monkeypatch):
    monkeypatch.setattr("push_utils.send_push", lambda *a, **k: False)
    _subscribe(clients["admin"], users["admin"].id)
    assert clients["admin"].post("/api/notifications/test-push").status_code == 502


def test_test_push_provider_raises_clears_subscription(users, clients, app, monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("410 Gone")
    monkeypatch.setattr("push_utils.send_push", boom)
    _subscribe(clients["admin"], users["admin"].id)
    # An expired/invalid subscription -> clean 400 + the dead subscription is cleared,
    # never a 500 that would break the caller's workflow.
    assert clients["admin"].post("/api/notifications/test-push").status_code == 400
    assert UserNotificationPrefs.query.get(users["admin"].id).push_sub_json is None
