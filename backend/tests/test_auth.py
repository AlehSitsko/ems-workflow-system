import pytest
from werkzeug.security import generate_password_hash

from models import db, User


@pytest.fixture()
def admin_user(app):
    user = User(
        username="testadmin",
        password_hash=generate_password_hash("secret123"),
        display_name="Test Admin",
        role="admin",
        is_active=True,
    )
    db.session.add(user)
    db.session.commit()
    return user


def test_login_success(client, admin_user):
    resp = client.post("/api/auth/login", json={"username": "testadmin", "password": "secret123"})
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["user"]["username"] == "testadmin"
    assert data["user"]["role"] == "admin"


def test_login_wrong_password(client, admin_user):
    resp = client.post("/api/auth/login", json={"username": "testadmin", "password": "wrongpass"})
    assert resp.status_code == 401


def test_login_unknown_user(client):
    resp = client.post("/api/auth/login", json={"username": "nobody", "password": "x"})
    assert resp.status_code == 401


def test_login_missing_fields(client):
    resp = client.post("/api/auth/login", json={"username": "", "password": ""})
    assert resp.status_code == 400


def test_login_no_json_body(client):
    # No Content-Type/body at all — Werkzeug rejects before the route's own
    # "Request body must be JSON" check ever runs.
    resp = client.post("/api/auth/login")
    assert resp.status_code == 415


def test_login_inactive_user(client, app):
    user = User(
        username="inactiveuser",
        password_hash=generate_password_hash("pw"),
        display_name="Inactive User",
        role="dispatcher",
        is_active=False,
    )
    db.session.add(user)
    db.session.commit()

    resp = client.post("/api/auth/login", json={"username": "inactiveuser", "password": "pw"})
    assert resp.status_code == 403


# ── Password policy (staff accounts) ────────────────────────────────────────
#
# Enforced on the user-management routes only — never on login, so existing and
# demo accounts keep working. A modest baseline: length, a letter, a digit, and
# not the username. See utils/validation_utils.validate_password_strength.

from utils.validation_utils import validate_password_strength


@pytest.mark.parametrize("pw,ok", [
    ("dispatch2026", True),      # long, letter + digit
    ("aB3xyzqrst", True),
    ("short1", False),          # too short
    ("alllettershere", False),  # no digit
    ("1234567890", False),      # no letter
    ("", False),
])
def test_password_strength_rules(pw, ok):
    assert (validate_password_strength(pw) is None) == ok


def test_password_may_not_equal_the_username():
    assert validate_password_strength("Dispatcher1", "dispatcher1") is not None
    assert validate_password_strength("Dispatcher1", "someone_else") is None


def _admin_client(app):
    from conftest import make_user, login
    make_user("admin", username="pwpolicy_admin")
    c = app.test_client()
    login(c, "pwpolicy_admin")
    return c


def test_create_user_rejects_a_weak_password(app):
    c = _admin_client(app)
    resp = c.post("/api/auth/users", json={
        "username": "newmedic", "password": "weak", "display_name": "New Medic", "role": "dispatcher",
    })
    assert resp.status_code == 400
    assert "at least" in resp.get_json()["error"]


def test_create_user_accepts_a_strong_password(app):
    c = _admin_client(app)
    resp = c.post("/api/auth/users", json={
        "username": "newmedic", "password": "dispatch2026", "display_name": "New Medic", "role": "dispatcher",
    })
    assert resp.status_code == 201


def test_update_user_rejects_a_weak_replacement_password(app):
    from models import User
    c = _admin_client(app)
    created = c.post("/api/auth/users", json={
        "username": "editme", "password": "dispatch2026", "display_name": "Edit Me", "role": "dispatcher",
    }).get_json()

    resp = c.put(f"/api/auth/users/{created['id']}", json={
        "username": "editme", "display_name": "Edit Me", "role": "dispatcher", "password": "123",
    })
    assert resp.status_code == 400
    # The record must be untouched — a rejected password change is not a change.
    assert User.query.get(created["id"]).username == "editme"


def test_update_user_without_a_password_is_unaffected_by_the_policy(app):
    c = _admin_client(app)
    created = c.post("/api/auth/users", json={
        "username": "renameme", "password": "dispatch2026", "display_name": "Rename Me", "role": "dispatcher",
    }).get_json()

    resp = c.put(f"/api/auth/users/{created['id']}", json={
        "username": "renameme", "display_name": "Renamed", "role": "supervisor",
    })
    assert resp.status_code == 200
