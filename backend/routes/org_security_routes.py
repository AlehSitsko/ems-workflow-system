"""Organisation security: owner continuity + emergency recovery codes.

- Owner continuity: every org has at least one Owner (a distinguished admin). An
  owner can grant ownership to another admin, so losing one owner never strands
  the org. The single-admin warning is driven by /security.
- Recovery codes: one-time authorisation factors for emergency recovery when
  admins are locked out. Only hashes are stored; raw codes are shown once. The
  emergency redeem is public (the holder has no session), identifies the org from
  the code itself, is single-use, revokes all org sessions and is fully audited.

A recovery code is NOT an encryption key — it only authorises the recovery process.
"""

import hashlib
import secrets
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request
from werkzeug.security import generate_password_hash

from models import db, User, OrgRecoveryCode, UserSession
from utils.auth_utils import (
    require_role, get_request_user_id, get_request_user_name, append_password_history,
)
from utils.validation_utils import validate_password_strength
from audit_utils import log_action

org_security_bp = Blueprint("org_security", __name__, url_prefix="/api/org")

RECOVERY_CODE_COUNT = 10


def _now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _hash(raw):
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _format_code(raw):
    # Group for readability: 4-4-4.
    s = raw.upper().replace("_", "").replace("-", "")[:12].ljust(12, "X")
    return f"{s[:4]}-{s[4:8]}-{s[8:12]}"


# ── Status (drives the single-admin warning) ─────────────────────────────────

@org_security_bp.route("/security", methods=["GET"])
@require_role("admin")
def org_security_status():
    admins = User.query.filter_by(role="admin", is_active=True).all()  # org-filtered
    owners = [u for u in admins if u.is_owner]
    remaining = OrgRecoveryCode.query.filter_by(used_at=None).count()
    return jsonify({
        "adminCount": len(admins),
        "ownerCount": len(owners),
        "isOnlyAdmin": len(admins) <= 1,
        "recoveryCodesRemaining": remaining,
        "recoveryCodesTotal": OrgRecoveryCode.query.count(),
        "owners": [{"id": u.id, "username": u.username, "displayName": u.display_name} for u in owners],
    })


# ── Recovery codes: (re)generate ─────────────────────────────────────────────

@org_security_bp.route("/recovery-codes", methods=["POST"])
@require_role("admin")
def regenerate_recovery_codes():
    caller = User.query.get(get_request_user_id())
    if not caller:
        return jsonify({"error": "Authentication required"}), 401

    # Invalidate any prior UNUSED codes for THIS org only (explicit org filter — a
    # bulk delete is not covered by the ORM read-filter).
    OrgRecoveryCode.query.filter_by(used_at=None, org_id=caller.org_id).delete()

    now = _now()
    codes = []
    for _ in range(RECOVERY_CODE_COUNT):
        raw = _format_code(secrets.token_urlsafe(12))
        codes.append(raw)
        db.session.add(OrgRecoveryCode(code_hash=_hash(raw), created_at=now, created_by=caller.id))
    log_action("security.recovery_codes_regenerated", "organization", caller.org_id, None,
               {"count": RECOVERY_CODE_COUNT}, user_id=caller.id, user_name=get_request_user_name())
    db.session.commit()
    # Shown exactly once.
    return jsonify({"codes": codes, "count": len(codes)}), 201


# ── Owner continuity: grant ownership to another admin ───────────────────────

@org_security_bp.route("/owners", methods=["POST"])
@require_role("admin")
def grant_ownership():
    caller = User.query.get(get_request_user_id())
    if not caller or not caller.is_owner:
        return jsonify({"error": "Only an organisation owner can grant ownership."}), 403
    data = request.get_json() or {}
    target = User.query.filter_by(id=data.get("userId")).first()  # org-filtered
    if not target:
        return jsonify({"error": "User not found"}), 404
    if target.role != "admin" or not target.is_active:
        return jsonify({"error": "Ownership can only be granted to an active admin."}), 400
    if not target.is_owner:
        target.is_owner = True
        log_action("security.ownership_granted", "user", target.id, target.username, None,
                   user_id=caller.id, user_name=caller.display_name)
        db.session.commit()
    return jsonify({"id": target.id, "username": target.username, "isOwner": True})


# ── Public: emergency recovery redeem ────────────────────────────────────────

@org_security_bp.route("/recovery/redeem", methods=["POST"])
def redeem_recovery_code():
    """Regain admin access using a one-time recovery code (public — the holder has
    no session). The code identifies the org; the nominated account is reactivated,
    promoted to admin+owner and its password reset. ALL org sessions are revoked so
    the event is disruptive and visible, and everything is audited. Single-use."""
    from tenant import unfiltered, set_current_org

    data = request.get_json() or {}
    raw = (data.get("code") or "").strip()
    username = (data.get("username") or "").strip()
    new_password = data.get("newPassword") or ""

    if not raw or not username:
        return jsonify({"error": "A recovery code and the account username are required."}), 400

    with unfiltered():
        code = OrgRecoveryCode.query.filter_by(code_hash=_hash(raw)).first()
    if not code:
        return jsonify({"error": "Invalid recovery code."}), 404
    if code.used_at:
        return jsonify({"error": "This recovery code has already been used."}), 410

    pw_error = validate_password_strength(new_password, username)
    if pw_error:
        return jsonify({"error": pw_error}), 400

    org_id = code.org_id
    set_current_org(org_id)
    try:
        target = User.query.filter_by(username=username, org_id=org_id).first()
        if not target:
            return jsonify({"error": "No such account in this organisation."}), 404

        # Restore the account to a working owner-admin with a new password.
        target.is_active = True
        target.role = "admin"
        target.is_owner = True
        target.password_hash = generate_password_hash(new_password)
        target.password_changed_at = _now()
        db.session.flush()
        append_password_history(target)

        # Revoke every session in the org — a loud, visible signal that recovery
        # happened, and it kills any attacker session that might already exist.
        with unfiltered():
            org_user_ids = [u.id for u in User.query.filter_by(org_id=org_id).all()]
            revoked = UserSession.query.filter(
                UserSession.user_id.in_(org_user_ids), UserSession.revoked == False  # noqa: E712
            ).update({"revoked": True}, synchronize_session=False)

        code.used_at = _now()
        code.used_note = f"account {username} recovered"
        log_action("security.recovery_code_used", "organization", org_id, None,
                   {"account": username}, user_id=target.id, user_name=target.display_name, org_id=org_id)
        log_action("security.owner_recovered", "user", target.id, username,
                   {"sessionsRevoked": revoked}, user_id=target.id, user_name=target.display_name, org_id=org_id)
        db.session.commit()

        return jsonify({
            "message": "Recovery complete. All sessions were signed out; sign in with your new password.",
            "username": target.username,
        }), 200
    finally:
        set_current_org(None)
