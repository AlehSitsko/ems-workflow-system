from flask import Blueprint, jsonify, request
from werkzeug.security import generate_password_hash, check_password_hash

from models import db, User, Employee
from limiter import limiter
from audit_utils import log_action
from utils.auth_utils import (
    start_session, end_session, require_auth, require_role,
    get_request_user_id, get_request_user_name, get_csrf_token,
)
from utils.validation_utils import validate_password_strength


# Blueprint for authentication and user management routes.
auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


# Allowed system roles.
ALLOWED_ROLES = ["admin", "supervisor", "dispatcher", "hr"]


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
        "user": user.to_dict(),
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

    return jsonify({"user": user.to_dict(), "csrfToken": get_csrf_token()})


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

    user = User(
        username=username,
        password_hash=generate_password_hash(password),
        display_name=display_name,
        role=role,
        is_active=is_active,
    )

    db.session.add(user)
    db.session.flush()

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

    # Link to employee record (nullable — send null/None to unlink). Validated
    # before any field is written so a bad employee_id doesn't raise
    # sqlite3.IntegrityError (FK constraint) on commit.
    employee_id = data.get("employee_id")
    if employee_id:
        try:
            employee_id = int(employee_id)
        except (TypeError, ValueError):
            return jsonify({"error": "employee_id must be an integer"}), 400
        if not Employee.query.get(employee_id):
            return jsonify({"error": "Employee not found"}), 404
    else:
        employee_id = None

    user.username = username
    user.display_name = display_name
    user.role = role
    user.is_active = is_active
    user.employee_id = employee_id

    # Update password only when a new password is provided (validated above).
    if password:
        user.password_hash = generate_password_hash(password)

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