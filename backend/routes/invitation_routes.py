"""Invite-only onboarding (server/cloud mode).

An admin invites a user by email + role; the invitee opens a secure one-time link
and creates their own credentials. The organisation and role are fixed by the
invitation — the invitee cannot change either through the accept request — and the
raw token is never stored (only its SHA-256 hash).

Manual user creation (routes/auth_routes.py `create_user`) is kept for
standalone/local deployments.
"""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from flask import Blueprint, jsonify, request
from werkzeug.security import generate_password_hash

from models import db, UserInvitation, User, Organization, Employee
from utils.auth_utils import (
    require_role, get_request_user_id, get_request_user_name,
    append_password_history, start_session,
)
from utils.validation_utils import validate_password_strength
from audit_utils import log_action

invitation_bp = Blueprint("invitations", __name__, url_prefix="/api/invitations")

INVITE_TTL_HOURS = 48
ALLOWED_INVITE_ROLES = {"admin", "supervisor", "dispatcher", "hr", "employee"}


def _now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _hash(raw):
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _lookup_valid(raw):
    """Resolve a raw token to a usable invitation, or an (error, status) tuple.

    Looked up unfiltered because the accept flow has no session/org context — the
    org comes from the invitation itself, and the token hash is unique and high
    entropy, so a global lookup is safe.
    """
    from tenant import unfiltered
    if not raw:
        return None, ("This invitation link is invalid.", 404)
    with unfiltered():
        inv = UserInvitation.query.filter_by(token_hash=_hash(raw)).first()
    if not inv:
        return None, ("This invitation link is invalid.", 404)
    state = inv.status()
    if state == "revoked":
        return None, ("This invitation has been revoked.", 410)
    if state == "accepted":
        return None, ("This invitation has already been used.", 410)
    if state == "expired":
        return None, ("This invitation has expired.", 410)
    return inv, None


# ── Admin: create / list / revoke ────────────────────────────────────────────

@invitation_bp.route("", methods=["POST"])
@require_role("admin")
def create_invitation():
    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()
    role = (data.get("role") or "").strip()
    display_name = (data.get("display_name") or "").strip() or None

    if not email or "@" not in email:
        return jsonify({"error": "A valid email is required"}), 400
    if role not in ALLOWED_INVITE_ROLES:
        return jsonify({"error": "Invalid role"}), 400

    # Optional employee link — the query is org-filtered, so a cross-org id 404s.
    employee_id = data.get("employee_id")
    if employee_id is not None:
        if not Employee.query.filter_by(id=employee_id).first():
            return jsonify({"error": "Employee not found"}), 404

    raw = secrets.token_urlsafe(32)
    expires = (datetime.now(timezone.utc) + timedelta(hours=INVITE_TTL_HOURS)).isoformat(timespec="seconds")
    inv = UserInvitation(
        email=email, role=role, display_name=display_name, employee_id=employee_id,
        token_hash=_hash(raw), created_by=get_request_user_id(),
        created_at=_now(), expires_at=expires,
    )
    db.session.add(inv)  # org_id filled by the tenant write-stamp (the admin's org)
    db.session.flush()
    log_action("user.invited", "invitation", inv.id, email, {"role": role},
               user_id=get_request_user_id(), user_name=get_request_user_name())
    db.session.commit()

    # The raw token is returned exactly once, so the admin can send the link.
    return jsonify({
        **inv.to_dict(),
        "token": raw,
        "acceptPath": f"/ems-workflow-system/#/accept-invite?token={raw}",
    }), 201


@invitation_bp.route("", methods=["GET"])
@require_role("admin")
def list_invitations():
    invs = UserInvitation.query.order_by(UserInvitation.id.desc()).all()
    return jsonify([i.to_dict() for i in invs])


@invitation_bp.route("/<int:invitation_id>/revoke", methods=["POST"])
@require_role("admin")
def revoke_invitation(invitation_id):
    inv = UserInvitation.query.filter_by(id=invitation_id).first()
    if not inv:
        return jsonify({"error": "Invitation not found"}), 404
    if inv.accepted_at:
        return jsonify({"error": "This invitation has already been accepted."}), 409
    if not inv.revoked_at:
        inv.revoked_at = _now()
        log_action("user.invite_revoked", "invitation", inv.id, inv.email, None,
                   user_id=get_request_user_id(), user_name=get_request_user_name())
        db.session.commit()
    return jsonify(inv.to_dict())


# ── Public: validate / accept (no session yet) ───────────────────────────────

@invitation_bp.route("/accept/<token>", methods=["GET"])
def validate_invitation(token):
    inv, err = _lookup_valid(token)
    if err:
        message, status = err
        return jsonify({"error": message}), status
    from tenant import unfiltered
    with unfiltered():
        org = Organization.query.get(inv.org_id)
    return jsonify({
        "email": inv.email,
        "role": inv.role,
        "displayName": inv.display_name,
        "organization": org.name if org else None,
    })


@invitation_bp.route("/accept", methods=["POST"])
def accept_invitation():
    data = request.get_json() or {}
    token = (data.get("token") or "").strip()
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    display_name = (data.get("display_name") or "").strip()

    inv, err = _lookup_valid(token)
    if err:
        message, status = err
        return jsonify({"error": message}), status

    if not username:
        return jsonify({"error": "Username is required"}), 400
    if not display_name:
        display_name = inv.display_name or username

    pw_error = validate_password_strength(password, username)
    if pw_error:
        return jsonify({"error": pw_error}), 400

    from tenant import set_current_org
    # The account's org and role come ONLY from the invitation, never the request.
    set_current_org(inv.org_id)
    try:
        if User.query.filter_by(username=username, org_id=inv.org_id).first():
            return jsonify({"error": "Username already exists"}), 409

        user = User(
            username=username,
            password_hash=generate_password_hash(password),
            password_changed_at=_now(),
            display_name=display_name,
            role=inv.role,
            is_active=True,
            employee_id=inv.employee_id,
            org_id=inv.org_id,
        )
        db.session.add(user)
        db.session.flush()
        append_password_history(user)

        inv.accepted_at = _now()
        log_action("user.invite_accepted", "invitation", inv.id, inv.email,
                   {"userId": user.id}, user_id=user.id, user_name=display_name, org_id=inv.org_id)
        log_action("user.activated", "user", user.id, username, None,
                   user_id=user.id, user_name=display_name, org_id=inv.org_id)
        db.session.commit()

        # Sign the new user in so they can start working immediately.
        start_session(user)
        return jsonify({
            "user": {"id": user.id, "username": user.username,
                     "role": user.role, "displayName": user.display_name},
        }), 201
    finally:
        set_current_org(None)
