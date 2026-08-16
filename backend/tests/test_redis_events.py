"""Multi-worker realtime broker (RedisEventBus) over fakeredis.

Proves the P0 production fix: an event published by one worker reaches an SSE
subscriber attached to a *different* worker (the in-memory bus could not), while
staying strictly organisation-scoped. Also covers broker selection, best-effort
publish under a Redis outage, and listener resilience to a malformed message.

fakeredis with a shared FakeServer models several workers talking to one Redis.
"""

import time
from unittest.mock import MagicMock

import fakeredis
import pytest

from events import RedisEventBus, InMemoryEventBus, make_bus


def _client(server):
    return fakeredis.FakeStrictRedis(server=server, decode_responses=True)


def _wait_psub(client, timeout=3.0):
    """Block until a pattern subscription is active on the shared server, so a
    publish that follows cannot race ahead of the listener's PSUBSCRIBE."""
    end = time.time() + timeout
    while time.time() < end:
        if client.pubsub_numpat() >= 1:
            return True
        time.sleep(0.01)
    return False


@pytest.fixture()
def two_workers():
    """Two RedisEventBus instances sharing one Redis — i.e. two Gunicorn workers."""
    server = fakeredis.FakeServer()
    a = RedisEventBus(client=_client(server))
    b = RedisEventBus(client=_client(server))
    yield a, b
    a.close()
    b.close()


def test_event_reaches_a_subscriber_on_another_worker(two_workers):
    worker_a, worker_b = two_workers
    q = worker_b.subscribe("org-1")           # SSE stream lives on worker B
    assert _wait_psub(worker_b._redis), "listener did not subscribe in time"

    worker_a.publish("call.created", "org-1", payload={"n": 1})  # request hit worker A

    ev = q.get(timeout=3)
    assert ev["type"] == "call.created" and ev["orgId"] == "org-1"
    assert ev["payload"] == {"n": 1}


def test_integer_org_id_delivers_cross_worker(two_workers):
    # Production passes an integer org id (current_org_id()); the listener parses it
    # back out of the channel name as a string. Both sides must normalise or nothing
    # is delivered — this is the case the all-string tests missed.
    worker_a, worker_b = two_workers
    q = worker_b.subscribe(1)                 # int, as current_org_id() returns
    assert _wait_psub(worker_b._redis)
    worker_a.publish("call.created", 1, payload={"n": 1})  # int too
    ev = q.get(timeout=3)
    assert ev["type"] == "call.created" and str(ev["orgId"]) == "1"


def test_cross_worker_delivery_is_org_scoped(two_workers):
    worker_a, worker_b = two_workers
    q1 = worker_b.subscribe("org-1")
    q2 = worker_b.subscribe("org-2")
    assert _wait_psub(worker_b._redis)

    worker_a.publish("call.created", "org-1", payload={"secret": "for-1-only"})

    ev = q1.get(timeout=3)
    assert ev["orgId"] == "org-1"
    # Org 2's subscriber on the same worker never sees org 1's event.
    with pytest.raises(Exception):
        q2.get(timeout=0.3)


def test_unsubscribe_stops_delivery(two_workers):
    worker_a, worker_b = two_workers
    q = worker_b.subscribe("org-1")
    assert _wait_psub(worker_b._redis)
    worker_b.unsubscribe("org-1", q)
    assert worker_b.subscriber_count("org-1") == 0

    worker_a.publish("call.created", "org-1")
    time.sleep(0.3)
    import queue as _q
    with pytest.raises(_q.Empty):
        q.get_nowait()


def test_publish_is_best_effort_when_redis_is_down():
    # A client whose publish raises (Redis outage) must not break the request path.
    broken = MagicMock()
    broken.publish.side_effect = ConnectionError("redis down")
    bus = RedisEventBus(client=broken)
    ev = bus.publish("call.created", "org-1", payload={"n": 1})
    assert ev["type"] == "call.created"  # returns normally, event simply dropped


def test_listener_survives_a_malformed_message(two_workers):
    worker_a, worker_b = two_workers
    q = worker_b.subscribe("org-1")
    assert _wait_psub(worker_b._redis)

    # Raw junk straight onto the channel — the listener must skip it, not die.
    worker_a._redis.publish("ems:events:org:org-1", "{not json")
    time.sleep(0.2)
    # A valid event after the junk still gets through (listener still alive).
    worker_a.publish("call.created", "org-1", payload={"ok": True})
    ev = q.get(timeout=3)
    assert ev["payload"] == {"ok": True}


def test_make_bus_selects_broker_from_env(monkeypatch):
    monkeypatch.delenv("EMS_REDIS_URL", raising=False)
    assert isinstance(make_bus(), InMemoryEventBus)

    monkeypatch.setenv("EMS_REDIS_URL", "redis://localhost:6379/0")
    bus = make_bus()
    assert isinstance(bus, RedisEventBus)  # no connection attempted until subscribe
