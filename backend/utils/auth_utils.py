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
SESSION_SID = "sid"  # per-device session id, validated against the user_session table
SESSION_PLATFORM = "is_platform_admin"  # cross-org super-admin flag, cached from login

# Don't rewrite last_seen on every request — once per this many seconds is enough
# to power a "last active" display without a write on the hot path.
_SESSION_TOUCH_INTERVAL_S = 300

# CSRF: a per-session token, mirrored into a JS-readable cookie so the SPA can
# echo it in a header on state-changing requests. The session cookie itself is
# SameSite=Lax and HttpOnly, so this is defence in depth against the residual
# CSRF surface Lax does not cover (e.g. a same-site subdomain).
CSRF_COOKIE = "csrf_token"
CSRF_HEADER = "X-CSRF-Token"
_UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

# When a password has expired (see Config.PASSWORD_MAX_AGE_DAYS), the only /api/
# endpoints a signed-in user may still reach are these: changing the password (the
# way out), reading their own identity, and signing out. Everything else is 403
# until they rotate — enforced in the auth guard, not just hidden in the UI.
PASSWORD_CHANGE_EXEMPT = {"auth.change_password", "auth.current_user", "auth.logout"}

# A platform super-admin has no org, so their reads run unfiltered; they must only
# reach the platform console plus these self-service auth endpoints, never an
# ordinary tenant route where that NULL org would see every organisation's data.
PLATFORM_SELF_ENDPOINTS = {"auth.current_user", "auth.logout", "auth.change_password"}


def password_expired(user):
    """True when password rotation is enabled and this user's password is older
    than the configured maximum age. A missing timestamp counts as expired (an
    unknown age must be rotated); rotation off (max age 0) is never expired."""
    from datetime import datetime, timedelta
    from flask import current_app

    max_age = current_app.config.get("PASSWORD_MAX_AGE_DAYS", 0)
    if not max_age:
        return False
    changed_at = getattr(user, "password_changed_at", None)
    if not changed_at:
        return True
    try:
        changed = datetime.fromisoformat(changed_at)
    except (ValueError, TypeError):
        return True
    return datetime.now() - changed > timedelta(days=max_age)


# How many history rows to retain per user regardless of the configured check
# depth, so the depth can be raised later without having discarded the data.
_PASSWORD_HISTORY_KEEP = 24


def append_password_history(user):
    """Record the user's *current* password hash as a history entry and prune the
    oldest beyond the retained bound. Call after each password set (the user must
    already have an id). Reuses the stored hash — never re-hashes."""
    from datetime import datetime
    from models import db, PasswordHistory

    db.session.add(PasswordHistory(
        user_id=user.id,
        password_hash=user.password_hash,
        created_at=user.password_changed_at or datetime.now().isoformat(timespec="seconds"),
    ))
    db.session.flush()

    stale = (
        PasswordHistory.query
        .filter_by(user_id=user.id)
        .order_by(PasswordHistory.created_at.desc(), PasswordHistory.id.desc())
        .offset(_PASSWORD_HISTORY_KEEP)
        .all()
    )
    for row in stale:
        db.session.delete(row)


def password_in_history(user, raw_password, depth):
    """True when raw_password matches any of the user's last `depth` stored hashes.
    `depth <= 0` disables the check. The current password is the newest entry, so a
    depth of 1 already refuses reusing it."""
    if depth <= 0:
        return False
    from werkzeug.security import check_password_hash
    from models import PasswordHistory

    recent = (
        PasswordHistory.query
        .filter_by(user_id=user.id)
        .order_by(PasswordHistory.created_at.desc(), PasswordHistory.id.desc())
        .limit(depth)
        .all()
    )
    return any(check_password_hash(r.password_hash, raw_password) for r in recent)


def start_session(user, remember=True):
    """Record a signed-in user. Called only after the password is verified.

    ``remember`` controls cookie persistence: True (the default, used by first-run
    setup) keeps the user signed in across restarts for PERMANENT_SESSION_LIFETIME;
    False makes it a browser-session cookie that is cleared when the browser or the
    desktop app closes, so a shared machine does not stay signed in.
    """
    from datetime import datetime
    from models import db, UserSession

    # A fresh session id per login: reusing the pre-login one would leave the
    # app open to session fixation, where an attacker plants a known id and
    # inherits the session once the victim signs in.
    session.clear()
    session[SESSION_USER_ID] = user.id
    session[SESSION_ROLE] = user.role
    session[SESSION_NAME] = user.display_name
    session[SESSION_ORG] = user.org_id
    session[SESSION_PLATFORM] = bool(user.is_platform_admin)
    # A CSRF token bound to this session, unpredictable and rotated per login.
    session[SESSION_CSRF] = secrets.token_urlsafe(32)

    # Register this device server-side so it can be listed and revoked. The sid in
    # the cookie is the handle; the guard checks the row every request.
    sid = secrets.token_urlsafe(32)
    session[SESSION_SID] = sid
    now = datetime.now().isoformat(timespec="seconds")
    db.session.add(UserSession(
        sid=sid, user_id=user.id, created_at=now, last_seen_at=now,
        user_agent=(request.headers.get("User-Agent") or "")[:300],
    ))
    db.session.commit()

    # Persistent (remembered) vs a browser-session cookie that dies on close.
    session.permanent = bool(remember)


def end_session():
    """Drop the signed-in user and revoke this device's server-side session. Safe
    to call when nobody is signed in."""
    from models import db, UserSession

    sid = session.get(SESSION_SID)
    if sid:
        row = UserSession.query.filter_by(sid=sid).first()
        if row and not row.revoked:
            row.revoked = True
            db.session.commit()
    session.clear()


def session_is_live():
    """True when this request's session id is registered and not revoked, updating
    its last_seen (throttled). False means the device was signed out elsewhere, so
    the guard should reject the request. Absence of a sid is treated as live, so a
    context that never went through start_session (some tests) is unaffected."""
    from datetime import datetime
    from models import db, UserSession

    sid = session.get(SESSION_SID)
    if not sid:
        return True

    row = UserSession.query.filter_by(sid=sid).first()
    if row is None or row.revoked:
        return False

    now = datetime.now()
    last = row.last_seen_at
    stale = True
    if last:
        try:
            stale = (now - datetime.fromisoformat(last)).total_seconds() > _SESSION_TOUCH_INTERVAL_S
        except (ValueError, TypeError):
            stale = True
    if stale:
        row.last_seen_at = now.isoformat(timespec="seconds")
        db.session.commit()
    return True


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


def get_request_is_platform():
    """True when the signed-in user is a platform super-admin (cached at login)."""
    return bool(session.get(SESSION_PLATFORM))


def is_authenticated():
    """True when the request carries a signed-in session.

    A role the app no longer recognises still counts as "identified" — it is
    simply allowed nowhere, so it gets a 403. Only a request with no session at
    all is anonymous.
    """
    return bool(get_request_role())


def require_platform_admin(fn):
    """Gate a view to platform super-admins on the platform host only. A normal
    org user (even an org admin) gets 403; so does a platform admin reaching it
    from an org subdomain."""
    from utils.tenant_host import is_platform_host

    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not is_authenticated():
            return jsonify({"error": "Authentication required"}), 401
        if not (get_request_is_platform() and is_platform_host()):
            return jsonify({"error": "Insufficient permissions"}), 403
        return fn(*args, **kwargs)
    return wrapper


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
    # Desktop first-run: is the local database empty, and create the first admin.
    # Both are self-closing — once any user exists, needs-setup is False and setup
    # returns 409 — so they are inert on any provisioned (web) deployment.
    "auth.needs_setup",
    "auth.setup",
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
    # Push notifications need the (public) VAPID key before a subscription exists.
    "notifications.vapid_public_key",
    # The login screen greets the workspace by its subdomain before anyone signs in.
    "tenant.current_tenant",
    # Invite-only onboarding: an invitee validates and accepts their invitation
    # before they have any account or session. The org and role are fixed by the
    # (hashed) token, never the request, so this stays safe without a session.
    "invitations.validate_invitation",
    "invitations.accept_invitation",
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

        # This specific device's session may have been revoked (from another
        # device) even though the account is fine — sign it out on its next call.
        if not session_is_live():
            set_current_org(None)
            session.clear()  # the row is already revoked; just drop the cookie
            return jsonify({"error": "Authentication required"}), 401

        # Bind this request to the user's organisation so the tenant filter/stamp
        # (tenant.py) scope every subsequent query and insert to it.
        set_current_org(user.org_id)

        # Confine a platform super-admin (NULL org → unfiltered) to the platform
        # console on the platform host, so their cross-org reach can never land on
        # an ordinary tenant endpoint.
        if user.is_platform_admin:
            from utils.tenant_host import is_platform_host
            allowed = endpoint.startswith("platform.") or endpoint in PLATFORM_SELF_ENDPOINTS
            if not (is_platform_host() and allowed):
                return jsonify({"error": "Insufficient permissions"}), 403

        # Org-membership enforcement (only for users that belong to an org):
        #   * a suspended workspace locks its users out everywhere — end their
        #     session so the SPA's 401 handler returns them to login;
        #   * on an org subdomain the session must belong to *that* org, closing
        #     cross-subdomain cookie replay if the cookie is ever domain-scoped.
        # Inert on a bare host (localhost/apex): no slug resolves, so single-tenant
        # deployments and the existing tests are unaffected.
        if user.org_id is not None:
            from models import Organization
            from utils.tenant_host import org_slug_from_host
            with unfiltered():
                user_org = Organization.query.get(user.org_id)
            if user_org is not None and not user_org.is_active:
                set_current_org(None)
                end_session()
                return jsonify({"error": "This workspace is suspended",
                                "code": "org_suspended"}), 401
            host_slug = org_slug_from_host(request.host)
            if host_slug is not None and (user_org is None or user_org.slug != host_slug):
                set_current_org(None)
                return jsonify({"error": "Authentication required"}), 401

        # An expired password locks the account to the change-password flow: the
        # user has a valid session but cannot do anything else until they rotate.
        if endpoint not in PASSWORD_CHANGE_EXEMPT and password_expired(user):
            return jsonify({
                "error": "Your password has expired. Please set a new one.",
                "code": "password_expired",
            }), 403

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
