from flask import Blueprint, jsonify, request
from models import User
from settings_utils import load_user_settings, save_user_settings, DEFAULT_SETTINGS

settings_bp = Blueprint("settings", __name__, url_prefix="/api/settings")


def _get_user(req):
    try:
        uid = int(req.headers.get("X-User-Id", 0))
        return User.query.get(uid) if uid else None
    except (TypeError, ValueError):
        return None


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

    merged = save_user_settings(user, patch)
    return jsonify(merged)
