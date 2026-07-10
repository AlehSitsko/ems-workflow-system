import pytest

from app import create_app
from models import db as _db


@pytest.fixture()
def app():
    # Isolated app per test: in-memory SQLite, rate limiting off. Passed via the
    # factory's config override so nothing touches the dev/prod database.
    app = create_app({
        "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
        "RATELIMIT_ENABLED": False,
    })
    with app.app_context():
        _db.create_all()
        yield app
        _db.session.remove()
        _db.drop_all()


@pytest.fixture()
def client(app):
    return app.test_client()


@pytest.fixture()
def db_session(app):
    return _db.session
