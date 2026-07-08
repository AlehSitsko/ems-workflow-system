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
