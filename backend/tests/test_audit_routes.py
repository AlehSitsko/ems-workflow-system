"""Backend tests for the audit log HTTP surface (routes/audit_routes.py).

Covers RBAC (must be signed in), pagination (incl. the 200 per_page cap and >=1
floor), every filter branch (entity_type / entity_id / action-substring / date
range), a malformed entity_id being ignored rather than crashing, and newest-first
ordering. AuditLog is org-scoped, so the tenant filter applies automatically to
this query (cross-org isolation is exercised in test_tenant_isolation.py).

Run: pytest backend/tests/test_audit_routes.py -v
"""

from models import db, AuditLog


def _entry(action="call.assigned", entity_type="call", entity_id=1, ts="2026-08-20T10:00:00"):
    e = AuditLog(timestamp=ts, action=action, entity_type=entity_type,
                 entity_id=entity_id, entity_label=f"{entity_type} #{entity_id}")
    db.session.add(e)
    db.session.commit()
    return e


def _entries(api, **params):
    qs = "&".join(f"{k}={v}" for k, v in params.items())
    return api.get(f"/api/audit?{qs}" if qs else "/api/audit").get_json()


# ── RBAC ─────────────────────────────────────────────────────────────────────

def test_anonymous_is_unauthorized(anon, app):
    assert anon.get("/api/audit").status_code == 401


def test_all_known_roles_may_read_audit(clients, app):
    for role in ("admin", "supervisor", "hr", "dispatcher"):
        assert clients[role].get("/api/audit").status_code == 200


# ── pagination ────────────────────────────────────────────────────────────────

def test_pagination_shape_and_cap(clients, app):
    for i in range(5):
        _entry(entity_id=i, ts=f"2026-08-2{i}T10:00:00")
    body = _entries(clients["admin"], page=1, per_page=2)
    assert body["total"] == 5 and body["per_page"] == 2 and body["pages"] == 3
    assert len(body["entries"]) == 2

    # per_page is capped at 200 and floored at 1 (a negative value clamps up)
    assert _entries(clients["admin"], per_page=999)["per_page"] == 200
    assert _entries(clients["admin"], per_page=-5)["per_page"] == 1


def test_newest_first_ordering(clients, app):
    a = _entry(entity_id=1, ts="2026-08-01T00:00:00")
    b = _entry(entity_id=2, ts="2026-08-31T00:00:00")
    ids = [e["id"] for e in _entries(clients["admin"])["entries"]]
    assert ids == [b.id, a.id]  # id desc -> most recent first


# ── filters ──────────────────────────────────────────────────────────────────

def test_filter_by_entity_type(clients, app):
    _entry(entity_type="call", entity_id=1)
    _entry(entity_type="patient", entity_id=2)
    body = _entries(clients["admin"], entity_type="patient")
    assert body["total"] == 1 and body["entries"][0]["entity_type"] == "patient"


def test_filter_by_entity_id_and_malformed_id_is_ignored(clients, app):
    _entry(entity_id=7)
    _entry(entity_id=8)
    assert _entries(clients["admin"], entity_id=7)["total"] == 1
    # a non-integer entity_id must be ignored (no crash, all rows returned)
    assert _entries(clients["admin"], entity_id="abc")["total"] == 2


def test_filter_by_action_substring(clients, app):
    _entry(action="call.assigned")
    _entry(action="patient.created")
    body = _entries(clients["admin"], action="assigned")
    assert body["total"] == 1 and "assigned" in body["entries"][0]["action"]


def test_filter_by_date_range(clients, app):
    _entry(entity_id=1, ts="2026-08-01T09:00:00")
    _entry(entity_id=2, ts="2026-08-15T09:00:00")
    _entry(entity_id=3, ts="2026-08-31T09:00:00")
    body = _entries(clients["admin"], date_from="2026-08-10", date_to="2026-08-20")
    assert [e["entity_id"] for e in body["entries"]] == [2]
