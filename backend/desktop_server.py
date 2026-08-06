"""Backend entry point for the standalone (Electron) desktop build.

Responsibilities, in order:
  1. Resolve the Windows user-data paths passed by the Electron main process
     (database / uploads live under EMS_INSTANCE_PATH; never the install dir).
  2. Create the app, apply Alembic migrations to head (so a fresh or upgraded DB
     reaches the current schema before anything serves).
  3. Put SQLite in WAL mode (better concurrency/durability for a desktop file DB).
  4. Serve on 127.0.0.1:<port> via waitress — a production WSGI server, never the
     Flask dev server, and loopback-only so nothing on the network can reach it.

If migrations fail it exits non-zero *before* serving, so the desktop app never
runs against a half-migrated database (the Electron side shows a recovery screen).

Env (set by the Electron main process):
  EMS_DESKTOP_PORT   required — the ephemeral port to bind
  EMS_INSTANCE_PATH  required — Flask instance dir (uploads + relative sqlite)
  DATABASE_URL       required — absolute sqlite URL for the user's database
"""

import os
import sys


def _log(msg):
    # Plain stdout; the Electron main process captures this into its log file.
    print(f"[desktop_server] {msg}", flush=True)


def _base_dir():
    # When frozen by PyInstaller the migrations are bundled under _MEIPASS; in a
    # normal checkout they sit next to this file.
    if getattr(sys, "frozen", False):
        return sys._MEIPASS
    return os.path.dirname(os.path.abspath(__file__))


def _apply_migrations(app):
    from flask_migrate import upgrade
    migrations_dir = os.path.join(_base_dir(), "migrations")
    with app.app_context():
        upgrade(directory=migrations_dir)


def _enable_wal(app):
    from sqlalchemy import text
    from models import db
    uri = app.config.get("SQLALCHEMY_DATABASE_URI", "")
    if not uri.startswith("sqlite"):
        return
    with app.app_context():
        db.session.execute(text("PRAGMA journal_mode=WAL"))
        db.session.execute(text("PRAGMA foreign_keys=ON"))
        db.session.commit()


def build_app():
    port = os.environ.get("EMS_DESKTOP_PORT")
    instance_path = os.environ.get("EMS_INSTANCE_PATH")
    database_url = os.environ.get("DATABASE_URL")
    if not port or not instance_path or not database_url:
        _log("FATAL: EMS_DESKTOP_PORT, EMS_INSTANCE_PATH and DATABASE_URL are required")
        sys.exit(2)

    # Make sure the data directories exist before the DB/uploads touch them.
    os.makedirs(instance_path, exist_ok=True)
    os.makedirs(os.path.join(instance_path, "uploads", "documents"), exist_ok=True)
    if database_url.startswith("sqlite:///"):
        db_file = database_url[len("sqlite:///"):]
        os.makedirs(os.path.dirname(os.path.abspath(db_file)), exist_ok=True)

    from app import create_app
    app = create_app()

    _log(f"instance_path={app.instance_path}")
    _log(f"database={app.config.get('SQLALCHEMY_DATABASE_URI')}")
    try:
        _apply_migrations(app)
        _log("migrations: at head")
    except Exception as exc:  # noqa: BLE001 - surface the reason and refuse to serve
        _log(f"FATAL: migration failed: {exc}")
        sys.exit(3)
    _enable_wal(app)
    return app, int(port)


def main():
    app, port = build_app()
    from waitress import serve
    _log(f"serving on http://127.0.0.1:{port}")
    serve(app, host="127.0.0.1", port=port, threads=8, _quiet=True)


if __name__ == "__main__":
    main()
