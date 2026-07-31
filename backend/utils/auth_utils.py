"""Shared request-auth helpers.

Identity comes from the **server-side session cookie** set at login. The cookie
is signed with SECRET_KEY, HttpOnly and SameSite=Lax, so a client cannot state
its own role and a cross-site scripting bug cannot read the session out of
JavaScript the way it could a token in localStorage.

This replaced `X-User-Id` / `X-User-Role` / `X-User-Name` headers, which the
server used to believe: anyone who could reach the API could claim `admin` with
a single curl flag. Those headers are now ignored entirely — trusting them again
would silently undo this, so there is no fallback path to leave switched on by
accident.

Every gated route still fails closed, and the two failure modes stay distinct:

  * no session at all              -> 401 Authentication required
  * session present, wrong role    -> 403 Insufficient permissions

An unauthenticated request must never fall through to a handler. Frontend
visibility is a convenience, never a security boundary.
"""

from functools import wraps

import secrets

from flask import request, jsonify, session

# Every valid system role. Individual routes still narrow this to the subset
# they allow via `require_role(...)`.
ALL_ROLES = {"admin", "supervisor", "hr", "dispatcher"}

# Session keys. Named once so a typo cannot silently create an anonymous
# request that still looks logged in.
SESSION_USER_ID = "user_id"
SESSION_ROLE = "role"
SESSION_NAME = "display_name"
SESSION_ORG = "org_id"
SESSION_CSRF = "csrf_token"

# CSRF: a per-session token, mirrored into a JS-readable cookie so the SPA can
# echo it in a header on state-changing requests. The session cookie itself is
# SameSite=Lax and HttpOnly, so this is defence in depth against the residual
# CSRF surface Lax does not cover (e.g. a same-site subdomain).
CSRF_COOKIE = "csrf_token"
CSRF_HEADER = "X-CSRF-Token"
_UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


def start_session(user):
    """Record a signed-in user. Called only after the password is verified."""
    # A fresh session id per login: reusing the pre-login one would leave the
    # app open to session fixation, where an attacker plants a known id and
    # inherits the session once the victim signs in.
    session.clear()
    session[SESSION_USER_ID] = user.id
    session[SESSION_ROLE] = user.role
    session[SESSION_NAME] = user.display_name
    session[SESSION_ORG] = user.org_id
    # A CSRF token bound to this session, unpredictable and rotated per login.
    session[SESSION_CSRF] = secrets.token_urlsafe(32)
    session.permanent = True


def end_session():
    """Drop the signed-in user. Safe to call when nobody is signed in."""
    session.clear()


def get_csrf_token():
    """This session's CSRF token, or None when not signed in."""
    return session.get(SESSION_CSRF)


def get_request_role():
    """The caller's role from the session ('' when not signed in)."""
    return session.get(SESSION_ROLE, "")


def get_request_user_id():
    """The caller's user id from the session, or None."""
    user_id = session.get(SESSION_USER_ID)
    try:
        return int(user_id) or None
    except (ValueError, TypeError):
        return None


def get_request_user_name():
    """The caller's display name from the session, or None."""
    return session.get(SESSION_NAME) or None


def is_authenticated():
    """True when the request carries a signed-in session.

    A role the app no longer recognises still counts as "identified" — it is
    simply allowed nowhere, so it gets a 403. Only a request with no session at
    all is anonymous.
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


# ── Default-deny for the whole API ──────────────────────────────────────────
#
# Per-route decorators protect a route only if someone remembers to add one. An
# audit found 74 registered routes with no gate, including `/api/patients` and
# `/api/calls` — both of which returned patient data to an anonymous caller.
#
# So authentication is the default and exposure is the exception: anything under
# /api/ requires a session unless it is named below. A new route is protected by
# omission rather than exposed by it, which is the property the production plan
# in docs/PRODUCTION_READINESS.md asked for.
#
# Role-level checks still live on the individual routes — this only establishes
# "somebody is signed in".

# Endpoints reachable without a session, by Flask endpoint name.
PUBLIC_ENDPOINTS = {
    # Signing in, and ending a session that may already be gone.
    "auth.login",
    "auth.logout",
    # Liveness — used by container healthchecks before anyone can log in.
    "health_check",
    "home",
    # The kiosk is a shared wall-mounted clock-in device with no user session by
    # design; it authenticates an employee by PIN per action instead. Narrow and
    # deliberate — see routes/time_routes.py.
    "time.kiosk_employee_list",
    "time.kiosk_verify_pin",
    "time.kiosk_clock_in",
    "time.kiosk_clock_out",
    "time.kiosk_status",
    # Push notifications need this before a subscription exists.
    "notif.vapid_public_key",
}


def register_api_auth_guard(app):
    """Require a session for every /api/ route except PUBLIC_ENDPOINTS."""

    @app.before_request
    def _require_session_for_api():
        from flask import request, jsonify

        # CORS preflight carries no cookies by design; rejecting it would break
        # the real request that follows.
        if request.method == "OPTIONS":
            return None

        if not request.path.startswith("/api/"):
            return None

        endpoint = request.endpoint or ""
        if endpoint in PUBLIC_ENDPOINTS:
            return None

        if not is_authenticated():
            return jsonify({"error": "Authentication required"}), 401

        # Re-validate the signed-in user against the database on every request,
        # not just at login. This is the app's server-side revocation: disabling
        # a user (a departure, a compromised account) takes effect on their very
        # next request rather than lingering until the 12-hour cookie expires,
        # and a role change is honoured immediately instead of staying stale in
        # the cookie until the user signs in again. One primary-key lookup per
        # request — cheap, and the alternative is a stale credential.
        from models import User
        from tenant import set_current_org, unfiltered

        # The signed-in user's own lookup must never be tenant-filtered — it is what
        # establishes the tenant, and any org context left over from a prior request
        # in the same context would otherwise hide them and force a false 401.
        with unfiltered():
            user = User.query.get(get_request_user_id())
        if user is None or not user.is_active:
            set_current_org(None)
            end_session()
            return jsonify({"error": "Authentication required"}), 401

        # Bind this request to the user's organisation so the tenant filter/stamp
        # (tenant.py) scope every subsequent query and insert to it.
        set_current_org(user.org_id)

        if session.get(SESSION_ROLE) != user.role or session.get(SESSION_NAME) != user.display_name:
            session[SESSION_ROLE] = user.role
            session[SESSION_NAME] = user.display_name

        # CSRF: a state-changing request must echo this session's token in a
        # header. A cross-site page can make the browser send the (SameSite=Lax)
        # session cookie in some edge cases, but it cannot read the token cookie
        # to reproduce the header — so a forged POST fails here. Safe methods
        # (GET/HEAD) change nothing and are exempt.
        if request.method in _UNSAFE_METHODS:
            sent = request.headers.get(CSRF_HEADER, "")
            expected = session.get(SESSION_CSRF)
            if not expected or not secrets.compare_digest(sent, expected):
                return jsonify({"error": "CSRF token missing or invalid"}), 403

        return None

    @app.after_request
    def _sync_csrf_cookie(response):
        # Mirror the session's CSRF token into a JS-readable cookie so the SPA
        # can echo it back in the header. Only written when it is missing or
        # stale, not on every response. Not HttpOnly (the client must read it);
        # SameSite=Lax and Secure-in-production like the session cookie.
        token = session.get(SESSION_CSRF)
        if token and request.cookies.get(CSRF_COOKIE) != token:
            response.set_cookie(
                CSRF_COOKIE, token,
                samesite="Lax",
                secure=app.config.get("SESSION_COOKIE_SECURE", False),
                httponly=False,
                max_age=int(app.permanent_session_lifetime.total_seconds()),
            )
        return response
