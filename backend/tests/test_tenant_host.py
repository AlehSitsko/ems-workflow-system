"""Host → org-slug → Organization resolution (utils/tenant_host.py).

The slug is only extracted for a real subdomain of the base domain; bare localhost,
the apex, the platform host and reserved labels resolve to no org, which is what
keeps the app single-tenant on those hosts.
"""

import pytest

from models import db, Organization
from tenant import set_current_org
from utils.tenant_host import org_slug_from_host, resolve_request_org


@pytest.mark.parametrize("host, expected", [
    ("acme.localhost", "acme"),
    ("acme.localhost:5050", "acme"),
    ("ACME.localhost", "acme"),          # case-insensitive
    ("localhost", None),                  # apex / no subdomain
    ("localhost:5173", None),
    ("admin.localhost", None),            # the platform host
    ("www.localhost", None),              # reserved label
    ("acme.example.com", None),           # outside the base domain
    ("", None),
    (None, None),
])
def test_slug_extraction(app, host, expected):
    with app.app_context():
        assert org_slug_from_host(host) == expected


def test_slug_honours_a_custom_base_domain(app):
    with app.app_context():
        app.config["BASE_DOMAIN"] = "ems.example.com"
        assert org_slug_from_host("acme.ems.example.com") == "acme"
        assert org_slug_from_host("ems.example.com") is None       # apex
        assert org_slug_from_host("acme.localhost") is None        # wrong base


def test_resolve_returns_the_matching_active_org(app):
    with app.app_context():
        set_current_org(None)
        org = Organization(name="Acme", slug="acme", is_active=True)
        db.session.add(org)
        db.session.commit()

        with app.test_request_context("/", base_url="http://acme.localhost:5050"):
            resolved = resolve_request_org()
            assert resolved is not None and resolved.slug == "acme"


def test_resolve_ignores_a_suspended_org(app):
    with app.app_context():
        set_current_org(None)
        db.session.add(Organization(name="Beta", slug="beta", is_active=False))
        db.session.commit()

        with app.test_request_context("/", base_url="http://beta.localhost:5050"):
            assert resolve_request_org() is None


def test_resolve_is_none_on_a_bare_host(app):
    with app.app_context():
        with app.test_request_context("/", base_url="http://localhost:5050"):
            assert resolve_request_org() is None
