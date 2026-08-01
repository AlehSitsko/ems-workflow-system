"""Org-aware login: the same username in two orgs, resolved by subdomain.

On an org subdomain the username is scoped to that org; on a bare host (localhost /
apex) the lookup stays global, which is the pre-v2 single-tenant behaviour every
other test relies on.
"""

from models import db, Organization
from conftest import make_user, TEST_PASSWORD


def _org(slug, name, active=True):
    o = Organization(name=name, slug=slug, is_active=active)
    db.session.add(o)
    db.session.commit()
    return o


def _login(client, username, host, password=TEST_PASSWORD):
    return client.post(
        "/api/auth/login",
        json={"username": username, "password": password},
        base_url=f"http://{host}:5050",
    )


def test_same_username_resolves_to_the_subdomains_org(app):
    a = _org("acme", "Acme EMS")
    b = _org("beta", "Beta EMS")
    make_user("admin", username="admin", org_id=a.id)
    make_user("admin", username="admin", org_id=b.id)

    ra = _login(app.test_client(), "admin", host="acme.localhost")
    rb = _login(app.test_client(), "admin", host="beta.localhost")
    assert ra.status_code == 200 and ra.get_json()["user"]["organization"]["name"] == "Acme EMS"
    assert rb.status_code == 200 and rb.get_json()["user"]["organization"]["name"] == "Beta EMS"


def test_bare_host_login_is_global_backcompat(app):
    # A user with no org (the shape every existing fixture uses) still logs in on
    # localhost, unchanged.
    make_user("dispatcher", username="plain")
    resp = _login(app.test_client(), "plain", host="localhost")
    assert resp.status_code == 200


def test_login_on_a_suspended_workspace_is_refused(app):
    g = _org("gamma", "Gamma EMS", active=False)
    make_user("admin", username="admin", org_id=g.id)
    resp = _login(app.test_client(), "admin", host="gamma.localhost")
    assert resp.status_code == 403
    assert "suspended" in resp.get_json()["error"].lower()


def test_login_on_an_unknown_subdomain_is_refused(app):
    make_user("admin", username="admin")  # exists globally, but not under this slug
    resp = _login(app.test_client(), "admin", host="ghost.localhost")
    assert resp.status_code == 401


def test_a_users_own_org_subdomain_is_required(app):
    # Acme's admin cannot sign in through Beta's subdomain: the scoped lookup finds
    # no "admin" in Beta (Beta has none here), so it is refused.
    a = _org("acme", "Acme EMS")
    _org("beta", "Beta EMS")
    make_user("admin", username="admin", org_id=a.id)
    resp = _login(app.test_client(), "admin", host="beta.localhost")
    assert resp.status_code == 401
