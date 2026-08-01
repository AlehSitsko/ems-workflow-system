"""Shared Flask extensions and their initialization.

Extensions are instantiated once at import (with no app bound) and attached to a
specific app inside the factory via `init_extensions`, so the same code path
serves the dev server, the CLI, and isolated test apps.
"""

from flask_cors import CORS
from flask_migrate import Migrate
from sqlalchemy import event
from sqlalchemy.engine import Engine

from models import db
from limiter import limiter
import tenant  # noqa: F401 — importing registers the tenant isolation ORM events

migrate = Migrate()


# SQLite does not enforce foreign key constraints unless told to per-connection.
# Registered on the global Engine class, so it applies to every connection the
# app (or a migration) opens.
@event.listens_for(Engine, "connect")
def _enable_sqlite_foreign_keys(dbapi_connection, connection_record):
    if dbapi_connection.__class__.__module__.startswith("sqlite3"):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


def init_extensions(app):
    """Bind all extensions to the given app instance."""
    # An explicit origin allowlist, with credentials enabled so the browser
    # sends the session cookie. This used to be a bare `CORS(app)`, which allows
    # every origin — harmless while identity was a header the caller typed
    # anyway, but with cookie auth it would let any site on the internet make
    # authenticated requests as whoever is signed in.
    #
    # A wildcard is not merely discouraged here: the browser refuses to combine
    # `Access-Control-Allow-Origin: *` with credentials at all, so the allowlist
    # is enforced by the spec as well as by intent.
    # Multi-tenancy reaches each org at its own subdomain, so the allowlist is the
    # static entries plus a regex matching any subdomain of BASE_DOMAIN (and the
    # apex/platform host), on any port. Still an allowlist — a wildcard cannot be
    # combined with credentials — just one that admits the tenant subdomains.
    import re
    base = re.escape(app.config.get("BASE_DOMAIN", "localhost"))
    subdomain_origin = re.compile(rf"^https?://([a-z0-9-]+\.)?{base}(:\d+)?$")
    CORS(
        app,
        origins=list(app.config.get("CORS_ORIGINS", [])) + [subdomain_origin],
        supports_credentials=True,
    )
    db.init_app(app)
    migrate.init_app(app, db)
    limiter.init_app(app)
