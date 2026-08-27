"""The signed-in user's own organisation.

`GET /api/tenant/current` is public — the login page uses it to greet the right
workspace by its subdomain before anyone signs in. `GET/PATCH /api/tenant/org` let
an org admin read and edit their *own* organisation's name and light branding
(timezone, logo); the org is taken from the session, never from the client.
"""

import json

from flask import Blueprint, jsonify, request

from models import db, User, Organization
from utils.auth_utils import require_role, get_request_user_id
from utils.tenant_host import resolve_request_org
from utils.validation_utils import check_length


tenant_bp = Blueprint("tenant", __name__, url_prefix="/api/tenant")


@tenant_bp.route("/current", methods=["GET"])
def current_tenant():
    """The workspace for this request's host, for the login screen. Public: it
    reveals only the name and slug of a subdomain that is already public."""
    org = resolve_request_org()
    if org is None:
        return jsonify({"error": "No workspace for this host"}), 404
    return jsonify({"name": org.name, "slug": org.slug})


def _org_payload(org):
    settings = {}
    if org.settings_json:
        try:
            settings = json.loads(org.settings_json)
        except Exception:
            settings = {}
    return {"id": org.id, "name": org.name, "slug": org.slug, "settings": settings}


def _my_org():
    user = User.query.get(get_request_user_id())
    if not user or not user.org_id:
        return None
    return Organization.query.get(user.org_id)


@tenant_bp.route("/org", methods=["GET"])
@require_role("admin")
def get_my_org():
    org = _my_org()
    if org is None:
        return jsonify({"error": "No organisation for this account"}), 404
    return jsonify(_org_payload(org))


@tenant_bp.route("/org", methods=["PATCH"])
@require_role("admin")
def update_my_org():
    org = _my_org()
    if org is None:
        return jsonify({"error": "No organisation for this account"}), 404

    data = request.get_json() or {}
    try:
        if "name" in data:
            name = (data.get("name") or "").strip()
            if not name:
                return jsonify({"error": "Organisation name cannot be empty"}), 400
            check_length(name, 200, "name")
            org.name = name

        if "settings" in data:
            settings = data.get("settings")
            if not isinstance(settings, dict):
                return jsonify({"error": "settings must be an object"}), 400
            # A small, closed set of light branding + policy fields — never the slug
            # (the tenant's identity) or is_active (a platform decision).
            cleaned = {}
            for key, limit in (("timezone", 64), ("logoUrl", 500)):
                if key in settings:
                    value = (settings.get(key) or "").strip()
                    check_length(value, limit, key)
                    cleaned[key] = value
            if "pto" in settings:
                pto = settings.get("pto")
                if not isinstance(pto, dict):
                    return jsonify({"error": "settings.pto must be an object"}), 400
                pto_clean = {}
                for key in ("annualDays", "carryoverCapDays"):
                    if key in pto and pto.get(key) is not None:
                        try:
                            n = float(pto[key])
                        except (TypeError, ValueError):
                            return jsonify({"error": f"settings.pto.{key} must be a number"}), 400
                        if n < 0 or n > 365:
                            return jsonify({"error": f"settings.pto.{key} must be between 0 and 365"}), 400
                        pto_clean[key] = n
                cleaned["pto"] = pto_clean
            if "punctuality" in settings:
                punc = settings.get("punctuality")
                if not isinstance(punc, dict):
                    return jsonify({"error": "settings.punctuality must be an object"}), 400
                punc_clean = {}
                if punc.get("graceMinutes") is not None:
                    try:
                        g = int(punc["graceMinutes"])
                    except (TypeError, ValueError):
                        return jsonify({"error": "settings.punctuality.graceMinutes must be an integer"}), 400
                    if g < 0 or g > 240:
                        return jsonify({"error": "settings.punctuality.graceMinutes must be between 0 and 240"}), 400
                    punc_clean["graceMinutes"] = g
                cleaned["punctuality"] = punc_clean
            org.settings_json = json.dumps(cleaned)
    except ValueError as e:
        # An over-length name / timezone / logoUrl (check_length raised) is bad input,
        # not a server fault — return 400, not a 500.
        return jsonify({"error": str(e)}), 400

    db.session.commit()
    return jsonify(_org_payload(org))
