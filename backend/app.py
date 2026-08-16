"""Application factory for the EMS Workflow System backend.

`create_app()` builds a fully configured Flask app with no import-time side
effects — importing this module does not open the database or seed data. Demo
users are created explicitly via the `seed-demo` CLI command (see cli.py).

Run the dev server:
    python app.py
    # or: flask --app app run --port 5050

CLI (migrations, seeding) — Flask auto-detects the create_app factory:
    flask --app app db upgrade
    flask --app app seed-demo
"""

import os

from dotenv import load_dotenv
load_dotenv()

from flask import Flask, jsonify
from werkzeug.exceptions import HTTPException

from config import Config
from extensions import init_extensions
from models import db
from cli import register_cli_commands
from utils.auth_utils import register_api_auth_guard
from logging_config import configure_logging
from metrics import configure_metrics

from routes.auth_routes import auth_bp
from routes.employee_routes import employee_bp
from routes.crew_routes import crew_bp
from routes.crew_preset_routes import crew_preset_bp
from routes.vehicle_routes import vehicle_bp
from routes.patient_routes import patient_bp
from routes.call_routes import call_bp
from routes.analytics_routes import analytics_bp
from routes.dispatch_routes import dispatch_bp
from routes.notification_routes import notif_bp
from routes.time_routes import time_bp
from routes.payroll_routes import payroll_bp
from routes.document_routes import doc_bp
from routes.audit_routes import audit_bp
from routes.settings_routes import settings_bp
from routes.task_routes import task_bp
from routes.calendar_routes import calendar_bp
from routes.leave_routes import leave_bp
from routes.operations_routes import operations_bp
from routes.recurring_routes import recurring_bp
from routes.taxonomy_routes import taxonomy_bp
from routes.reports_routes import reports_bp
from routes.calendar_event_routes import calendar_event_bp
from routes.portal_routes import portal_bp
from routes.platform_routes import platform_bp
from routes.tenant_routes import tenant_bp
from routes.pto_routes import pto_bp
from routes.holiday_routes import holiday_bp
from routes.invitation_routes import invitation_bp
from routes.org_security_routes import org_security_bp
from routes.events_routes import events_bp


# All API blueprints, registered in order by the factory.
BLUEPRINTS = [
    auth_bp, employee_bp, crew_bp, crew_preset_bp, vehicle_bp, patient_bp,
    call_bp, analytics_bp, dispatch_bp, notif_bp, time_bp, payroll_bp,
    doc_bp, audit_bp, settings_bp, task_bp, calendar_bp, taxonomy_bp, leave_bp, operations_bp, recurring_bp,
    reports_bp, calendar_event_bp, portal_bp, platform_bp, tenant_bp,
    pto_bp, holiday_bp, invitation_bp, org_security_bp, events_bp,
]


def register_blueprints(app):
    for blueprint in BLUEPRINTS:
        app.register_blueprint(blueprint)


def register_error_handlers(app):
    @app.errorhandler(429)
    def ratelimit_handler(e):
        return jsonify({"error": "Too many login attempts. Please wait a minute and try again."}), 429

    # This is a JSON API (the frontend is a separate Vite app), so 404/405 must
    # come back as JSON rather than Werkzeug's default HTML page. This covers both
    # get_or_404() lookups and requests to unmatched routes/methods in one place.
    @app.errorhandler(404)
    def not_found_handler(e):
        return jsonify({"error": "Resource not found"}), 404

    @app.errorhandler(405)
    def method_not_allowed_handler(e):
        return jsonify({"error": "Method not allowed"}), 405

    # Catch-all for unhandled exceptions — returns clean JSON instead of an
    # HTML/stack-trace page. HTTPExceptions (400/403/404/409/429/...) already
    # carry a meaningful status/body from the route itself, so they pass through.
    @app.errorhandler(Exception)
    def handle_unexpected_error(error):
        if isinstance(error, HTTPException):
            return error
        db.session.rollback()
        app.logger.exception(error)
        return jsonify({"error": "Internal server error"}), 500


def register_spa(app, spa_dir):
    """Serve the built frontend (dist/) from the backend, under its base path.

    Only used by the desktop build (env EMS_SERVE_SPA = absolute path to dist), so
    the Electron window can load the SPA and call the API on **one** loopback
    origin — keeping the SameSite=Lax session cookie and CSRF exactly as they work
    in the web build, instead of a second origin that would silently drop cookies.
    The web deployments are unaffected (Nginx serves the SPA in prod, Vite in dev).
    The app uses HashRouter, so the server only ever serves index.html and the
    static assets under the base path — client routes live after the URL '#'.
    """
    from flask import send_from_directory

    base = "/ems-workflow-system"

    @app.route(f"{base}/")
    @app.route(f"{base}/<path:path>")
    def _spa(path=""):
        candidate = os.path.join(spa_dir, path)
        if path and os.path.isfile(candidate):
            return send_from_directory(spa_dir, path)
        return send_from_directory(spa_dir, "index.html")


def register_core_routes(app):
    @app.route("/")
    def home():
        # In the desktop build, land on the app instead of the JSON banner.
        if app.config.get("SERVE_SPA_DIR"):
            from flask import redirect
            return redirect("/ems-workflow-system/")
        return jsonify({"message": "EMS Workflow System backend is running"})

    @app.route("/api/health")
    def health_check():
        # `qa_mode` is a diagnostic flag (Config.QA_MODE): it lets the live QA and
        # stress runners confirm they are pointed at a disposable QA backend before
        # they write anything, and is False for every normal dev/production server.
        return jsonify({
            "status": "ok",
            "service": "ems-workflow-system-backend",
            "qa_mode": bool(app.config.get("QA_MODE")),
        })


def _warn_if_schema_behind(app):
    """Log a loud warning when the database is behind the migration head.

    A stale dev/prod DB otherwise surfaces as opaque 500s the moment the ORM
    selects a column a newer model defines but the database lacks (e.g. a login
    query after User gained a column). This makes the real cause obvious at
    startup and names the fix. Never raises — a diagnostic must not break boot.
    Skipped for tests and in-memory DBs (they use create_all, no alembic_version).
    """
    if app.config.get("TESTING"):
        return
    if ":memory:" in (app.config.get("SQLALCHEMY_DATABASE_URI") or ""):
        return
    try:
        from alembic.script import ScriptDirectory
        from alembic.config import Config as AlembicConfig
        from sqlalchemy import inspect as sa_inspect, text
        from models import db

        migrations_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "migrations")
        cfg = AlembicConfig()
        cfg.set_main_option("script_location", migrations_dir)
        heads = set(ScriptDirectory.from_config(cfg).get_heads())

        with app.app_context():
            engine = db.engine
            if "alembic_version" not in sa_inspect(engine).get_table_names():
                return  # uninitialised DB — nothing to compare
            with engine.connect() as conn:
                current = {r[0] for r in conn.execute(text("SELECT version_num FROM alembic_version"))}

        if current and current != heads:
            app.logger.warning(
                "Database schema is behind the code (DB at %s, migration head %s). "
                "Run `flask db upgrade`; until then, requests touching new columns "
                "will fail with 500 Internal Server Error.",
                ", ".join(sorted(current)), ", ".join(sorted(heads)),
            )
    except Exception:
        app.logger.debug("schema-drift check skipped", exc_info=True)


def _require_encryption_in_production(app):
    """Fail closed: in production, sensitive fields must be encrypted at rest, so a
    valid EMS_MASTER_KEY is mandatory. Missing or malformed -> refuse to start with
    an actionable message (never echoing the key), so a cloud deployment can never
    silently store PHI in plaintext. Local/standalone keeps the plaintext fallback
    for convenience (EMS_ENV unset), and tests opt out via TESTING.
    """
    if app.config.get("TESTING"):
        return
    if os.environ.get("EMS_ENV") != "production":
        return
    from core.security.keyring import load_master_keys, KeyManagementError
    try:
        keys = load_master_keys()
    except KeyManagementError as exc:
        raise RuntimeError(
            f"Refusing to start: {exc} Provide a valid EMS_MASTER_KEY (or "
            "EMS_MASTER_KEY_FILE) so sensitive fields are encrypted at rest in "
            "production."
        ) from exc
    if not keys:
        raise RuntimeError(
            "Refusing to start: EMS_MASTER_KEY is required when EMS_ENV=production, "
            "so sensitive fields (patient member id, policy number, insurance notes) "
            "are encrypted at rest. Provide a base64 32-byte key via EMS_MASTER_KEY "
            "or a mounted EMS_MASTER_KEY_FILE. (Local/standalone runs without it and "
            "stores those fields as plaintext by design.)"
        )


def create_app(config_overrides=None):
    """Build and return a configured Flask app.

    `config_overrides` (a dict) is applied after the base Config — tests use it
    to point at an in-memory database and disable rate limiting.
    """
    # The desktop (Electron) build points the instance folder at the Windows
    # user-data directory so the database and uploads live outside the install
    # dir / app.asar and survive updates. EMS_INSTANCE_PATH must be absolute; the
    # web/dev/test paths are unaffected when it is unset. Relative sqlite URLs and
    # storage.py both resolve under instance_path, so this one knob relocates both.
    instance_path = os.environ.get("EMS_INSTANCE_PATH")
    if instance_path:
        app = Flask(__name__, instance_path=os.path.abspath(instance_path))
    else:
        app = Flask(__name__)
    app.config.from_object(Config)
    if config_overrides:
        app.config.update(config_overrides)

    # Logging first, so anything the rest of setup logs is already formatted and
    # the request access log is in place before the first request.
    configure_logging(app)
    # Metrics hooks (request count + latency) and the /metrics scrape endpoint.
    configure_metrics(app)

    # Desktop build only: serve the bundled SPA from this backend so the UI and
    # the API share one loopback origin (see register_spa). Unset for web/dev/test.
    spa_dir = os.environ.get("EMS_SERVE_SPA")
    if spa_dir:
        app.config["SERVE_SPA_DIR"] = os.path.abspath(spa_dir)

    init_extensions(app)
    register_blueprints(app)
    register_error_handlers(app)
    register_core_routes(app)
    if app.config.get("SERVE_SPA_DIR"):
        register_spa(app, app.config["SERVE_SPA_DIR"])
    register_cli_commands(app)

    # Authentication is the default for /api/: a route is protected unless it is
    # named in PUBLIC_ENDPOINTS. Registered after the blueprints so it covers
    # every route they added.
    register_api_auth_guard(app)

    # Fail closed: production must have a valid encryption master key.
    _require_encryption_in_production(app)

    # Diagnostic: warn (never fail) if the DB is behind the migration head.
    _warn_if_schema_behind(app)

    return app


if __name__ == "__main__":
    app = create_app()
    # Loopback by default: a development server should not be reachable from the
    # network unless that is asked for. A container has to bind 0.0.0.0 to be
    # reachable from the host at all, so it sets FLASK_RUN_HOST — the default
    # stays unchanged for everyone running this directly.
    app.run(
        host=os.environ.get("FLASK_RUN_HOST", "127.0.0.1"),
        port=int(os.environ.get("FLASK_RUN_PORT", "5050")),
        debug=os.environ.get("FLASK_DEBUG") == "1",
    )
