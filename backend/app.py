from flask import Flask, jsonify
from flask_cors import CORS
from werkzeug.security import generate_password_hash

from models import db, User

from routes.auth_routes import auth_bp
from routes.employee_routes import employee_bp
from routes.crew_routes import crew_bp
from routes.crew_preset_routes import crew_preset_bp
from routes.patient_routes import patient_bp
from routes.call_routes import call_bp
from routes.analytics_routes import analytics_bp
from routes.dispatch_routes import dispatch_bp


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

# Register supervisor analytics routes.
app.register_blueprint(analytics_bp)

# Register dispatch board routes.
app.register_blueprint(dispatch_bp)


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
    db.create_all()
    create_default_users()


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5050, debug=True)