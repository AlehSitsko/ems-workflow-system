from flask import Blueprint, jsonify, request
from werkzeug.security import generate_password_hash, check_password_hash

from models import db, User
from limiter import limiter
from audit_utils import log_action


# Blueprint for authentication and user management routes.
auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


# Allowed system roles.
ALLOWED_ROLES = ["admin", "supervisor", "dispatcher", "hr"]


def _audit_user():
    try:
        uid = int(request.headers.get("X-User-Id", 0)) or None
    except (ValueError, TypeError):
        uid = None
    return uid, request.headers.get("X-User-Name") or None


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

    return jsonify({
        "message": "Login successful",
        "user": user.to_dict()
    })


# Return all system users ordered by ID.
@auth_bp.route("/users", methods=["GET"])
def get_users():
    users = User.query.order_by(User.id.asc()).all()
    return jsonify([user.to_dict() for user in users])


# Create a new system user.
@auth_bp.route("/users", methods=["POST"])
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

    user.username = username
    user.display_name = display_name
    user.role = role
    user.is_active = is_active

    # Link to employee record (nullable — send null/None to unlink)
    employee_id = data.get("employee_id")
    user.employee_id = int(employee_id) if employee_id else None

    # Update password only when a new password is provided.
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