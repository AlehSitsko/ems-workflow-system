"""Runtime tenant isolation.

Organisation scoping is enforced globally at the ORM layer, not per query — the
app has 200+ `Model.query` call sites and one missed filter would be a cross-tenant
leak. Two SQLAlchemy session events do it:

  * a `do_orm_execute` hook adds ``WHERE org_id = :current_org`` to every SELECT of
    an org-owned entity, so reads can only ever return the caller's organisation;
  * a `before_flush` hook stamps `org_id` on new org-owned rows, so writes land in
    the caller's organisation without any route touching the column.

Both are driven by a request-scoped "current org" (`flask.g`), set by the API auth
guard from the session. With no current org (the CLI, seeding, the pre-login
username lookup, and the existing test suite) both hooks are inert, so nothing that
does not opt in is affected.

Child/detail tables (documents, assignments, task comments, …) have no `org_id` and
are isolated transitively: they are only reachable through an org-filtered parent.
"""

from contextlib import contextmanager

from flask import g, has_app_context
from sqlalchemy import event
from sqlalchemy.orm import Session, with_loader_criteria

from models import ORG_SCOPED_MODELS


def current_org_id():
    """The organisation the current request is scoped to, or None (unscoped)."""
    if not has_app_context():
        return None
    return g.get("current_org_id")


def set_current_org(org_id):
    """Bind the current app context to an organisation (used by the auth guard and
    by the CLI/seeders, which have no request to read a session from)."""
    if has_app_context():
        g.current_org_id = org_id


def ensure_default_org():
    """The id of the single 'default' organisation, created if missing.

    Seeders run without a request, so they have no session to derive an org from;
    they call this and `set_current_org(...)` so the write-stamp lands their rows in
    the default tenant. Keyed by slug to match the migration, so it is reused.
    """
    from models import db, Organization
    org = Organization.query.filter_by(slug="default").first()
    if org is None:
        org = Organization(name="Default Organization", slug="default",
                           is_active=True, created_at="2026-01-01T00:00:00")
        db.session.add(org)
        db.session.commit()
    return org.id


@contextmanager
def unfiltered():
    """Run a block with tenant scoping off — for privileged, cross-org work such as
    creating the organisations themselves during seeding."""
    prev = current_org_id()
    set_current_org(None)
    try:
        yield
    finally:
        set_current_org(prev)


@event.listens_for(Session, "do_orm_execute")
def _tenant_read_filter(execute_state):
    # Only plain SELECTs: skip column refreshes and relationship (lazy) loads,
    # which reload already-authorised rows and must not be re-filtered.
    if (not execute_state.is_select
            or execute_state.is_column_load
            or execute_state.is_relationship_load):
        return
    org_id = current_org_id()
    if org_id is None:
        return
    execute_state.statement = execute_state.statement.options(*[
        with_loader_criteria(model, model.org_id == org_id, include_aliases=True)
        for model in ORG_SCOPED_MODELS
    ])


@event.listens_for(Session, "before_flush")
def _tenant_write_stamp(session, flush_context, instances):
    org_id = current_org_id()
    if org_id is None:
        return
    for obj in session.new:
        if isinstance(obj, ORG_SCOPED_MODELS) and getattr(obj, "org_id", None) is None:
            obj.org_id = org_id
