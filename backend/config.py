"""Application configuration.

A single base Config read from the environment. The application factory
(`create_app`) loads this and then applies any per-call overrides (tests pass an
in-memory database and disable rate limiting this way), so there is no hidden,
import-time configuration or database access.
"""

import os


class Config:
    # DATABASE_URL lets tests / Docker point this elsewhere without touching the
    # local dev default. Relative sqlite paths resolve under the Flask instance
    # folder (backend/instance/).
    SQLALCHEMY_DATABASE_URI = os.environ.get("DATABASE_URL", "sqlite:///database.db")
    SQLALCHEMY_TRACK_MODIFICATIONS = False
