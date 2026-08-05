"""First-run bootstrap for the standalone desktop build.

A fresh local database has no users, so the app must let the operator create the
initial admin — and that door must slam shut the moment any user exists, so it can
never add an account to a provisioned (web or desktop) system.
"""


def test_needs_setup_true_on_empty_db(client):
    r = client.get("/api/auth/needs-setup")
    assert r.status_code == 200
    assert r.get_json()["needsSetup"] is True


def test_setup_creates_first_admin_and_signs_in(client):
    r = client.post("/api/auth/setup", json={
        "username": "owner", "password": "localadmin1", "displayName": "Owner",
    })
    assert r.status_code == 200, r.get_json()
    body = r.get_json()
    assert body["user"]["role"] == "admin"
    assert body["user"]["username"] == "owner"
    assert body["csrfToken"]

    # The new admin is signed in — an authenticated endpoint works immediately.
    assert client.get("/api/auth/me").status_code == 200
    # And setup is now closed.
    assert client.get("/api/auth/needs-setup").get_json()["needsSetup"] is False


def test_setup_refused_once_a_user_exists(client, users):
    # `users` seeds the four role users, so the DB is no longer empty.
    assert client.get("/api/auth/needs-setup").get_json()["needsSetup"] is False
    r = client.post("/api/auth/setup", json={"username": "x", "password": "localadmin1"})
    assert r.status_code == 409


def test_setup_rejects_a_weak_password(client):
    r = client.post("/api/auth/setup", json={"username": "owner", "password": "short"})
    assert r.status_code == 400
    # And nothing was created, so setup is still open.
    assert client.get("/api/auth/needs-setup").get_json()["needsSetup"] is True


def test_setup_requires_username_and_password(client):
    assert client.post("/api/auth/setup", json={"username": "owner"}).status_code == 400
    assert client.post("/api/auth/setup", json={"password": "localadmin1"}).status_code == 400
