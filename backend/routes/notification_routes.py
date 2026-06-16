import json

from flask import Blueprint, jsonify, request

from models import db, User, UserNotification, NotificationEvent, UserNotificationPrefs
from notification_utils import ROLE_EVENT_TYPES, run_temporal_checks

notif_bp = Blueprint("notifications", __name__, url_prefix="/api/notifications")

NOTIFICATION_LABELS = {
    "call_unassigned_soon": "Unassigned call soon",
    "call_new_today":       "New call today",
    "call_als_on_bls":      "ALS on BLS unit",
    "unit_stuck_status":    "Unit stuck in status",
    "unit_understaffed":    "Unit understaffed",
    "cert_expiring":        "Certificate expiring",
    "employee_added":       "New employee added",
}


def _get_user(user_id):
    try:
        return User.query.get(int(user_id))
    except (TypeError, ValueError):
        return None


def _get_prefs_dict(user_id):
    prefs = UserNotificationPrefs.query.get(user_id)
    if not prefs or not prefs.prefs_json:
        return {}
    try:
        return json.loads(prefs.prefs_json)
    except Exception:
        return {}


@notif_bp.route("", methods=["GET"])
def get_notifications():
    user_id = request.args.get("user_id")
    since = request.args.get("since")

    user = _get_user(user_id)
    if not user:
        return jsonify({"error": "user_id required"}), 400

    # Run temporal checks on every poll.
    try:
        run_temporal_checks()
    except Exception as e:
        import sys
        print(f"[WARN] temporal check error: {e}", file=sys.stderr)

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
    user_id = data.get("user_id")
    notification_id = data.get("notification_id")

    un = UserNotification.query.filter_by(id=notification_id, user_id=user_id).first()
    if not un:
        return jsonify({"error": "Not found"}), 404

    un.is_read = True
    db.session.commit()
    return jsonify({"ok": True})


@notif_bp.route("/read-all", methods=["POST"])
def mark_all_read():
    data = request.get_json() or {}
    user_id = data.get("user_id")
    if not user_id:
        return jsonify({"error": "user_id required"}), 400

    UserNotification.query.filter_by(user_id=user_id, is_read=False).update({"is_read": True})
    db.session.commit()
    return jsonify({"ok": True})


@notif_bp.route("/prefs", methods=["GET"])
def get_prefs():
    user_id = request.args.get("user_id")
    user = _get_user(user_id)
    if not user:
        return jsonify({"error": "user_id required"}), 400

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
    user_id = data.get("user_id")
    new_prefs = data.get("prefs", {})

    user = _get_user(user_id)
    if not user:
        return jsonify({"error": "user_id required"}), 400

    allowed_types = ROLE_EVENT_TYPES.get(user.role, set())
    # Only save prefs for allowed types.
    filtered = {k: bool(v) for k, v in new_prefs.items() if k in allowed_types}

    prefs = UserNotificationPrefs.query.get(user.id)
    if not prefs:
        prefs = UserNotificationPrefs(user_id=user.id)
        db.session.add(prefs)
    prefs.prefs_json = json.dumps(filtered)
    db.session.commit()
    return jsonify({"ok": True})
