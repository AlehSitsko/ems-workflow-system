"""Disposable backend for the Playwright E2E suite.

Serves BOTH the built SPA and the API on one loopback origin (like the desktop
build), against a throwaway SQLite database that is migrated to head and seeded
with the demo users and dataset. Never touches the dev/production database.

Started by Playwright's `webServer` (see frontend/playwright.config.js):

    EMS_SERVE_SPA=<frontend/dist> EMS_QA=1 \\
        python e2e_server.py --port 5111 --db C:/temp/ems-e2e/ems.sqlite

Reports qa_mode=true on /api/health (Config.QA_MODE), so it can never be confused
with a real backend.
"""

import argparse
import os


def build_app(db_path):
    os.environ["EMS_QA"] = "1"  # marks /api/health qa_mode, disables nothing else
    # Short SSE keepalive so a disconnected test client's streaming thread frees
    # quickly (tests open/close many sessions serially; a 20 s park would starve
    # the thread pool).
    os.environ.setdefault("EMS_SSE_KEEPALIVE", "2")

    from app import create_app
    from models import db, User
    from werkzeug.security import generate_password_hash
    from cli import DEMO_USERS

    app = create_app({
        "QA_MODE": True,
        "RATELIMIT_ENABLED": False,
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{db_path}",
        "SESSION_COOKIE_SECURE": False,  # plain HTTP on loopback
    })

    with app.app_context():
        # Prove the real migration chain on a clean database (not create_all).
        from flask_migrate import upgrade
        upgrade(directory=os.path.join(os.path.dirname(os.path.abspath(__file__)), "migrations"))

        from tenant import ensure_default_org, set_current_org
        set_current_org(ensure_default_org())

        for spec in DEMO_USERS:
            if not User.query.filter_by(username=spec["username"]).first():
                db.session.add(User(
                    username=spec["username"],
                    password_hash=generate_password_hash(spec["password"], method="pbkdf2:sha256:1"),
                    display_name=spec["display_name"],
                    role=spec["role"],
                    is_active=True,
                ))
        db.session.commit()

        from demo_data import build_demo_dataset, has_demo_data
        if not has_demo_data():
            build_demo_dataset()

    return app


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--db", required=True)
    args = parser.parse_args()

    db_dir = os.path.dirname(os.path.abspath(args.db))
    os.makedirs(db_dir, exist_ok=True)

    app = build_app(args.db)
    from waitress import serve
    print(f"[e2e_server] serving on http://127.0.0.1:{args.port}", flush=True)
    # Extra threads: SSE connections each hold a thread, and the suite opens
    # several client sessions; headroom keeps normal requests from queueing.
    serve(app, host="127.0.0.1", port=args.port, threads=24, _quiet=True)


if __name__ == "__main__":
    main()
