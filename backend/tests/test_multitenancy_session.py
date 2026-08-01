"""Org-membership enforcement on every request: a suspended workspace locks its
users out, and a session cannot act on another org's subdomain.

Bare-host (localhost) requests are exempt — single-tenant mode — which is what the
rest of the suite relies on.
"""

from models import db, Organization
from conftest import make_user, TEST_PASSWORD


def _org(slug, name="Org", active=True):
    o = Organization(name=name, slug=slug, is_active=active)
    db.session.add(o)
    db.session.commit()
    return o


def _login(app, username, host, org_id):
    make_user("admin", username=username, org_id=org_id)
    c = app.test_client()
    c.post("/api/auth/login", json={"username": username, "password": TEST_PASSWORD},
           base_url=f"http://{host}:5050")
    return c


def test_suspending_a_workspace_kicks_its_active_sessions(app):
    org = _org("acme", "Acme")
    c = _login(app, "admin", "acme.localhost", org.id)
    assert c.get("/api/auth/me", base_url="http://acme.localhost:5050").status_code == 200

    org.is_active = False
    db.session.commit()

    resp = c.get("/api/auth/me", base_url="http://acme.localhost:5050")
    assert resp.status_code == 401
    assert resp.get_json().get("code") == "org_suspended"


def test_a_session_cannot_act_on_another_orgs_subdomain(app):
    a = _org("acme", "Acme")
    _org("beta", "Beta")
    c = _login(app, "admin", "acme.localhost", a.id)
    assert c.get("/api/auth/me", base_url="http://acme.localhost:5050").status_code == 200
    # The same signed-in client is refused on Beta's subdomain.
    assert c.get("/api/auth/me", base_url="http://beta.localhost:5050").status_code == 401


def test_an_org_user_on_a_bare_host_is_not_bound(app):
    # Back-compat: with no subdomain the binding is inert, so an org user still
    # works on localhost (the shape the rest of the suite uses).
    org = _org("acme", "Acme")
    c = _login(app, "solo", "localhost", org.id)
    assert c.get("/api/auth/me", base_url="http://localhost:5050").status_code == 200
