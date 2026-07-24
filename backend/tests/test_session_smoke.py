"""Does the session mechanism actually work end to end?"""
from conftest import make_user, login, TEST_PASSWORD


def test_login_sets_a_session_and_gates_work(app, client):
    make_user("dispatcher", username="d1")
    # Anonymous first: the gate must refuse.
    assert client.get("/api/dispatch/board?date=2026-07-22").status_code == 401

    login(client, "d1")
    assert client.get("/api/dispatch/board?date=2026-07-22").status_code == 200

    client.post("/api/auth/logout")
    assert client.get("/api/dispatch/board?date=2026-07-22").status_code == 401


def test_headers_are_ignored_now(app, client):
    """The old trust path must be truly gone, not merely unused."""
    resp = client.get("/api/dispatch/board?date=2026-07-22",
                      headers={"X-User-Id": "1", "X-User-Role": "admin"})
    assert resp.status_code == 401, "a forged header still authenticated the caller"


def test_role_gate_still_distinguishes_401_from_403(app, client):
    make_user("hr", username="h1")
    login(client, "h1")
    # Identified, but HR may not open the board.
    assert client.get("/api/dispatch/board?date=2026-07-22").status_code == 403


def test_me_restores_identity(app, client):
    make_user("admin", username="a1", display_name="Admin One")
    assert client.get("/api/auth/me").status_code == 401
    login(client, "a1")
    body = client.get("/api/auth/me").get_json()
    assert body["user"]["username"] == "a1"
    assert body["user"]["role"] == "admin"


def test_cookie_is_httponly_and_samesite(app, client):
    make_user("admin", username="a2")
    resp = client.post("/api/auth/login", json={"username": "a2", "password": TEST_PASSWORD})
    cookie = resp.headers.get("Set-Cookie", "")
    assert "HttpOnly" in cookie, cookie
    assert "SameSite=Lax" in cookie, cookie


def test_session_id_changes_on_login(app, client):
    """Session fixation: the pre-login cookie must not be reused."""
    make_user("admin", username="a3")
    client.get("/api/auth/me")            # may create an anonymous session
    before = client.get_cookie("session")
    login(client, "a3")
    after = client.get_cookie("session")
    assert after is not None
    if before is not None:
        assert before.value != after.value
