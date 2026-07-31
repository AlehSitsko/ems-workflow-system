from flask import Blueprint, jsonify, request
from models import User
from settings_utils import load_user_settings, save_user_settings, DEFAULT_SETTINGS
from utils.auth_utils import get_request_user_id

settings_bp = Blueprint("settings", __name__, url_prefix="/api/settings")


def _get_user(_req=None):
    """The signed-in user, or None. Settings are per-user, so reading the id
    from the session is also what stops one user editing another's."""
    uid = get_request_user_id()
    return User.query.get(uid) if uid else None


@settings_bp.route("", methods=["GET"])
def get_settings():
    user = _get_user(request)
    if not user:
        return jsonify(DEFAULT_SETTINGS)
    return jsonify(load_user_settings(user))


@settings_bp.route("", methods=["PATCH"])
def patch_settings():
    user = _get_user(request)
    if not user:
        return jsonify({"error": "user not found"}), 404
    patch = request.get_json() or {}

    time_format = (patch.get("ui") or {}).get("time_format")
    if time_format is not None and time_format not in ("12h", "24h"):
        return jsonify({"error": "ui.time_format must be '12h' or '24h'"}), 400

    dispatch = patch.get("dispatch") or {}
    for key, max_value in (("pickup_late_after", 120), ("stuck_after", 240)):
        if key in dispatch:
            try:
                n = int(dispatch[key])
            except (TypeError, ValueError):
                return jsonify({"error": f"dispatch.{key} must be an integer"}), 400
            if not (0 <= n <= max_value):
                return jsonify({"error": f"dispatch.{key} must be between 0 and {max_value}"}), 400

    dashboard = patch.get("dashboard")
    if dashboard is not None:
        if not isinstance(dashboard, dict):
            return jsonify({"error": "dashboard must be an object"}), 400

        quick_links = dashboard.get("quickLinks", "unset")
        if quick_links != "unset" and quick_links is not None:
            if not isinstance(quick_links, list) or not all(isinstance(p, str) for p in quick_links):
                return jsonify({"error": "dashboard.quickLinks must be null or a list of paths"}), 400
            if len(quick_links) > 12:
                return jsonify({"error": "dashboard.quickLinks may hold at most 12 links"}), 400

        hidden = dashboard.get("hiddenWidgets")
        if hidden is not None:
            allowed = {"todayBoard", "tasks", "quickLinks"}
            if not isinstance(hidden, list) or not set(hidden) <= allowed:
                return jsonify({"error": "dashboard.hiddenWidgets must be a subset of "
                                         "todayBoard, tasks, quickLinks"}), 400

    calendar = patch.get("calendar")
    if isinstance(calendar, dict) and "savedViews" in calendar:
        views = calendar.get("savedViews")
        if not isinstance(views, list):
            return jsonify({"error": "calendar.savedViews must be a list"}), 400
        if len(views) > 20:
            return jsonify({"error": "calendar.savedViews may hold at most 20 views"}), 400
        for v in views:
            name = v.get("name") if isinstance(v, dict) else None
            if not isinstance(name, str) or not name.strip() or len(name) > 60:
                return jsonify({"error": "each saved view needs a name of 1–60 characters"}), 400

    merged = save_user_settings(user, patch)
    return jsonify(merged)
