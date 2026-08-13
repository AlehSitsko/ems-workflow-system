"""Invite-only onboarding — the security-critical paths.

Covers the negative cases the spec calls out: replay, expired, revoked, cross-org
manipulation and role/org tampering, plus that the raw token is never stored.
"""

import hashlib
from datetime import datetime, timedelta, timezone

from models import db, Organization, UserInvitation, User
from conftest import make_user, login
from tenant import unfiltered

STRONG = "Str0ngPass!"  # meets the password policy


def _orgs():
    a = Organization(name="Org A", slug="orga")
    b = Organization(name="Org B", slug="orgb")
    db.session.add_all([a, b])
    db.session.commit()
    return a.id, b.id


def _admin(app, org_id, username):
    user = make_user("admin", username=username, org_id=org_id)
    c = app.test_client()
    login(c, user.username)
    return c


def _invite(client, email="new@example.com", role="dispatcher"):
    return client.post("/api/invitations", json={"email": email, "role": role})


def test_admin_creates_invitation_and_only_the_hash_is_stored(app):
    a, _ = _orgs()
    ca = _admin(app, a, "admin_a")
    r = _invite(ca)
    assert r.status_code == 201
    body = r.get_json()
    token = body["token"]
    assert token and len(token) >= 20
    with unfiltered():
        inv = UserInvitation.query.get(body["id"])
    assert inv.token_hash == hashlib.sha256(token.encode()).hexdigest()
    assert inv.org_id == a and inv.accepted_at is None


def test_non_admin_cannot_invite(app):
    a, _ = _orgs()
    disp = make_user("dispatcher", username="disp_a", org_id=a)
    c = app.test_client()
    login(c, disp.username)
    assert c.post("/api/invitations", json={"email": "x@y.com", "role": "dispatcher"}).status_code == 403


def test_accept_uses_org_and_role_from_the_token_not_the_client(app):
    a, _ = _orgs()
    ca = _admin(app, a, "admin_a")
    token = _invite(ca, email="jane@example.com", role="supervisor").get_json()["token"]

    anon = app.test_client()
    v = anon.get(f"/api/invitations/accept/{token}")
    assert v.status_code == 200 and v.get_json()["role"] == "supervisor"

    # The client tries to escalate the role and change the org — both ignored.
    r = anon.post("/api/invitations/accept", json={
        "token": token, "username": "jane", "password": STRONG, "display_name": "Jane",
        "role": "admin", "org_id": 99999,
    })
    assert r.status_code == 201, r.get_json()
    with unfiltered():
        user = User.query.filter_by(username="jane").first()
    assert user.role == "supervisor"   # fixed by the token
    assert user.org_id == a            # fixed by the token


def test_accept_is_one_time_replay_refused(app):
    a, _ = _orgs()
    ca = _admin(app, a, "admin_a")
    token = _invite(ca).get_json()["token"]

    first = app.test_client().post("/api/invitations/accept",
        json={"token": token, "username": "u1", "password": STRONG, "display_name": "U"})
    assert first.status_code == 201

    replay = app.test_client().post("/api/invitations/accept",
        json={"token": token, "username": "u2", "password": STRONG, "display_name": "U"})
    assert replay.status_code == 410
    with unfiltered():
        assert User.query.filter_by(username="u2").first() is None


def test_expired_invitation_refused(app):
    a, _ = _orgs()
    ca = _admin(app, a, "admin_a")
    body = _invite(ca).get_json()
    with unfiltered():
        inv = UserInvitation.query.get(body["id"])
        inv.expires_at = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat(timespec="seconds")
        db.session.commit()
    anon = app.test_client()
    assert anon.get(f"/api/invitations/accept/{body['token']}").status_code == 410
    assert anon.post("/api/invitations/accept",
        json={"token": body["token"], "username": "z", "password": STRONG, "display_name": "Z"}).status_code == 410


def test_revoked_invitation_refused(app):
    a, _ = _orgs()
    ca = _admin(app, a, "admin_a")
    body = _invite(ca).get_json()
    assert ca.post(f"/api/invitations/{body['id']}/revoke").status_code == 200
    assert app.test_client().post("/api/invitations/accept",
        json={"token": body["token"], "username": "z", "password": STRONG, "display_name": "Z"}).status_code == 410


def test_invalid_token_is_refused(app):
    _orgs()
    anon = app.test_client()
    assert anon.get("/api/invitations/accept/not-a-real-token").status_code == 404
    assert anon.post("/api/invitations/accept",
        json={"token": "nope", "username": "z", "password": STRONG, "display_name": "Z"}).status_code == 404


def test_cross_org_admin_cannot_see_or_revoke_others(app):
    a, b = _orgs()
    ca = _admin(app, a, "admin_a")
    cb = _admin(app, b, "admin_b")
    inv_a = _invite(ca).get_json()
    # B's list is scoped to B (empty); B cannot revoke A's invitation.
    assert cb.get("/api/invitations").get_json() == []
    assert cb.post(f"/api/invitations/{inv_a['id']}/revoke").status_code == 404
    with unfiltered():
        assert UserInvitation.query.get(inv_a["id"]).revoked_at is None  # untouched


def test_weak_password_is_rejected_on_accept(app):
    a, _ = _orgs()
    ca = _admin(app, a, "admin_a")
    token = _invite(ca).get_json()["token"]
    r = app.test_client().post("/api/invitations/accept",
        json={"token": token, "username": "weak", "password": "short", "display_name": "W"})
    assert r.status_code == 400
