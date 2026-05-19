from flask import Flask, jsonify, request
from flask_cors import CORS
from werkzeug.security import generate_password_hash

from models import (
    db,
    Patient,
    Call,
    User,
)

from routes.auth_routes import auth_bp
from routes.employee_routes import employee_bp
from routes.crew_routes import crew_bp
from routes.crew_preset_routes import crew_preset_bp
from routes.patient_routes import patient_bp
from routes.call_routes import call_bp

app = Flask(__name__)
CORS(app)

# Local SQLite database configuration.
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///database.db"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

# Connect SQLAlchemy to the Flask app.
db.init_app(app)

# Register authentication and user management routes.
app.register_blueprint(auth_bp)

# Register employee management routes.
app.register_blueprint(employee_bp)

# Register daily crew unit routes.
app.register_blueprint(crew_bp)

# Register reusable crew preset routes.
app.register_blueprint(crew_preset_bp)

# Register patient management routes.
app.register_blueprint(patient_bp)

# Register call history and call intake routes.
app.register_blueprint(call_bp)

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

def split_missing_fields(value):
    if not value:
        return []

    return [
        item.strip()
        for item in value.split(",")
        if item.strip()
    ]


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
# ANALYTICS ROUTES
# =========================

@app.route("/api/analytics/dispatchers", methods=["GET"])
def get_dispatcher_analytics():
    calls = Call.query.all()

    analytics = {}

    for call in calls:
        dispatcher = call.dispatcher_name or "Unknown"

        if dispatcher not in analytics:
            analytics[dispatcher] = {
                "dispatcher_name": dispatcher,
                "total_calls": 0,
                "quality_score_sum": 0,
                "quality_score_count": 0,
                "missing_critical_count": 0,
                "missing_optional_count": 0,
                "calls_with_missing_critical": 0,
                "calls_with_explanation": 0,
            }

        dispatcher_stats = analytics[dispatcher]

        dispatcher_stats["total_calls"] += 1

        if call.quality_score is not None:
            dispatcher_stats["quality_score_sum"] += call.quality_score
            dispatcher_stats["quality_score_count"] += 1

        missing_critical_fields = split_missing_fields(
            call.missing_critical_fields
        )
        missing_optional_fields = split_missing_fields(
            call.missing_optional_fields
        )

        dispatcher_stats["missing_critical_count"] += len(missing_critical_fields)
        dispatcher_stats["missing_optional_count"] += len(missing_optional_fields)

        if missing_critical_fields:
            dispatcher_stats["calls_with_missing_critical"] += 1

        if call.missing_info_explanation:
            dispatcher_stats["calls_with_explanation"] += 1

    result = []

    for dispatcher_stats in analytics.values():
        score_count = dispatcher_stats["quality_score_count"]

        if score_count > 0:
            average_quality_score = round(
                dispatcher_stats["quality_score_sum"] / score_count
            )
        else:
            average_quality_score = None

        result.append({
            "dispatcher_name": dispatcher_stats["dispatcher_name"],
            "total_calls": dispatcher_stats["total_calls"],
            "average_quality_score": average_quality_score,
            "missing_critical_count": dispatcher_stats["missing_critical_count"],
            "missing_optional_count": dispatcher_stats["missing_optional_count"],
            "calls_with_missing_critical": dispatcher_stats[
                "calls_with_missing_critical"
            ],
            "calls_with_explanation": dispatcher_stats["calls_with_explanation"],
        })

    result.sort(
        key=lambda item: item["average_quality_score"] or 0,
        reverse=True
    )

    return jsonify(result)


# =========================
# INIT DB
# =========================

with app.app_context():
    db.create_all()
    create_default_users()


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5050, debug=True)