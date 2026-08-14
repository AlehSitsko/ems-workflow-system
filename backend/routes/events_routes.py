"""Server-Sent Events: a tenant-scoped realtime stream.

A signed-in client opens one long-lived connection and receives its own
organisation's domain events (see events.py). The org is taken from the session,
never the client, so a user of org A can never subscribe to org B. Server->client
only, over plain HTTP, authenticated by the existing session cookie.
"""

import json
import queue

from flask import Blueprint, Response, stream_with_context

from utils.auth_utils import require_auth
from tenant import current_org_id
from events import bus

events_bp = Blueprint("events", __name__, url_prefix="/api/events")

# How long to wait for an event before sending a keepalive comment (keeps proxies
# and the browser's EventSource from timing the idle connection out).
_KEEPALIVE_SECONDS = 20


def format_sse(event):
    """Render one event dict as an SSE frame."""
    return (
        f"id: {event['id']}\n"
        f"event: {event['type']}\n"
        f"data: {json.dumps(event)}\n\n"
    )


@events_bp.route("/stream", methods=["GET"])
@require_auth
def stream():
    # Tenant scope captured from the session while we're still in the request
    # context; the streaming generator then only ever reads this org's channel.
    org_id = current_org_id()
    q = bus.subscribe(org_id)

    @stream_with_context
    def gen():
        try:
            yield ": connected\n\n"  # opens the stream immediately
            while True:
                try:
                    event = q.get(timeout=_KEEPALIVE_SECONDS)
                    yield format_sse(event)
                except queue.Empty:
                    yield ": keepalive\n\n"
        finally:
            bus.unsubscribe(org_id, q)

    # NB: do not set a `Connection` header — it is hop-by-hop and forbidden to WSGI
    # apps (PEP 3333); the server manages it. X-Accel-Buffering tells nginx not to
    # buffer the stream.
    return Response(gen(), mimetype="text/event-stream", headers={
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
    })
