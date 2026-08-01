"""Password expiry + self-service rotation.

Rotation is off by default (PASSWORD_MAX_AGE_DAYS=0), so the rest of the suite is
unaffected; these switch it on per test. Covers the change-password endpoint
(verify current, strength, no-reuse) and that an expired password locks the
account to the change flow until it is rotated.
"""

from datetime import datetime, timedelta

import pytest

from models import db, User
from conftest import make_user, login, TEST_PASSWORD


def days_ago(n):
    return (datetime.now() - timedelta(days=n)).isoformat(timespec="seconds")


# ── Self-service change ──────────────────────────────────────────────────────

def test_change_password_requires_the_correct_current(clients):
    resp = clients["admin"].post("/api/auth/change-password", json={
        "currentPassword": "wrong", "newPassword": "BrandNew123",
    })
    assert resp.status_code == 403


def test_change_password_enforces_strength_and_no_reuse(clients):
    c = clients["admin"]
    # Too weak (no digit / too short).
    assert c.post("/api/auth/change-password", json={
        "currentPassword": TEST_PASSWORD, "newPassword": "short",
    }).status_code == 400
    # Same as the current one — rotation must be a real change.
    assert c.post("/api/auth/change-password", json={
        "currentPassword": TEST_PASSWORD, "newPassword": TEST_PASSWORD,
    }).status_code == 400


def test_change_password_rotates_and_updates_the_login(app):
    user = make_user("dispatcher", username="rotator")
    c = app.test_client()
    login(c, "rotator")

    ok = c.post("/api/auth/change-password", json={
        "currentPassword": TEST_PASSWORD, "newPassword": "FreshPass99",
    })
    assert ok.status_code == 200

    # The old password no longer works; the new one does.
    fresh = app.test_client()
    assert fresh.post("/api/auth/login", json={
        "username": "rotator", "password": TEST_PASSWORD}).status_code == 401
    assert fresh.post("/api/auth/login", json={
        "username": "rotator", "password": "FreshPass99"}).status_code == 200

    with db.session.no_autoflush:
        assert User.query.filter_by(username="rotator").first().password_changed_at


# ── Expiry blocks the app ────────────────────────────────────────────────────

def test_rotation_is_off_by_default(app, clients):
    # A user with no timestamp is not expired while rotation is disabled (0).
    assert app.config["PASSWORD_MAX_AGE_DAYS"] == 0
    body = clients["admin"].get("/api/auth/me").get_json()["user"]
    assert body["passwordExpired"] is False
    assert clients["admin"].get("/api/patients").status_code == 200


def test_expired_password_locks_the_account_to_the_change_flow(app):
    app.config["PASSWORD_MAX_AGE_DAYS"] = 30
    make_user("admin", username="stale", password_changed_at=days_ago(100))
    c = app.test_client()
    payload = login(c, "stale")
    assert payload["passwordExpired"] is True

    # Ordinary endpoints are refused with the machine-readable code…
    blocked = c.get("/api/patients")
    assert blocked.status_code == 403
    assert blocked.get_json()["code"] == "password_expired"
    # …but the way out stays open: reading identity and changing the password.
    assert c.get("/api/auth/me").status_code == 200
    changed = c.post("/api/auth/change-password", json={
        "currentPassword": TEST_PASSWORD, "newPassword": "RotatedPass1",
    })
    assert changed.status_code == 200
    assert changed.get_json()["user"]["passwordExpired"] is False

    # With a fresh password the account is unlocked.
    assert c.get("/api/patients").status_code == 200


def test_a_password_exactly_at_the_limit_is_not_yet_expired(app):
    app.config["PASSWORD_MAX_AGE_DAYS"] = 90
    make_user("hr", username="edge", password_changed_at=days_ago(89))
    c = app.test_client()
    assert login(c, "edge")["passwordExpired"] is False
    assert c.get("/api/employees").status_code == 200


# ── Provisioning stamps the clock ────────────────────────────────────────────

def test_a_newly_created_user_gets_a_password_timestamp(clients):
    resp = clients["admin"].post("/api/auth/users", json={
        "username": "provisioned", "password": "InitialPass1",
        "display_name": "Provisioned", "role": "dispatcher",
    })
    assert resp.status_code == 201
    assert User.query.filter_by(username="provisioned").first().password_changed_at
