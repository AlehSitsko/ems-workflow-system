"""Shared request-auth helpers.

Authentication is currently header-based (the frontend sends `X-User-Id`,
`X-User-Name`, `X-User-Role` on each request). Replacing that with real
JWT/session auth is the deferred final hardening phase — see
docs/PRODUCTION_READINESS.md. This module only centralizes the *existing*
pattern so the per-route role gate isn't copy-pasted across blueprints.
"""

from functools import wraps

from flask import request, jsonify

# Every valid system role. Individual routes still narrow this to the subset
# they allow via `require_role(...)`.
ALL_ROLES = {"admin", "supervisor", "hr", "dispatcher"}


def get_request_role():
    """The caller's role from the X-User-Role header ('' when absent)."""
    return request.headers.get("X-User-Role", "")


def get_request_user_id():
    """The caller's user id from X-User-Id, or None when absent/invalid."""
    try:
        return int(request.headers.get("X-User-Id", 0)) or None
    except (ValueError, TypeError):
        return None


def get_request_user_name():
    """The caller's display name from X-User-Name, or None when absent."""
    return request.headers.get("X-User-Name") or None


def require_role(*allowed_roles):
    """Gate a view so only the given roles may call it.

    Returns a JSON 403 (not Werkzeug's HTML page) when the request's
    X-User-Role is not in the allowed set. Contextual checks that depend on
    the loaded object (task ownership, HR task-type limits, etc.) stay inline
    in the view — this only replaces the pure "is my role allowed" gate.
    """
    allowed = set(allowed_roles)

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            if get_request_role() not in allowed:
                return jsonify({"error": "Insufficient permissions"}), 403
            return fn(*args, **kwargs)
        return wrapper

    return decorator
