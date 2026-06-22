from flask import Blueprint, jsonify, request
from models import db, User
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
    merged = save_user_settings(user, patch)
    return jsonify(merged)
