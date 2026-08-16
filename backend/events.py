"""Domain event bus with organisation-scoped pub/sub, behind a broker abstraction.

Domain code publishes an event; subscribers consume it — today the SSE endpoint,
later the notification engine, audit and integrations. Delivery is scoped by
``org_id`` so a subscriber of one organisation never receives another's events.

Two interchangeable brokers implement the same surface
(``subscribe`` / ``unsubscribe`` / ``publish``), selected at import time:

- **InMemoryEventBus** (default): a single-process, in-memory broker. Correct for a
  single worker — dev, standalone/desktop, tests, and the E2E server. It is *not*
  shared across Gunicorn workers, so on its own it is unsafe for multi-worker
  production (a client's SSE stream on one worker would miss events published on
  another).
- **RedisEventBus** (``EMS_REDIS_URL`` set): fans events out through Redis Pub/Sub
  so **every** worker delivers an org's events regardless of which worker handled
  the originating request. This is the production broker for ``--workers > 1``.

The unsafe combination — multiple workers with the in-memory broker — is refused
at boot by ``gunicorn.conf.py`` (fail closed), so it can never ship by accident.
"""

import itertools
import json
import logging
import os
import queue
import threading
import time
import uuid
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# A per-subscriber queue is bounded: a slow client drops events rather than
# blocking publishers (the client reconnects and re-fetches current state).
_QUEUE_MAXSIZE = 1000

_CHANNEL_PREFIX = "ems:events:org:"


def _build_event(event_type, org_id, event_id, *, actor_user_id=None,
                 entity_type=None, entity_id=None, payload=None):
    return {
        "id": event_id,
        "type": event_type,
        "orgId": org_id,
        "actorUserId": actor_user_id,
        "entityType": entity_type,
        "entityId": entity_id,
        "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "payload": payload or {},
    }


class InMemoryEventBus:
    """Single-process broker: per-org sets of bounded subscriber queues."""

    def __init__(self):
        self._subscribers = {}          # org_id -> set[queue.Queue]
        self._lock = threading.Lock()
        self._ids = itertools.count(1)

    def subscribe(self, org_id):
        """Register a subscriber for one org; returns the queue to read from."""
        q = queue.Queue(maxsize=_QUEUE_MAXSIZE)
        with self._lock:
            self._subscribers.setdefault(org_id, set()).add(q)
        return q

    def unsubscribe(self, org_id, q):
        with self._lock:
            subs = self._subscribers.get(org_id)
            if subs:
                subs.discard(q)
                if not subs:
                    self._subscribers.pop(org_id, None)

    def subscriber_count(self, org_id):
        with self._lock:
            return len(self._subscribers.get(org_id, ()))

    def publish(self, event_type, org_id, *, actor_user_id=None,
                entity_type=None, entity_id=None, payload=None):
        """Publish an event to the subscribers of one organisation only.

        Returns the event dict. Never blocks: a full subscriber queue drops the
        event for that client. Keep ``payload`` free of sensitive plaintext.
        """
        event = _build_event(event_type, org_id, next(self._ids),
                             actor_user_id=actor_user_id, entity_type=entity_type,
                             entity_id=entity_id, payload=payload)
        with self._lock:
            subs = list(self._subscribers.get(org_id, ()))
        for q in subs:
            try:
                q.put_nowait(event)
            except queue.Full:
                pass
        return event


# Backwards-compatible alias: existing imports/tests use ``EventBus``.
EventBus = InMemoryEventBus


class RedisEventBus:
    """Multi-worker broker over Redis Pub/Sub.

    ``publish`` PUBLISHes to an org-scoped channel; a single per-process listener
    thread pattern-subscribes to all org channels and fans each message into the
    **local** per-org subscriber queues (so this worker's SSE streams receive it).
    Because delivery goes only to the queues registered under the message's own
    ``org_id``, tenant isolation is preserved end to end.

    Resilience:
    - ``publish`` is best-effort with a short socket timeout — a Redis outage drops
      the event (the client re-fetches on reconnect) and never hangs the request.
    - the listener reconnects with backoff; it never spins.
    - local queues stay bounded, so a slow SSE client still can't block anyone.
    """

    def __init__(self, url=None, client=None):
        if client is not None:
            self._redis = client            # injected (tests use fakeredis)
        else:
            import redis  # lazy: only the server profile needs the dependency
            self._redis = redis.Redis.from_url(
                url, socket_connect_timeout=2, socket_timeout=2,
                health_check_interval=30, decode_responses=True,
            )
        self._local = {}                # org_id -> set[queue.Queue]
        self._lock = threading.Lock()
        self._listener = None
        self._stop = threading.Event()

    def subscribe(self, org_id):
        # Key local queues by the *string* org id: the listener parses org ids back
        # out of the Redis channel name as strings, so subscribe/dispatch must use
        # the same type or a queue registered under int 1 would never match "1".
        org_id = str(org_id)
        q = queue.Queue(maxsize=_QUEUE_MAXSIZE)
        with self._lock:
            self._local.setdefault(org_id, set()).add(q)
            self._ensure_listener_locked()
        return q

    def unsubscribe(self, org_id, q):
        org_id = str(org_id)
        with self._lock:
            subs = self._local.get(org_id)
            if subs:
                subs.discard(q)
                if not subs:
                    self._local.pop(org_id, None)

    def subscriber_count(self, org_id):
        with self._lock:
            return len(self._local.get(str(org_id), ()))

    def publish(self, event_type, org_id, *, actor_user_id=None,
                entity_type=None, entity_id=None, payload=None):
        event = _build_event(event_type, org_id, uuid.uuid4().hex,
                             actor_user_id=actor_user_id, entity_type=entity_type,
                             entity_id=entity_id, payload=payload)
        try:
            self._redis.publish(_CHANNEL_PREFIX + str(org_id), json.dumps(event))
        except Exception:  # noqa: BLE001 — best-effort; never break the request
            logger.warning("event publish to Redis failed (event dropped)", exc_info=True)
        return event

    # ── listener ──────────────────────────────────────────────────────────────

    def _ensure_listener_locked(self):
        if self._listener is None:
            self._listener = threading.Thread(
                target=self._listen, name="ems-redis-events", daemon=True)
            self._listener.start()

    def close(self):
        """Stop the listener thread (used by tests; workers run for the process
        lifetime so production never needs this)."""
        self._stop.set()
        t = self._listener
        if t is not None:
            t.join(timeout=3)

    def _dispatch(self, org_id, event):
        with self._lock:
            subs = list(self._local.get(org_id, ()))
        for q in subs:
            try:
                q.put_nowait(event)
            except queue.Full:
                pass

    def _listen(self):
        import redis
        backoff = 0.5
        while not self._stop.is_set():
            try:
                pubsub = self._redis.pubsub(ignore_subscribe_messages=True)
                pubsub.psubscribe(_CHANNEL_PREFIX + "*")
                backoff = 0.5  # reset after a successful (re)subscribe
                while not self._stop.is_set():
                    msg = pubsub.get_message(timeout=1.0)
                    if not msg:
                        continue
                    channel = msg.get("channel") or ""
                    org_id = channel[len(_CHANNEL_PREFIX):]
                    try:
                        event = json.loads(msg["data"])
                    except (ValueError, TypeError, KeyError):
                        logger.warning("dropping malformed realtime message on %s", channel)
                        continue
                    # Route to this org's local queues only — never another org's.
                    self._dispatch(org_id, event)
            except Exception:  # noqa: BLE001 — reconnect, never crash the worker
                logger.warning("Redis event listener error; reconnecting", exc_info=True)
                time.sleep(backoff)
                backoff = min(backoff * 2, 10.0)


def make_bus():
    """Select the broker from the environment. ``EMS_REDIS_URL`` → Redis (multi-
    worker); otherwise the in-memory bus (single worker / dev / standalone)."""
    url = os.environ.get("EMS_REDIS_URL")
    if url:
        return RedisEventBus(url)
    return InMemoryEventBus()


# The process-wide bus.
bus = make_bus()
