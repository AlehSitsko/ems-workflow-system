"""In-process domain event bus with organisation-scoped pub/sub.

Decoupled from transport (Section 9): domain code publishes an event; subscribers
consume it — today the SSE endpoint, later the notification engine, audit and
integrations. Delivery is scoped by ``org_id`` so a subscriber of one organisation
never receives another's events.

This is an in-memory, single-process broker — the deliberate "SSE + single worker"
choice (see docs). The public surface (``subscribe`` / ``unsubscribe`` /
``publish``) is the seam for a Redis-backed broker when scaling to multiple
workers; domain code never changes.
"""

import itertools
import queue
import threading
from datetime import datetime, timezone

# A per-subscriber queue is bounded: a slow client drops events rather than
# blocking publishers (the client reconnects and re-fetches current state).
_QUEUE_MAXSIZE = 1000


class EventBus:
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
        event = {
            "id": next(self._ids),
            "type": event_type,
            "orgId": org_id,
            "actorUserId": actor_user_id,
            "entityType": entity_type,
            "entityId": entity_id,
            "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "payload": payload or {},
        }
        with self._lock:
            subs = list(self._subscribers.get(org_id, ()))
        for q in subs:
            try:
                q.put_nowait(event)
            except queue.Full:
                pass
        return event


# The process-wide bus.
bus = EventBus()
