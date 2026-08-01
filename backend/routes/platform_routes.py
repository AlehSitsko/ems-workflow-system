"""Platform super-admin console — cross-org operations.

Reachable only by a platform super-admin on the platform host (enforced by both
the auth guard and `require_platform_admin`). A platform admin has no org of their
own and runs unfiltered, so these routes see and manage every organisation:
create one (with its first admin), rename or suspend it, and reset an org admin's
password. Ordinary org data is never touched here — only organisations and their
admin logins.
"""

import re
from datetime import datetime

from flask import Blueprint, jsonify, request
from werkzeug.security import generate_password_hash

from models import db, Organization, User
from utils.auth_utils import require_platform_admin, append_password_history
from utils.validation_utils import validate_password_strength


platform_bp = Blueprint("platform", __name__, url_prefix="/api/platform")

# A slug is a DNS label: lowercase letters, digits and hyphens, not at the ends.
_SLUG_RE = re.compile(r"^[a-z0-9]([a-z0-9-]*[a-z0-9])?$")
# Never usable as an org slug — they collide with infra or the platform itself.
_RESERVED_SLUGS = {"www", "api", "app", "admin", "platform", "mail", "static"}


def _now():
    return datetime.now().isoformat(timespec="seconds")


def _validate_slug(slug):
    if not slug or not _SLUG_RE.match(slug) or len(slug) > 63:
        return "slug must be lowercase letters, digits and hyphens"
    if slug in _RESERVED_SLUGS:
        return "that slug is reserved"
    return None


def _org_dict(org):
    return {**org.to_dict(), "userCount": User.query.filter_by(org_id=org.id).count()}


@platform_bp.route("/orgs", methods=["GET"])
@require_platform_admin
def list_orgs():
    orgs = Organization.query.order_by(Organization.name.asc()).all()
    return jsonify([_org_dict(o) for o in orgs])


@platform_bp.route("/orgs", methods=["POST"])
@require_platform_admin
def create_org():
    """Create an organisation and its first admin login in one step."""
    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    slug = (data.get("slug") or "").strip().lower()
    admin_username = (data.get("adminUsername") or "").strip()
    admin_password = data.get("adminPassword") or ""

    if not name:
        return jsonify({"error": "Organisation name is required"}), 400
    slug_error = _validate_slug(slug)
    if slug_error:
        return jsonify({"error": slug_error}), 400
    if Organization.query.filter_by(slug=slug).first():
        return jsonify({"error": "An organisation with that slug already exists"}), 409
    if not admin_username:
        return jsonify({"error": "An admin username is required"}), 400
    pw_error = validate_password_strength(admin_password, admin_username)
    if pw_error:
        return jsonify({"error": pw_error}), 400

    now = _now()
    org = Organization(name=name, slug=slug, is_active=True, created_at=now)
    db.session.add(org)
    db.session.flush()

    admin = User(
        username=admin_username,
        password_hash=generate_password_hash(admin_password),
        password_changed_at=now,
        display_name=data.get("adminDisplayName", "").strip() or admin_username,
        role="admin",
        is_active=True,
        org_id=org.id,
    )
    db.session.add(admin)
    db.session.flush()
    append_password_history(admin)
    db.session.commit()

    return jsonify({"org": _org_dict(org), "adminUsername": admin.username}), 201


@platform_bp.route("/orgs/<int:org_id>", methods=["PATCH"])
@require_platform_admin
def update_org(org_id):
    """Rename or suspend/reactivate an organisation."""
    org = Organization.query.get(org_id)
    if not org:
        return jsonify({"error": "Organisation not found"}), 404

    data = request.get_json() or {}
    if "name" in data:
        name = (data.get("name") or "").strip()
        if not name:
            return jsonify({"error": "Organisation name cannot be empty"}), 400
        org.name = name
    if "isActive" in data:
        org.is_active = bool(data.get("isActive"))

    db.session.commit()
    return jsonify(_org_dict(org))


@platform_bp.route("/orgs/<int:org_id>/reset-admin", methods=["POST"])
@require_platform_admin
def reset_org_admin(org_id):
    """Set a new password for a named admin of the org — the recovery path when an
    org locks itself out."""
    org = Organization.query.get(org_id)
    if not org:
        return jsonify({"error": "Organisation not found"}), 404

    data = request.get_json() or {}
    username = (data.get("username") or "").strip()
    new_password = data.get("newPassword") or ""
    if not username:
        return jsonify({"error": "username is required"}), 400

    admin = User.query.filter_by(org_id=org.id, username=username).first()
    if not admin:
        return jsonify({"error": "No such user in that organisation"}), 404
    pw_error = validate_password_strength(new_password, username)
    if pw_error:
        return jsonify({"error": pw_error}), 400

    admin.password_hash = generate_password_hash(new_password)
    admin.password_changed_at = _now()
    append_password_history(admin)
    db.session.commit()
    return jsonify({"message": "Password reset", "username": admin.username})
