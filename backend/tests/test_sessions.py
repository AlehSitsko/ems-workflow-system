"""Per-device session registry: listing and revoking a specific device's session.

Each login registers a row; the auth guard checks it every request, so revoking
one device signs it out on its next call without touching the others.
"""

from models import UserSession
from conftest import make_user, login


def two_clients_same_user(app, username="multi"):
    """The same user signed in on two independent clients (two devices)."""
    make_user("dispatcher", username=username)
    a, b = app.test_client(), app.test_client()
    login(a, username)
    login(b, username)
    return a, b


def sessions_of(client):
    return client.get("/api/auth/sessions").get_json()


# ── Listing ──────────────────────────────────────────────────────────────────

def test_login_registers_a_listable_current_session(app):
    make_user("hr", username="solo")
    c = app.test_client()
    login(c, "solo")
    rows = sessions_of(c)
    assert len(rows) == 1
    assert rows[0]["current"] is True


def test_two_logins_show_two_sessions_one_current(app):
    a, _ = two_clients_same_user(app)
    rows = sessions_of(a)
    assert len(rows) == 2
    assert sum(1 for r in rows if r["current"]) == 1


# ── Revoking another device ──────────────────────────────────────────────────

def test_revoking_the_other_device_signs_it_out(app):
    a, b = two_clients_same_user(app)
    other = next(r for r in sessions_of(a) if not r["current"])

    assert a.delete(f"/api/auth/sessions/{other['id']}").status_code == 200
    # B's very next request is rejected; A is untouched.
    assert b.get("/api/auth/me").status_code == 401
    assert a.get("/api/auth/me").status_code == 200


def test_cannot_revoke_another_users_session(app):
    a, _ = two_clients_same_user(app, username="owner")
    make_user("supervisor", username="attacker")
    atk = app.test_client()
    login(atk, "attacker")

    victim_session_id = sessions_of(a)[0]["id"]
    assert atk.delete(f"/api/auth/sessions/{victim_session_id}").status_code == 404
    # The victim's session still works.
    assert a.get("/api/auth/me").status_code == 200


def test_revoking_my_current_session_logs_me_out(app):
    make_user("admin", username="self")
    c = app.test_client()
    login(c, "self")
    mine = sessions_of(c)[0]

    resp = c.delete(f"/api/auth/sessions/{mine['id']}")
    assert resp.status_code == 200 and resp.get_json()["current"] is True
    assert c.get("/api/auth/me").status_code == 401


# ── Revoke everywhere else ───────────────────────────────────────────────────

def test_revoke_others_keeps_only_this_device(app):
    a, b = two_clients_same_user(app)
    c = app.test_client()
    login(c, "multi")  # a third device for the same user

    resp = a.post("/api/auth/sessions/revoke-others")
    assert resp.status_code == 200 and resp.get_json()["revoked"] == 2
    # The other two are out; this one remains, and now lists alone.
    assert b.get("/api/auth/me").status_code == 401
    assert c.get("/api/auth/me").status_code == 401
    assert a.get("/api/auth/me").status_code == 200
    assert len(sessions_of(a)) == 1


# ── Logout revokes the row ───────────────────────────────────────────────────

def test_logout_revokes_the_server_side_session(app):
    make_user("dispatcher", username="bye")
    c = app.test_client()
    login(c, "bye")
    sid_count = UserSession.query.filter_by(revoked=False).count()
    assert sid_count == 1

    c.post("/api/auth/logout")
    assert UserSession.query.filter_by(revoked=False).count() == 0
