import json
import logging

from flask import Blueprint, jsonify, request

logger = logging.getLogger(__name__)

from models import db, User, UserNotification, NotificationEvent, UserNotificationPrefs
from notification_utils import ROLE_EVENT_TYPES, NOTIFICATION_LABELS, run_temporal_checks
from utils.auth_utils import get_request_user_id

notif_bp = Blueprint("notifications", __name__, url_prefix="/api/notifications")


def _get_user(user_id):
    try:
        return User.query.get(int(user_id))
    except (TypeError, ValueError):
        return None


def _get_prefs_dict(user_id):
    from settings_utils import load_user_settings
    user = _get_user(user_id)
    if not user:
        return {}
    return load_user_settings(user).get("notifications", {})


@notif_bp.route("", methods=["GET"])
def get_notifications():
    user_id = get_request_user_id()  # from the session, never the client
    since = request.args.get("since")

    if not user_id:
        return jsonify({"error": "user_id required"}), 400
    user = _get_user(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    # Run temporal checks on every poll.
    try:
        run_temporal_checks()
    except Exception:
        # A failed temporal check must not break the notification poll.
        logger.warning("temporal check failed during notification poll", exc_info=True)

    allowed_types = ROLE_EVENT_TYPES.get(user.role, set())
    prefs = _get_prefs_dict(user.id)
    active_types = {t for t in allowed_types if prefs.get(t, True)}

    # Total unread count.
    unread_count = (
        db.session.query(UserNotification)
        .join(NotificationEvent, UserNotification.event_id == NotificationEvent.id)
        .filter(
            UserNotification.user_id == user.id,
            UserNotification.is_read == False,
            NotificationEvent.type.in_(active_types),
        )
        .count()
    ) if active_types else 0

    # Notification list: last 50, optionally filtered by since.
    query = (
        db.session.query(UserNotification, NotificationEvent)
        .join(NotificationEvent, UserNotification.event_id == NotificationEvent.id)
        .filter(
            UserNotification.user_id == user.id,
            NotificationEvent.type.in_(active_types),
        )
    )
    if since:
        query = query.filter(NotificationEvent.created_at >= since)
    else:
        query = query.filter(UserNotification.is_read == False)

    rows = query.order_by(NotificationEvent.created_at.desc()).limit(50).all()

    notifications = []
    for un, event in rows:
        d = event.to_dict()
        d["id"] = un.id
        d["event_id"] = event.id
        d["is_read"] = un.is_read
        d["created_at"] = event.created_at
        notifications.append(d)

    return jsonify({
        "unread_count": unread_count,
        "notifications": notifications,
    })


@notif_bp.route("/read", methods=["POST"])
def mark_read():
    data = request.get_json() or {}
    user_id = get_request_user_id()  # from the session, never the client
    notification_id = data.get("notification_id")

    un = UserNotification.query.filter_by(id=notification_id, user_id=user_id).first()
    if not un:
        return jsonify({"error": "Not found"}), 404

    un.is_read = True
    db.session.commit()
    return jsonify({"ok": True})


@notif_bp.route("/read-all", methods=["POST"])
def mark_all_read():
    user_id = get_request_user_id()  # from the session, never the client
    if not user_id:
        return jsonify({"error": "user_id required"}), 400

    UserNotification.query.filter_by(user_id=user_id, is_read=False).update({"is_read": True})
    db.session.commit()
    return jsonify({"ok": True})


@notif_bp.route("/prefs", methods=["GET"])
def get_prefs():
    user_id = get_request_user_id()  # from the session, never the client
    if not user_id:
        return jsonify({"error": "user_id required"}), 400
    user = _get_user(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    allowed_types = ROLE_EVENT_TYPES.get(user.role, set())
    prefs = _get_prefs_dict(user.id)

    result = {}
    for t in allowed_types:
        result[t] = {
            "enabled": prefs.get(t, True),
            "label": NOTIFICATION_LABELS.get(t, t),
        }
    return jsonify(result)


@notif_bp.route("/prefs", methods=["PUT"])
def update_prefs():
    data = request.get_json() or {}
    user_id = get_request_user_id()  # from the session, never the client
    new_prefs = data.get("prefs", {})

    if not user_id:
        return jsonify({"error": "user_id required"}), 400
    user = _get_user(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    allowed_types = ROLE_EVENT_TYPES.get(user.role, set())
    filtered = {k: bool(v) for k, v in new_prefs.items() if k in allowed_types}

    from settings_utils import save_user_settings
    save_user_settings(user, {"notifications": filtered})
    return jsonify({"ok": True})


@notif_bp.route("/vapid-public-key", methods=["GET"])
def vapid_public_key():
    # Public by design (the allowlist entry `notif.vapid_public_key` matches this
    # function name). Derived from the private key (or the env override) so the key
    # the browser subscribes with always matches the key the server signs with.
    from push_utils import get_vapid_public_key
    return jsonify({"publicKey": get_vapid_public_key()})


@notif_bp.route("/push-subscribe", methods=["POST"])
def push_subscribe():
    data = request.get_json() or {}
    user_id = get_request_user_id()  # from the session, never the client
    subscription = data.get("subscription")
    if not user_id or not subscription:
        return jsonify({"error": "user_id and subscription required"}), 400

    prefs = UserNotificationPrefs.query.get(user_id)
    if not prefs:
        prefs = UserNotificationPrefs(user_id=user_id)
        db.session.add(prefs)
    prefs.push_sub_json = json.dumps(subscription)
    db.session.commit()
    return jsonify({"ok": True})


@notif_bp.route("/push-unsubscribe", methods=["POST"])
def push_unsubscribe():
    # No body needed — clears the caller's own subscription (from the session).
    user_id = get_request_user_id()  # from the session, never the client
    if not user_id:
        return jsonify({"error": "user_id required"}), 400

    prefs = UserNotificationPrefs.query.get(user_id)
    if prefs:
        prefs.push_sub_json = None
        db.session.commit()
    return jsonify({"ok": True})


@notif_bp.route("/test-push", methods=["POST"])
def test_push():
    # No body: the target is the caller's own subscription, resolved from the
    # session. (Reading a JSON body here would 415 the bodyless POST the UI sends.)
    user_id = get_request_user_id()  # from the session, never the client
    if not user_id:
        return jsonify({"error": "user_id required"}), 400

    prefs = UserNotificationPrefs.query.get(user_id)
    if not prefs or not prefs.push_sub_json:
        return jsonify({"error": "No active browser notification subscription for this user"}), 400

    from push_utils import send_push
    try:
        ok = send_push(
            prefs.push_sub_json,
            "EMS Workflow",
            "EMS Workflow notifications are working.",
            tag="ems-test",
        )
    except Exception:
        # Subscription expired (410 Gone) or otherwise invalid — clear it.
        prefs.push_sub_json = None
        db.session.commit()
        return jsonify({"error": "Subscription is no longer valid. Please enable notifications again."}), 400

    if not ok:
        return jsonify({"error": "Failed to send test notification"}), 502
    return jsonify({"ok": True})
