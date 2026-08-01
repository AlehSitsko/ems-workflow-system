from flask import Blueprint, jsonify, request, session, current_app
from werkzeug.security import generate_password_hash, check_password_hash

from models import db, User, Employee, Organization, UserSession
from limiter import limiter
from audit_utils import log_action
from utils.auth_utils import (
    start_session, end_session, require_auth, require_role,
    get_request_user_id, get_request_user_name, get_csrf_token,
    password_expired, append_password_history, password_in_history,
    SESSION_SID,
)
from utils.validation_utils import validate_password_strength


def _now_iso():
    from datetime import datetime
    return datetime.now().isoformat(timespec="seconds")


# Blueprint for authentication and user management routes.
auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


# Allowed system roles. `employee` is a self-service portal login (see
# routes/portal_routes.py): it is admitted to authentication but, because every
# ops/HR endpoint fails closed on an unlisted role, it can reach nothing except
# the portal — which only ever serves the caller's own linked employee record.
ALLOWED_ROLES = ["admin", "supervisor", "dispatcher", "hr", "employee"]


def _user_payload(user):
    """The user dict the client caches as `currentUser`, plus their organisation so
    the UI can show which tenant they are signed in to. Organisation is not tenant-
    scoped, so this is a plain lookup of the user's own org."""
    data = user.to_dict()
    org = Organization.query.get(user.org_id) if user.org_id else None
    data["organization"] = {"id": org.id, "name": org.name} if org else None
    # Lets the client route an expired user straight to the change-password screen
    # rather than into an app whose every request would 403.
    data["passwordExpired"] = password_expired(user)
    return data


def _resolve_employee_link(data, role, current_user_id=None):
    """Validate the optional user↔employee link. Returns (employee_id, error).

    A link is optional for staff roles (it powers "my tasks"), but **required**
    for an `employee` portal login — that account has nothing to show without one
    — and an employee record may back at most one portal login.
    """
    raw = data.get("employee_id")
    employee_id = None
    if raw not in (None, ""):
        try:
            employee_id = int(raw)
        except (TypeError, ValueError):
            return None, ("employee_id must be an integer", 400)
        if not Employee.query.get(employee_id):
            return None, ("Employee not found", 404)

    if role == "employee":
        if employee_id is None:
            return None, ("An employee portal login must be linked to an employee record", 400)
        clash = User.query.filter(
            User.employee_id == employee_id, User.role == "employee",
            User.id != current_user_id,
        ).first()
        if clash:
            return None, ("That employee already has a portal login", 409)

    return employee_id, None


def _audit_user():
    """Who is acting, from the session — never from a client-supplied header."""
    return get_request_user_id(), get_request_user_name()


# Handle user login and return authenticated user data.
@auth_bp.route("/login", methods=["POST"])
@limiter.limit("10 per minute")
def login():
    data = request.get_json()

    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    username = data.get("username", "").strip()
    password = data.get("password", "")

    if not username or not password:
        return jsonify({"error": "Username and password are required"}), 400

    # Which organisation is this login for? On an org subdomain the username is
    # scoped to that org; on a bare host (localhost/apex) there is no subdomain, so
    # the lookup stays global — the pre-v2, single-tenant behaviour.
    from utils.tenant_host import org_slug_from_host
    slug = org_slug_from_host(request.host)
    if slug:
        org = Organization.query.filter_by(slug=slug).first()
        if org is None:
            return jsonify({"error": "Invalid username or password"}), 401
        if not org.is_active:
            return jsonify({"error": "This workspace is suspended"}), 403
        user = User.query.filter_by(org_id=org.id, username=username).first()
    else:
        user = User.query.filter_by(username=username).first()

    if not user:
        return jsonify({"error": "Invalid username or password"}), 401

    if not user.is_active:
        return jsonify({"error": "User account is inactive"}), 403

    if not check_password_hash(user.password_hash, password):
        return jsonify({"error": "Invalid username or password"}), 401

    # Identity now lives in a signed, HttpOnly cookie. The user object is still
    # returned so the client can render a name and scope its UI, but nothing the
    # client sends back is trusted for authorisation.
    start_session(user)

    return jsonify({
        "message": "Login successful",
        "user": _user_payload(user),
        "csrfToken": get_csrf_token(),
    })


@auth_bp.route("/logout", methods=["POST"])
def logout():
    """Drop the session. Deliberately succeeds even when nobody is signed in —
    a client clearing its state should never have to handle an error."""
    end_session()
    return jsonify({"message": "Logged out"})


@auth_bp.route("/me", methods=["GET"])
@require_auth
def current_user():
    """The signed-in user, for restoring a session after a page reload.

    The client used to keep the user in localStorage and send the role back on
    every request. Now the cookie is the identity and this is how the UI learns
    who it belongs to — a stale or forged localStorage entry buys nothing.
    """
    user = User.query.get(get_request_user_id())
    if not user or not user.is_active:
        # The account was removed or disabled while the cookie was still valid.
        end_session()
        return jsonify({"error": "Authentication required"}), 401

    return jsonify({"user": _user_payload(user), "csrfToken": get_csrf_token()})


@auth_bp.route("/change-password", methods=["POST"])
@require_auth
def change_password():
    """Change my own password. This is the one thing an expired account can still
    do (see the auth guard), and the ordinary way any user rotates theirs."""
    user = User.query.get(get_request_user_id())
    if not user or not user.is_active:
        end_session()
        return jsonify({"error": "Authentication required"}), 401

    data = request.get_json() or {}
    current = data.get("currentPassword", "")
    new = data.get("newPassword", "")

    if not current or not new:
        return jsonify({"error": "Both currentPassword and newPassword are required"}), 400
    if not check_password_hash(user.password_hash, current):
        return jsonify({"error": "Current password is incorrect"}), 403

    pw_error = validate_password_strength(new, user.username)
    if pw_error:
        return jsonify({"error": pw_error}), 400
    # Rotation means a genuinely new secret, not the same one re-entered.
    if check_password_hash(user.password_hash, new):
        return jsonify({"error": "The new password must be different from the current one"}), 400
    # …nor a recent one, when a history depth is configured.
    depth = current_app.config.get("PASSWORD_HISTORY_DEPTH", 0)
    if password_in_history(user, new, depth):
        return jsonify({"error": f"The new password must not match your last {depth} passwords"}), 400

    user.password_hash = generate_password_hash(new)
    user.password_changed_at = _now_iso()
    append_password_history(user)
    db.session.commit()

    return jsonify({"message": "Password changed", "user": _user_payload(user)})


# ── Active sessions (per-device) ─────────────────────────────────────────────
#
# Every route here operates only on the caller's *own* sessions — the query is
# scoped by user_id from the session, so one user can never see or revoke another's
# devices.

@auth_bp.route("/sessions", methods=["GET"])
@require_auth
def list_sessions():
    """My active (non-revoked) sessions, newest activity first, current flagged."""
    uid = get_request_user_id()
    current_sid = session.get(SESSION_SID)
    rows = (
        UserSession.query
        .filter_by(user_id=uid, revoked=False)
        .order_by(UserSession.last_seen_at.desc(), UserSession.id.desc())
        .all()
    )
    return jsonify([r.to_dict(current_sid) for r in rows])


@auth_bp.route("/sessions/<int:session_id>", methods=["DELETE"])
@require_auth
def revoke_session(session_id):
    """Revoke one of my sessions. Revoking the current one also signs me out here."""
    uid = get_request_user_id()
    row = UserSession.query.filter_by(id=session_id, user_id=uid).first()
    if not row:
        return jsonify({"error": "Session not found"}), 404

    is_current = session.get(SESSION_SID) == row.sid
    row.revoked = True
    db.session.commit()
    if is_current:
        end_session()  # already revoked above; this clears the cookie too
    return jsonify({"message": "Session revoked", "current": is_current})


@auth_bp.route("/sessions/revoke-others", methods=["POST"])
@require_auth
def revoke_other_sessions():
    """Sign out everywhere except this device — the "was that you?" panic button."""
    uid = get_request_user_id()
    current_sid = session.get(SESSION_SID)
    rows = UserSession.query.filter_by(user_id=uid, revoked=False).all()
    revoked = 0
    for row in rows:
        if row.sid != current_sid:
            row.revoked = True
            revoked += 1
    db.session.commit()
    return jsonify({"message": "Other sessions signed out", "revoked": revoked})


# Return all system users ordered by ID.
# ── User administration — admin only ────────────────────────────────────────
#
# These four routes had no gate at all: an anonymous POST could create an admin
# account, and anyone could list, edit or disable users. The frontend hid the
# page behind an admin route, which was never protection — the API is the
# boundary. Pinned by tests/test_security.py.

@auth_bp.route("/users", methods=["GET"])
@require_role("admin")
def get_users():
    users = User.query.order_by(User.id.asc()).all()
    return jsonify([user.to_dict() for user in users])


# Create a new system user.
@auth_bp.route("/users", methods=["POST"])
@require_role("admin")
def create_user():
    data = request.get_json()

    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    username = data.get("username", "").strip()
    password = data.get("password", "")
    display_name = data.get("display_name", "").strip()
    role = data.get("role", "dispatcher").strip()
    is_active = bool(data.get("is_active", True))

    if not username:
        return jsonify({"error": "Username is required"}), 400

    if not password:
        return jsonify({"error": "Password is required"}), 400

    # A new account must meet the password policy.
    pw_error = validate_password_strength(password, username)
    if pw_error:
        return jsonify({"error": pw_error}), 400

    if not display_name:
        return jsonify({"error": "Display name is required"}), 400

    if role not in ALLOWED_ROLES:
        return jsonify({"error": "Invalid user role"}), 400

    existing_user = User.query.filter_by(username=username).first()

    if existing_user:
        return jsonify({"error": "Username already exists"}), 409

    employee_id, link_error = _resolve_employee_link(data, role)
    if link_error:
        message, status = link_error
        return jsonify({"error": message}), status

    user = User(
        username=username,
        password_hash=generate_password_hash(password),
        password_changed_at=_now_iso(),
        display_name=display_name,
        role=role,
        is_active=is_active,
        employee_id=employee_id,
    )

    db.session.add(user)
    db.session.flush()
    append_password_history(user)  # seed history with the initial password

    uid, uname = _audit_user()
    log_action("user.created", "user", user.id, user.username,
               {"role": role, "is_active": is_active},
               user_id=uid, user_name=uname)
    db.session.commit()

    return jsonify(user.to_dict()), 201


# Update an existing system user.
@auth_bp.route("/users/<int:id>", methods=["PUT"])
@require_role("admin")
def update_user(id):
    data = request.get_json()

    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    user = User.query.get(id)

    if not user:
        return jsonify({"error": "User not found"}), 404

    username = data.get("username", "").strip()
    password = data.get("password", "")
    display_name = data.get("display_name", "").strip()
    role = data.get("role", "dispatcher").strip()
    is_active = bool(data.get("is_active", True))

    if not username:
        return jsonify({"error": "Username is required"}), 400

    if not display_name:
        return jsonify({"error": "Display name is required"}), 400

    if role not in ALLOWED_ROLES:
        return jsonify({"error": "Invalid user role"}), 400

    # A replacement password must meet the same policy as a new account. Checked
    # before any field is written, so a rejected update leaves the user unchanged.
    if password:
        pw_error = validate_password_strength(password, username)
        if pw_error:
            return jsonify({"error": pw_error}), 400

    existing_user = User.query.filter(
        User.username == username,
        User.id != id
    ).first()

    if existing_user:
        return jsonify({"error": "Username already exists"}), 409

    changes = {}
    if user.username != username:
        changes["username"] = {"from": user.username, "to": username}
    if user.role != role:
        changes["role"] = {"from": user.role, "to": role}
    if user.is_active != is_active:
        changes["is_active"] = {"from": user.is_active, "to": is_active}
    if password:
        changes["password"] = "changed"

    # Link to employee record (nullable — send null/None to unlink for a staff
    # role; required for an employee portal login). Validated before any field is
    # written so a bad employee_id doesn't raise a FK IntegrityError on commit.
    employee_id, link_error = _resolve_employee_link(data, role, current_user_id=user.id)
    if link_error:
        message, status = link_error
        return jsonify({"error": message}), status
    if user.employee_id != employee_id:
        changes["employee_id"] = {"from": user.employee_id, "to": employee_id}

    user.username = username
    user.display_name = display_name
    user.role = role
    user.is_active = is_active
    user.employee_id = employee_id

    # Update password only when a new password is provided (validated above).
    if password:
        user.password_hash = generate_password_hash(password)
        user.password_changed_at = _now_iso()  # resets the rotation clock
        append_password_history(user)

    if changes:
        uid, uname = _audit_user()
        log_action("user.updated", "user", user.id, user.username, changes,
                   user_id=uid, user_name=uname)

    db.session.commit()

    return jsonify(user.to_dict())


# Toggle user active status or set it explicitly.
@auth_bp.route("/users/<int:id>/toggle-active", methods=["PATCH"])
@require_role("admin")
def toggle_user_active(id):
    user = User.query.get(id)

    if not user:
        return jsonify({"error": "User not found"}), 404

    data = request.get_json() or {}

    if "is_active" in data:
        user.is_active = bool(data.get("is_active"))
    else:
        user.is_active = not user.is_active

    uid, uname = _audit_user()
    log_action("user.activated" if user.is_active else "user.deactivated",
               "user", user.id, user.username, user_id=uid, user_name=uname)
    db.session.commit()

    return jsonify(user.to_dict())