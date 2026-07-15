"""Shared request-auth helpers.

**These headers are not production authentication.** The caller sends
`X-User-Id` / `X-User-Name` / `X-User-Role` and the server believes them, so
anyone who can reach the API can claim any role. That is acceptable only for
local development and demos; replacing it with real JWT/session auth is the
deferred hardening phase (see docs/PRODUCTION_READINESS.md).

What this module *does* guarantee is that every gated route fails closed:

  * no identity at all            -> 401 Authentication required
  * identity present, wrong role  -> 403 Insufficient permissions

An unauthenticated request must never fall through to a handler. Frontend
visibility is a convenience, never a security boundary.
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


def is_authenticated():
    """True when the request carries some caller identity.

    A claimed-but-unknown role still counts as "identified" — it is simply not
    allowed anywhere, so it gets a 403. Only a request with no identity at all
    is anonymous.
    """
    return bool(get_request_role())


def require_auth(fn):
    """Reject anonymous requests with 401 before the view runs."""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not is_authenticated():
            return jsonify({"error": "Authentication required"}), 401
        return fn(*args, **kwargs)
    return wrapper


def require_role(*allowed_roles):
    """Gate a view so only the given roles may call it.

    Fails closed, and distinguishes the two failures so callers (and tests) can
    tell them apart:

      * anonymous                 -> 401 Authentication required
      * identified but not allowed -> 403 Insufficient permissions

    Returns JSON, not Werkzeug's HTML page. Contextual checks that depend on the
    loaded object (task ownership, HR task-type limits, date modes) stay inline
    in the view — this only replaces the pure "is my role allowed" gate.
    """
    allowed = set(allowed_roles)

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            if not is_authenticated():
                return jsonify({"error": "Authentication required"}), 401
            if get_request_role() not in allowed:
                return jsonify({"error": "Insufficient permissions"}), 403
            return fn(*args, **kwargs)
        return wrapper

    return decorator
