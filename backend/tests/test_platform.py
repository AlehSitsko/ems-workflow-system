"""Platform super-admin console: cross-org org management, and the guardrails that
keep it to platform admins on the platform host only.
"""

from models import db, Organization
from conftest import make_user, TEST_PASSWORD

PLATFORM = "http://admin.localhost:5050"


class HostClient:
    """Wraps a test client so every call carries a fixed base_url and, on mutating
    requests, the session's CSRF token. Needed because the shared CsrfClient looks
    the token cookie up under the default `localhost` domain and so can't find the
    one set on a subdomain — a real browser sends it fine."""
    def __init__(self, client, base_url, csrf):
        self._c, self._base, self._csrf = client, base_url, csrf

    def _hdr(self):
        return {"X-CSRF-Token": self._csrf}

    def get(self, path):
        return self._c.get(path, base_url=self._base)

    def post(self, path, json=None):
        return self._c.post(path, json=json, base_url=self._base, headers=self._hdr())

    def patch(self, path, json=None):
        return self._c.patch(path, json=json, base_url=self._base, headers=self._hdr())


def platform_client(app, username="root"):
    """A signed-in platform super-admin (no org) on the platform host."""
    make_user("admin", username=username, is_platform_admin=True)
    c = app.test_client()
    resp = c.post("/api/auth/login",
                  json={"username": username, "password": TEST_PASSWORD},
                  base_url=PLATFORM)
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["user"]["is_platform_admin"] is True
    return HostClient(c, PLATFORM, body["csrfToken"])


def _org_client(app, slug, username="admin"):
    """An org admin signed in on their own subdomain."""
    org = Organization(name=slug.title(), slug=slug, is_active=True)
    db.session.add(org)
    db.session.commit()
    make_user("admin", username=username, org_id=org.id)
    c = app.test_client()
    resp = c.post("/api/auth/login", json={"username": username, "password": TEST_PASSWORD},
                  base_url=f"http://{slug}.localhost:5050")
    return HostClient(c, f"http://{slug}.localhost:5050", resp.get_json().get("csrfToken", "")), org


# ── Happy path ───────────────────────────────────────────────────────────────

def test_platform_admin_creates_and_lists_orgs(app):
    c = platform_client(app)
    created = c.post("/api/platform/orgs", json={
        "name": "Acme EMS", "slug": "acme",
        "adminUsername": "admin", "adminPassword": "AcmeAdmin123",
    })
    assert created.status_code == 201

    orgs = c.get("/api/platform/orgs").get_json()
    assert any(o["slug"] == "acme" and o["userCount"] == 1 for o in orgs)


def test_created_org_admin_can_log_in_on_its_subdomain(app):
    c = platform_client(app)
    c.post("/api/platform/orgs", json={
        "name": "Acme EMS", "slug": "acme",
        "adminUsername": "admin", "adminPassword": "AcmeAdmin123",
    })
    # The provisioned admin signs in through acme's subdomain.
    login_resp = app.test_client().post(
        "/api/auth/login",
        json={"username": "admin", "password": "AcmeAdmin123"},
        base_url="http://acme.localhost:5050",
    )
    assert login_resp.status_code == 200
    assert login_resp.get_json()["user"]["organization"]["name"] == "Acme EMS"


def test_suspend_blocks_that_orgs_login(app):
    c = platform_client(app)
    c.post("/api/platform/orgs", json={
        "name": "Beta EMS", "slug": "beta",
        "adminUsername": "admin", "adminPassword": "BetaAdmin123",
    })
    org_id = next(o["id"] for o in c.get("/api/platform/orgs").get_json()
                  if o["slug"] == "beta")
    assert c.patch(f"/api/platform/orgs/{org_id}",
                   json={"isActive": False}).status_code == 200

    blocked = app.test_client().post(
        "/api/auth/login", json={"username": "admin", "password": "BetaAdmin123"},
        base_url="http://beta.localhost:5050")
    assert blocked.status_code == 403


def test_reset_admin_sets_a_working_password(app):
    c = platform_client(app)
    c.post("/api/platform/orgs", json={
        "name": "Gamma", "slug": "gamma",
        "adminUsername": "admin", "adminPassword": "GammaAdmin123",
    })
    org_id = next(o["id"] for o in c.get("/api/platform/orgs").get_json()
                  if o["slug"] == "gamma")
    assert c.post(f"/api/platform/orgs/{org_id}/reset-admin",
                  json={"username": "admin", "newPassword": "ResetPass123"}).status_code == 200

    ok = app.test_client().post("/api/auth/login",
                                json={"username": "admin", "password": "ResetPass123"},
                                base_url="http://gamma.localhost:5050")
    assert ok.status_code == 200


# ── Validation ───────────────────────────────────────────────────────────────

def test_bad_slug_and_duplicate_are_rejected(app):
    c = platform_client(app)
    assert c.post("/api/platform/orgs", json={
        "name": "X", "slug": "Not Valid!", "adminUsername": "a", "adminPassword": "GoodPass123",
    }).status_code == 400
    assert c.post("/api/platform/orgs", json={
        "name": "X", "slug": "www", "adminUsername": "a", "adminPassword": "GoodPass123",
    }).status_code == 400  # reserved

    c.post("/api/platform/orgs", json={
        "name": "Dup", "slug": "dup", "adminUsername": "a", "adminPassword": "GoodPass123"})
    dup = c.post("/api/platform/orgs", json={
        "name": "Dup2", "slug": "dup", "adminUsername": "b", "adminPassword": "GoodPass123"})
    assert dup.status_code == 409


# ── Guardrails ───────────────────────────────────────────────────────────────

def test_org_admin_cannot_reach_the_platform_console(app):
    c, _ = _org_client(app, "acme")
    assert c.get("/api/platform/orgs").status_code == 403


def test_platform_admin_cannot_read_a_tenant_endpoint(app):
    # Even on the platform host, an ordinary tenant endpoint is refused, so the
    # NULL-org (unfiltered) admin can never read a tenant's data. (On an org
    # subdomain the platform cookie is not even sent — it is host-scoped.)
    c = platform_client(app)
    assert c.get("/api/patients").status_code == 403


def test_anonymous_cannot_reach_the_platform_console(anon):
    assert anon.get("/api/platform/orgs").status_code == 401
