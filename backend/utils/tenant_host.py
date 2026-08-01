"""Resolve the organisation a request belongs to from its Host header.

Multi-tenancy v2 reaches each organisation at its own subdomain
(`acme.<BASE_DOMAIN>`). This turns the request's host into an org slug and then an
`Organization`, so login and the auth guard can scope to the right tenant.

The deliberate escape hatch: a host that is *not* a subdomain of the base domain —
bare `localhost`, the apex domain itself, an unknown host, or the platform host —
yields **no slug**, and callers then fall back to the pre-v2 single-tenant
behaviour. That is what keeps the existing test suite and current deployments,
which reach the app on `localhost`, working unchanged.
"""

from flask import current_app, g, has_app_context, request


# Never treated as an org subdomain.
_RESERVED_LABELS = {"www"}


def _strip_port(host):
    return (host or "").split(":", 1)[0].strip().lower()


def org_slug_from_host(host):
    """The org slug encoded in `host`, or None.

    A slug is the leftmost label, returned only when the host has *more* labels
    than the base domain (so it is a subdomain of it) and is not the platform host
    or a reserved label. `acme.localhost` → "acme"; bare `localhost`, `localhost`
    as apex, `admin.localhost` (platform), and anything outside the base domain →
    None.
    """
    hostname = _strip_port(host)
    if not hostname:
        return None

    base = _strip_port(current_app.config.get("BASE_DOMAIN", "localhost"))
    platform = _strip_port(current_app.config.get("PLATFORM_HOST", ""))
    if hostname == platform:
        return None

    # Must be a strict subdomain of the base domain.
    suffix = "." + base
    if not hostname.endswith(suffix):
        return None
    label_part = hostname[: -len(suffix)]
    if not label_part:
        return None
    # The subdomain label is everything left of the base domain; take its leftmost
    # segment as the slug (so a multi-level host still maps to one org).
    slug = label_part.split(".")[0]
    if not slug or slug in _RESERVED_LABELS:
        return None
    return slug


def resolve_request_org():
    """The active Organization for this request's host, or None. Memoised on
    flask.g so repeated calls in one request cost a single lookup."""
    if not has_app_context():
        return None
    if "resolved_org" in g:
        return g.resolved_org

    org = None
    slug = org_slug_from_host(request.host if request else None)
    if slug:
        from models import Organization
        from tenant import unfiltered
        # Organization is not tenant-scoped, but the lookup runs before a session
        # is established, so keep it explicitly unfiltered for clarity.
        with unfiltered():
            org = Organization.query.filter_by(slug=slug, is_active=True).first()
    g.resolved_org = org
    return org
