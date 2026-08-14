"""Domain event bus + tenant-scoped SSE realtime.

Proves delivery is organisation-scoped (a subscriber of one org never sees
another's events), that creating a call publishes call.created only after the
commit and only to the acting org, and that the SSE stream needs a session.
"""

import queue

import pytest

from models import db, Organization
from conftest import make_user, login
from events import EventBus, bus


# ── The bus in isolation ─────────────────────────────────────────────────────

def test_bus_delivers_within_an_org_and_isolates_across_orgs():
    b = EventBus()
    qa, qb = b.subscribe("A"), b.subscribe("B")
    b.publish("call.created", "A", payload={"n": 1})
    ev = qa.get_nowait()
    assert ev["type"] == "call.created" and ev["orgId"] == "A"
    with pytest.raises(queue.Empty):
        qb.get_nowait()  # org B never receives org A's event


def test_bus_unsubscribe_stops_delivery():
    b = EventBus()
    q = b.subscribe("A")
    b.unsubscribe("A", q)
    b.publish("x", "A")
    with pytest.raises(queue.Empty):
        q.get_nowait()
    assert b.subscriber_count("A") == 0


def test_bus_publish_never_blocks_on_a_slow_client():
    b = EventBus()
    q = b.subscribe("A")
    for _ in range(5):
        b.publish("x", "A")  # would raise if put blocked/failed loudly
    assert q.qsize() == 5


# ── Integration: publish on commit, org-scoped ───────────────────────────────

def _orgs():
    a = Organization(name="Org A", slug="orga")
    b = Organization(name="Org B", slug="orgb")
    db.session.add_all([a, b])
    db.session.commit()
    return a.id, b.id


def _admin(app, org_id, username):
    user = make_user("admin", username=username, org_id=org_id)
    c = app.test_client()
    login(c, user.username)
    return c


def test_creating_a_call_publishes_call_created_only_to_the_acting_org(app):
    a, b = _orgs()
    ca = _admin(app, a, "admin_a")
    qa, qb = bus.subscribe(a), bus.subscribe(b)
    try:
        resp = ca.post("/api/calls", json={
            "trip_date": "2026-08-01", "service_level": "BLS",
            "pickup_address": "1 A St", "dropoff_address": "2 B St",
        })
        assert resp.status_code == 201
        ev = qa.get(timeout=2)
        assert ev["type"] == "call.created"
        assert ev["orgId"] == a
        assert ev["entityId"] == resp.get_json()["id"]
        assert "pickup" in ev["payload"]  # operational, no patient PHI
        with pytest.raises(queue.Empty):
            qb.get(timeout=0.2)  # org B's channel stays silent
    finally:
        bus.unsubscribe(a, qa)
        bus.unsubscribe(b, qb)


# ── SSE endpoint ─────────────────────────────────────────────────────────────

def test_sse_stream_requires_a_session(app):
    assert app.test_client().get("/api/events/stream").status_code == 401


def test_sse_stream_opens_for_an_authenticated_user(app):
    a, _ = _orgs()
    ca = _admin(app, a, "admin_a")
    r = ca.get("/api/events/stream")
    assert r.status_code == 200
    assert "text/event-stream" in r.content_type
    first = next(r.iter_encoded())          # the immediate ": connected" frame
    assert b"connected" in first
    r.close()
