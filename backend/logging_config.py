"""Application logging.

Two formats from one config, chosen by environment:

  * production (`EMS_ENV=production`) — one JSON object per line on stdout, so a
    log aggregator can index the fields (status, duration, the acting user)
    instead of scraping a message string.
  * development — a compact human-readable line, because a developer reads these
    with their eyes, not a parser.

An access log records every API request with its outcome and who made it. It
deliberately logs the *path* and the acting `user_id` (already the actor in the
audit trail) but never the request body — a call or patient payload is PHI and
must not land in application logs.

No third-party logging dependency: the JSON formatter is a dozen lines of
stdlib, which is less to trust than pulling one in.
"""

import json
import logging
import os
import sys
import time

from flask import g, request, session

# Fields the access log attaches to a record via `extra=`. Kept out of the
# reserved LogRecord attribute names on purpose so `logging` does not reject them.
_ACCESS_FIELDS = ("method", "path", "status", "duration_ms", "user_id", "remote_addr")


class JsonFormatter(logging.Formatter):
    """One JSON object per record. Structured fields are promoted to top level."""

    def format(self, record):
        payload = {
            "time": self.formatTime(record, "%Y-%m-%dT%H:%M:%S"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        for field in _ACCESS_FIELDS:
            value = getattr(record, field, None)
            if value is not None:
                payload[field] = value
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


def _is_production():
    return os.environ.get("EMS_ENV") == "production"


def configure_logging(app):
    """Install the log format and the request access log.

    Idempotent: the factory is called once per process in normal use but many
    times across a test run, so handlers are cleared before being added rather
    than stacked (which would multiply every line).
    """
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        JsonFormatter() if _is_production()
        else logging.Formatter("%(asctime)s %(levelname)-7s %(name)s: %(message)s")
    )
    handler._ems_access_handler = True  # tag so repeated setup can find its own

    # Configure the root logger and route the app + module loggers through it, so
    # there is exactly one handler and no duplicated lines. Only a previously
    # installed EMS handler is removed — any other handler (e.g. pytest's caplog)
    # is left in place, so the factory can be built repeatedly without either
    # stacking our lines or silencing the test harness.
    root = logging.getLogger()
    root.handlers = [h for h in root.handlers if not getattr(h, "_ems_access_handler", False)]
    root.addHandler(handler)
    root.setLevel(logging.INFO)

    app.logger.handlers.clear()
    app.logger.propagate = True

    # Werkzeug's dev-server request line duplicates our access log; quiet it to
    # warnings so the structured line is the single source.
    logging.getLogger("werkzeug").setLevel(logging.WARNING)

    @app.before_request
    def _start_timer():
        g._request_start = time.perf_counter()

    @app.after_request
    def _access_log(response):
        # Health checks fire every few seconds from container probes, and CORS
        # preflight carries no useful outcome — both are pure noise.
        if request.path == "/api/health" or request.method == "OPTIONS":
            return response

        start = getattr(g, "_request_start", None)
        duration_ms = round((time.perf_counter() - start) * 1000, 1) if start else None

        app.logger.info(
            "%s %s %s %sms",
            request.method, request.path, response.status_code,
            duration_ms if duration_ms is not None else "?",
            extra={
                "method": request.method,
                "path": request.path,
                "status": response.status_code,
                "duration_ms": duration_ms,
                # The actor, not the body: who did this, never what PHI it carried.
                "user_id": session.get("user_id"),
                "remote_addr": request.remote_addr,
            },
        )
        return response
