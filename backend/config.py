"""Application configuration.

A single base Config read from the environment. The application factory
(`create_app`) loads this and then applies any per-call overrides (tests pass an
in-memory database and disable rate limiting this way), so there is no hidden,
import-time configuration or database access.
"""

import os
import secrets


def _secret(name):
    """A secret from `{NAME}_FILE` (a mounted file) or the `{NAME}` environment
    variable, in that order; None if neither is set.

    The file convention (Docker/Kubernetes secrets mount the value as a file) is
    preferred because it keeps the value out of the process environment, where it
    can leak into `docker inspect`, a crash dump, or a child process's env.
    """
    path = os.environ.get(f"{name}_FILE")
    if path:
        try:
            with open(path, "r", encoding="utf-8") as handle:
                value = handle.read().strip()
            if value:
                return value
        except OSError:
            pass  # unreadable secret file → fall back to the env var
    return os.environ.get(name)


def _dev_secret_key():
    """A per-process key for local development.

    Generated rather than hard-coded: a committed default is the one everyone
    forgets to change, and a published one would let anyone forge a session
    cookie for any deployment that kept it. The cost is that restarting the dev
    server signs users out, which is the right trade for a development default.

    `EMS_ENV=production` refuses to start without a real key instead of quietly
    generating one — sessions would otherwise be invalidated by every restart and
    by every worker in a multi-process server.
    """
    key = _secret("SECRET_KEY")
    if key:
        return key

    if os.environ.get("EMS_ENV") == "production":
        raise RuntimeError(
            "SECRET_KEY must be set when EMS_ENV=production. Session cookies are "
            "signed with it: without a stable key, every restart and every worker "
            "would reject the sessions the others issued."
        )

    return secrets.token_hex(32)


def _secret_key_fallbacks():
    """Old signing keys still accepted for *verifying* existing cookies, so
    `SECRET_KEY` can be rotated without signing everyone out at once (Flask ≥3.1).

    New cookies are always signed with the current `SECRET_KEY`; each key here is
    tried, in order, only when the current key fails to unsign a cookie. Rotate by
    moving the outgoing key into this list, then dropping it once the session
    lifetime has elapsed. Read from `SECRET_KEY_FALLBACKS_FILE` (one key per line, a
    mounted secret) or the comma-separated `SECRET_KEY_FALLBACKS` env var.
    """
    raw_file = os.environ.get("SECRET_KEY_FALLBACKS_FILE")
    if raw_file:
        try:
            with open(raw_file, "r", encoding="utf-8") as handle:
                keys = [line.strip() for line in handle if line.strip()]
            if keys:
                return keys
        except OSError:
            pass
    raw = os.environ.get("SECRET_KEY_FALLBACKS")
    if raw:
        keys = [k.strip() for k in raw.split(",") if k.strip()]
        if keys:
            return keys
    return None


class Config:
    # DATABASE_URL lets tests / Docker point this elsewhere without touching the
    # local dev default; DATABASE_URL_FILE (a mounted secret) takes precedence, so
    # the connection string — which carries the DB password — need not sit in the
    # environment. Relative sqlite paths resolve under backend/instance/.
    SQLALCHEMY_DATABASE_URI = _secret("DATABASE_URL") or "sqlite:///database.db"
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # Cap the request body so an oversized upload is refused (413) by the framework
    # before it is buffered, rather than only by the document route's own 10 MB
    # check after the fact. 16 MB leaves headroom over that limit for multipart
    # overhead; no other endpoint needs a large body.
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024

    # ── Session authentication ───────────────────────────────────────────────
    # Signs the session cookie. See _dev_secret_key for why there is no
    # committed default.
    SECRET_KEY = _dev_secret_key()
    # Old keys still accepted for verifying (not signing) cookies during a rotation
    # window — see _secret_key_fallbacks. Flask ignores this when it is None.
    SECRET_KEY_FALLBACKS = _secret_key_fallbacks()

    # The cookie is unreadable from JavaScript, so a cross-site scripting bug
    # cannot walk off with the session the way it could with a token in
    # localStorage.
    SESSION_COOKIE_HTTPONLY = True

    # "Lax" still sends the cookie on top-level navigation to the app but not on
    # cross-site POSTs, which removes the most common CSRF shape on its own.
    SESSION_COOKIE_SAMESITE = "Lax"

    # HTTPS-only in production. Off in development because the dev server is
    # plain HTTP and a Secure cookie would simply never be sent. `SESSION_COOKIE_SECURE`
    # can override the default explicitly — needed to smoke-test the production
    # stack over plain HTTP locally, where a Secure cookie would break login.
    SESSION_COOKIE_SECURE = os.environ.get(
        "SESSION_COOKIE_SECURE",
        "1" if os.environ.get("EMS_ENV") == "production" else "0",
    ).lower() in ("1", "true", "yes")

    # Sessions expire rather than living forever; an EMS console is often left
    # signed in on a shared machine.
    PERMANENT_SESSION_LIFETIME = int(os.environ.get("SESSION_LIFETIME_SECONDS", 12 * 60 * 60))

    # Force a password change once it reaches this age in days. 0 disables rotation
    # (the default, so dev and existing deployments are unchanged); set e.g. 90 in
    # production. When enabled, a signed-in user whose password has expired can only
    # reach the change-password, /me and logout endpoints until they rotate it.
    PASSWORD_MAX_AGE_DAYS = int(os.environ.get("PASSWORD_MAX_AGE_DAYS", "0"))

    # Refuse a new password that matches any of the user's last N passwords. 0
    # disables the history check (the default) — a change still refuses reuse of the
    # *current* password regardless. Past hashes are always recorded, so raising
    # this later takes effect immediately with the history already on hand.
    PASSWORD_HISTORY_DEPTH = int(os.environ.get("PASSWORD_HISTORY_DEPTH", "0"))

    # ── Multi-tenancy (subdomain routing) ────────────────────────────────────
    # The apex the org subdomains sit under (`acme.<BASE_DOMAIN>` → org "acme").
    # `localhost` is the dev default because *.localhost resolves to 127.0.0.1 on
    # most systems, so `acme.localhost` needs no DNS. A host that is exactly the
    # base domain (or has no subdomain label) resolves to *no* org — the app then
    # behaves as the single-tenant it was before, which keeps existing tests and
    # deployments working. PLATFORM_HOST is where the cross-org super-admin console
    # lives and is never treated as an org subdomain.
    BASE_DOMAIN = os.environ.get("BASE_DOMAIN", "localhost")
    PLATFORM_HOST = os.environ.get("PLATFORM_HOST", "admin.localhost")

    # ── CORS ─────────────────────────────────────────────────────────────────
    # An explicit allowlist. Credentialed requests cannot use a wildcard origin
    # at all, so this has to be a real list — which is the point.
    CORS_ORIGINS = [
        o.strip() for o in os.environ.get(
            "CORS_ORIGINS",
            "http://127.0.0.1:5173,http://localhost:5173",
        ).split(",") if o.strip()
    ]
