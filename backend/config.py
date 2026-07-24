"""Application configuration.

A single base Config read from the environment. The application factory
(`create_app`) loads this and then applies any per-call overrides (tests pass an
in-memory database and disable rate limiting this way), so there is no hidden,
import-time configuration or database access.
"""

import os
import secrets


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
    key = os.environ.get("SECRET_KEY")
    if key:
        return key

    if os.environ.get("EMS_ENV") == "production":
        raise RuntimeError(
            "SECRET_KEY must be set when EMS_ENV=production. Session cookies are "
            "signed with it: without a stable key, every restart and every worker "
            "would reject the sessions the others issued."
        )

    return secrets.token_hex(32)


class Config:
    # DATABASE_URL lets tests / Docker point this elsewhere without touching the
    # local dev default. Relative sqlite paths resolve under the Flask instance
    # folder (backend/instance/).
    SQLALCHEMY_DATABASE_URI = os.environ.get("DATABASE_URL", "sqlite:///database.db")
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # ── Session authentication ───────────────────────────────────────────────
    # Signs the session cookie. See _dev_secret_key for why there is no
    # committed default.
    SECRET_KEY = _dev_secret_key()

    # The cookie is unreadable from JavaScript, so a cross-site scripting bug
    # cannot walk off with the session the way it could with a token in
    # localStorage.
    SESSION_COOKIE_HTTPONLY = True

    # "Lax" still sends the cookie on top-level navigation to the app but not on
    # cross-site POSTs, which removes the most common CSRF shape on its own.
    SESSION_COOKIE_SAMESITE = "Lax"

    # HTTPS-only in production. Off in development because the dev server is
    # plain HTTP and a Secure cookie would simply never be sent.
    SESSION_COOKIE_SECURE = os.environ.get("EMS_ENV") == "production"

    # Sessions expire rather than living forever; an EMS console is often left
    # signed in on a shared machine.
    PERMANENT_SESSION_LIFETIME = int(os.environ.get("SESSION_LIFETIME_SECONDS", 12 * 60 * 60))

    # ── CORS ─────────────────────────────────────────────────────────────────
    # An explicit allowlist. Credentialed requests cannot use a wildcard origin
    # at all, so this has to be a real list — which is the point.
    CORS_ORIGINS = [
        o.strip() for o in os.environ.get(
            "CORS_ORIGINS",
            "http://127.0.0.1:5173,http://localhost:5173",
        ).split(",") if o.strip()
    ]
