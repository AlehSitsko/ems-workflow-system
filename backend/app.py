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


# All API blueprints, registered in order by the factory.
BLUEPRINTS = [
    auth_bp, employee_bp, crew_bp, crew_preset_bp, vehicle_bp, patient_bp,
    call_bp, analytics_bp, dispatch_bp, notif_bp, time_bp, payroll_bp,
    doc_bp, audit_bp, settings_bp, task_bp, calendar_bp, taxonomy_bp, leave_bp, operations_bp, recurring_bp,
    reports_bp, calendar_event_bp,
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


def register_core_routes(app):
    @app.route("/")
    def home():
        return jsonify({"message": "EMS Workflow System backend is running"})

    @app.route("/api/health")
    def health_check():
        return jsonify({"status": "ok", "service": "ems-workflow-system-backend"})


def create_app(config_overrides=None):
    """Build and return a configured Flask app.

    `config_overrides` (a dict) is applied after the base Config — tests use it
    to point at an in-memory database and disable rate limiting.
    """
    app = Flask(__name__)
    app.config.from_object(Config)
    if config_overrides:
        app.config.update(config_overrides)

    # Logging first, so anything the rest of setup logs is already formatted and
    # the request access log is in place before the first request.
    configure_logging(app)

    init_extensions(app)
    register_blueprints(app)
    register_error_handlers(app)
    register_core_routes(app)
    register_cli_commands(app)

    # Authentication is the default for /api/: a route is protected unless it is
    # named in PUBLIC_ENDPOINTS. Registered after the blueprints so it covers
    # every route they added.
    register_api_auth_guard(app)

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
