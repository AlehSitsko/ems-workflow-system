"""The signed-in user's own organisation: the public workspace greeting and the
admin-only org settings.
"""

from models import db, Organization
from conftest import make_user, TEST_PASSWORD


def _org(slug, name):
    o = Organization(name=name, slug=slug, is_active=True)
    db.session.add(o)
    db.session.commit()
    return o


def _admin_on(app, org, role="admin", username="admin"):
    """A signed-in user on their org's subdomain; returns (client, base_url, csrf)."""
    make_user(role, username=username, org_id=org.id)
    base = f"http://{org.slug}.localhost:5050"
    c = app.test_client()
    body = c.post("/api/auth/login",
                  json={"username": username, "password": TEST_PASSWORD},
                  base_url=base).get_json()
    return c, base, body.get("csrfToken", "")


# ── Public workspace greeting ────────────────────────────────────────────────

def test_current_tenant_is_public_and_names_the_workspace(app):
    _org("acme", "Acme EMS")
    resp = app.test_client().get("/api/tenant/current", base_url="http://acme.localhost:5050")
    assert resp.status_code == 200
    assert resp.get_json() == {"name": "Acme EMS", "slug": "acme"}


def test_current_tenant_is_404_on_a_bare_or_platform_host(app):
    _org("acme", "Acme EMS")
    anon = app.test_client()
    assert anon.get("/api/tenant/current", base_url="http://localhost:5050").status_code == 404
    assert anon.get("/api/tenant/current", base_url="http://admin.localhost:5050").status_code == 404


# ── Org settings (admin, own org) ────────────────────────────────────────────

def test_admin_reads_and_updates_their_org(app):
    org = _org("acme", "Acme EMS")
    c, base, csrf = _admin_on(app, org)

    got = c.get("/api/tenant/org", base_url=base).get_json()
    assert got["name"] == "Acme EMS" and got["slug"] == "acme"

    resp = c.patch("/api/tenant/org", base_url=base, headers={"X-CSRF-Token": csrf},
                   json={"name": "Acme Medical", "settings": {"timezone": "America/New_York"}})
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["name"] == "Acme Medical"
    assert body["settings"]["timezone"] == "America/New_York"


def test_org_settings_never_change_the_slug_or_active_state(app):
    org = _org("acme", "Acme EMS")
    c, base, csrf = _admin_on(app, org)
    c.patch("/api/tenant/org", base_url=base, headers={"X-CSRF-Token": csrf},
            json={"slug": "hacked", "settings": {"isActive": False}})
    with db.session.no_autoflush:
        fresh = Organization.query.filter_by(id=org.id).first()
    assert fresh.slug == "acme" and fresh.is_active is True


def test_org_settings_are_admin_only(app):
    org = _org("acme", "Acme EMS")
    c, base, _ = _admin_on(app, org, role="dispatcher", username="disp")
    assert c.get("/api/tenant/org", base_url=base).status_code == 403
