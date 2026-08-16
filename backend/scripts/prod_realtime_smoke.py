"""Production multi-worker realtime smoke test.

Runs against the *real* prod stack (Nginx -> several Gunicorn workers -> PostgreSQL
+ Redis), not a single-process dev server. It proves the P0 fix: an event published
while handling one HTTP request is delivered over SSE to a client whose long-lived
stream is parked on a (likely different) worker — which only works because the
Redis broker fans events to every worker.

    python prod_realtime_smoke.py [BASE_URL]      # default http://localhost:8080

Exits non-zero on failure so CI fails loudly. Requires the demo users to be seeded
(the CI job runs `flask seed-demo` first).
"""

import json
import sys
import threading
import time
from datetime import date

import requests

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080").rstrip("/")
API = f"{BASE}/api"


def login(username, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"username": username, "password": password}, timeout=15)
    r.raise_for_status()
    token = s.cookies.get("csrf_token")
    if token:
        s.headers["X-CSRF-Token"] = token
    return s


def read_sse(session, seen, stop):
    """Background: hold an SSE stream and record the event types that arrive."""
    with session.get(f"{API}/events/stream", stream=True, timeout=(15, 65)) as resp:
        resp.raise_for_status()
        for raw in resp.iter_lines(decode_unicode=True):
            if stop.is_set():
                return
            if raw and raw.startswith("event:"):
                seen.append(raw.split(":", 1)[1].strip())


def main():
    # Two dispatchers in the same org (demo users share the default org).
    watcher = login("dispatcher", "dispatcher")
    actor = login("supervisor", "supervisor")  # supervisor has dispatch access

    seen, stop = [], threading.Event()
    t = threading.Thread(target=read_sse, args=(watcher, seen, stop), daemon=True)
    t.start()
    time.sleep(3)  # let the SSE stream connect (and the worker PSUBSCRIBE to Redis)

    marker = f"{int(time.time())} Redisfanout St"
    r = actor.post(f"{API}/calls", json={
        "trip_date": date.today().isoformat(), "service_level": "BLS",
        "call_type": "scheduled", "pickup_address": marker,
        "dropoff_address": "200 Hospital Dr", "pickup_time": "10:00",
    }, timeout=15)
    if r.status_code != 201:
        print(f"FAIL: create call returned {r.status_code}: {r.text}", flush=True)
        return 1

    deadline = time.time() + 15
    while time.time() < deadline and "call.created" not in seen:
        time.sleep(0.25)
    stop.set()

    if "call.created" in seen:
        print(f"OK: SSE delivered call.created across the multi-worker stack (events seen: {seen})", flush=True)
        return 0
    print(f"FAIL: SSE never delivered call.created within 15s (events seen: {seen}). "
          "Realtime is broken across workers — is the Redis broker up?", flush=True)
    return 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:  # noqa: BLE001
        print(f"FAIL: {type(exc).__name__}: {exc}", flush=True)
        sys.exit(1)
