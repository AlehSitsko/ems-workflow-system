import os
from dotenv import load_dotenv
load_dotenv()

from flask import Flask, jsonify
from flask_cors import CORS
from flask_migrate import Migrate
from werkzeug.exceptions import HTTPException
from werkzeug.security import generate_password_hash
from sqlalchemy import event
from sqlalchemy.engine import Engine

from limiter import limiter

from models import db, User


# SQLite does not enforce foreign key constraints unless told to per-connection.
@event.listens_for(Engine, "connect")
def _enable_sqlite_foreign_keys(dbapi_connection, connection_record):
    if dbapi_connection.__class__.__module__.startswith("sqlite3"):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

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


app = Flask(__name__)
CORS(app)

# Local SQLite database configuration. DATABASE_URL lets tests point this at
# an in-memory database without touching the dev/prod default.
app.config["SQLALCHEMY_DATABASE_URI"] = os.environ.get("DATABASE_URL", "sqlite:///database.db")
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

# Connect SQLAlchemy to the Flask app.
db.init_app(app)

# Alembic migrations via Flask-Migrate.
migrate = Migrate(app, db)

# Rate limiter — in-memory storage, keyed by client IP.
limiter.init_app(app)

@app.errorhandler(429)
def ratelimit_handler(e):
    return jsonify({"error": "Too many login attempts. Please wait a minute and try again."}), 429


# Catch-all for unhandled exceptions — returns clean JSON instead of an HTML/stack-trace
# page. HTTPExceptions (400/403/404/409/429/...) already carry a meaningful status/body
# from the route itself, so they pass through unchanged.
@app.errorhandler(Exception)
def handle_unexpected_error(error):
    if isinstance(error, HTTPException):
        return error
    db.session.rollback()
    app.logger.exception(error)
    return jsonify({"error": "Internal server error"}), 500

# Register authentication and user management routes.
app.register_blueprint(auth_bp)

# Register employee management routes.
app.register_blueprint(employee_bp)

# Register daily crew unit routes.
app.register_blueprint(crew_bp)

# Register reusable crew preset routes.
app.register_blueprint(crew_preset_bp)

# Register vehicle registry routes.
app.register_blueprint(vehicle_bp)

# Register patient management routes.
app.register_blueprint(patient_bp)

# Register call history and call intake routes.
app.register_blueprint(call_bp)

# Register supervisor analytics routes.
app.register_blueprint(analytics_bp)

# Register dispatch board routes.
app.register_blueprint(dispatch_bp)

# Register notification routes.
app.register_blueprint(notif_bp)

# Register time tracking routes.
app.register_blueprint(time_bp)

# Register payroll period and export routes.
app.register_blueprint(payroll_bp)

# Register HR document routes.
app.register_blueprint(doc_bp)

# Register audit log routes.
app.register_blueprint(audit_bp)

# Register per-user settings routes.
app.register_blueprint(settings_bp)

# Register staff task management routes.
app.register_blueprint(task_bp)


@app.route("/")
def home():
    return jsonify({
        "message": "EMS Workflow System backend is running"
    })


@app.route("/api/health")
def health_check():
    return jsonify({
        "status": "ok",
        "service": "ems-workflow-system-backend"
    })


# =========================
# HELPER FUNCTIONS
# =========================

def create_default_users():
    default_users = [
        {
            "username": "admin",
            "password": "admin",
            "display_name": "Admin User",
            "role": "admin",
        },
        {
            "username": "supervisor",
            "password": "supervisor",
            "display_name": "Supervisor User",
            "role": "supervisor",
        },
        {
            "username": "dispatcher",
            "password": "dispatcher",
            "display_name": "Dispatcher User",
            "role": "dispatcher",
        },
        {
            "username": "hr",
            "password": "hr",
            "display_name": "HR User",
            "role": "hr",
        },
    ]

    for user_data in default_users:
        existing_user = User.query.filter_by(
            username=user_data["username"]
        ).first()

        if not existing_user:
            user = User(
                username=user_data["username"],
                password_hash=generate_password_hash(user_data["password"]),
                display_name=user_data["display_name"],
                role=user_data["role"],
                is_active=True,
            )

            db.session.add(user)

    db.session.commit()


# =========================
# INIT DB
# =========================

with app.app_context():
    # db.create_all() — disabled; use `flask db upgrade` for schema changes
    try:
        create_default_users()
    except Exception:
        pass  # schema not yet migrated; run flask db upgrade first


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5050, debug=os.environ.get("FLASK_DEBUG") == "1")