import os

os.environ["DATABASE_URL"] = "sqlite:///:memory:"

import pytest

from app import app as flask_app
from models import db as _db


@pytest.fixture()
def app():
    flask_app.config.update(TESTING=True, RATELIMIT_ENABLED=False)
    with flask_app.app_context():
        _db.create_all()
        yield flask_app
        _db.session.remove()
        _db.drop_all()


@pytest.fixture()
def client(app):
    return app.test_client()


@pytest.fixture()
def db_session(app):
    return _db.session
