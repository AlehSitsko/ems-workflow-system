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
    CORS(app)
    db.init_app(app)
    migrate.init_app(app, db)
    limiter.init_app(app)
