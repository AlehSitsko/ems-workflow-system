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


# ── Authenticated clients ───────────────────────────────────────────────────
#
# Identity is a session cookie now, so a test cannot simply assert a role in a
# header. These fixtures sign in for real against /api/auth/login, which means
# every test also exercises the actual authentication path rather than a
# test-only shortcut around it.
#
# One client per role: a client owns a cookie jar, so a test that needs two
# roles at once uses two clients rather than swapping a header per request.

TEST_PASSWORD = "test-password"


def make_user(role, username=None, display_name=None, **extra):
    """Create an active user with a known password, for signing in."""
    from werkzeug.security import generate_password_hash
    from models import User

    user = User(
        username=username or f"test_{role}",
        password_hash=generate_password_hash(TEST_PASSWORD),
        display_name=display_name or f"Test {role.title()}",
        role=role,
        is_active=True,
        **extra,
    )
    _db.session.add(user)
    _db.session.commit()
    return user


def login(client, username, password=TEST_PASSWORD):
    """Sign a client in; its cookie jar carries the session from here on."""
    resp = client.post("/api/auth/login", json={"username": username, "password": password})
    assert resp.status_code == 200, f"login failed for {username}: {resp.get_json()}"
    return resp.get_json()["user"]


@pytest.fixture()
def users(app):
    """One user per role, keyed by role name."""
    return {role: make_user(role) for role in ("admin", "supervisor", "dispatcher", "hr")}


@pytest.fixture()
def clients(app, users):
    """A signed-in test client per role, keyed by role name."""
    out = {}
    for role, user in users.items():
        c = app.test_client()
        login(c, user.username)
        out[role] = c
    return out


@pytest.fixture()
def anon(app):
    """A client that never signs in — for asserting the 401 path."""
    return app.test_client()
