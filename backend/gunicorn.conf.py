"""Gunicorn configuration with a fail-closed realtime-safety guard.

Worker/thread counts come from the environment (``WEB_CONCURRENCY`` /
``GUNICORN_THREADS``) so a host can tune them without editing the image. The guard
below refuses to boot the one configuration that silently breaks SSE realtime:
**more than one worker with the in-memory event bus** (no ``EMS_REDIS_URL``).

Why fail closed: the in-memory bus (events.py) is process-local, so with several
workers a client's SSE stream on one worker misses events published on another —
realtime works in a demo and then drops ~2/3 of events under real load. Rather
than document "use one worker" and hope, this makes the unsafe combo impossible to
ship: either provide Redis (``EMS_REDIS_URL``) for a real multi-worker broker, or
run a single worker.
"""

import os

bind = os.environ.get("GUNICORN_BIND", "0.0.0.0:5050")
workers = int(os.environ.get("WEB_CONCURRENCY", "3"))
threads = int(os.environ.get("GUNICORN_THREADS", "2"))
worker_class = "gthread"
timeout = int(os.environ.get("GUNICORN_TIMEOUT", "60"))
accesslog = "-"
errorlog = "-"


def _guard(worker_count, env):
    """Return an error message if this config would silently break SSE realtime,
    else None. Pure so it can be unit-tested without booting Gunicorn."""
    is_production = env.get("EMS_ENV") == "production"
    has_redis = bool(env.get("EMS_REDIS_URL"))
    if worker_count > 1 and not has_redis and is_production:
        return (
            f"Refusing to start: {worker_count} Gunicorn workers in production "
            "without EMS_REDIS_URL. The in-memory event bus is process-local, so "
            "SSE realtime would silently lose events across workers. Set "
            "EMS_REDIS_URL to use the Redis broker, or run a single worker "
            "(WEB_CONCURRENCY=1)."
        )
    return None


def on_starting(server):
    """Fail closed before any worker forks if realtime would silently break.

    Reads the authoritative runtime worker count from Gunicorn's own config, so a
    ``-w`` override on the command line is guarded too, not just WEB_CONCURRENCY.
    """
    error = _guard(server.cfg.workers, os.environ)
    if error:
        raise RuntimeError(error)
