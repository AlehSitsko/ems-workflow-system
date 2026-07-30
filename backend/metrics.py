"""Prometheus metrics — request counts and latency, at GET /metrics.

Sits alongside the structured access log (logging_config.py): the log records
individual requests for after-the-fact reading, this aggregates them for graphs
and alerts. Labels are the Flask *endpoint* (the view name), never the raw path,
so an id in the URL cannot explode the label cardinality — and no patient/call id
ever reaches a metric.

The metric objects are module-level singletons on the default registry, defined
once at import. `configure_metrics` only adds per-app request hooks and the route,
so building the app repeatedly (as the tests do) never re-registers a collector.

`/metrics` is unauthenticated so a scraper can read it; it exposes only aggregate
counts and timings, no data — but it still belongs on an internal network, not the
public internet (restrict it at the proxy in a real deployment).
"""

import time

from flask import request, Response
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST


REQUEST_COUNT = Counter(
    "http_requests_total",
    "Total HTTP requests, by method, Flask endpoint and status.",
    ["method", "endpoint", "status"],
)
REQUEST_LATENCY = Histogram(
    "http_request_duration_seconds",
    "HTTP request latency in seconds, by method and Flask endpoint.",
    ["method", "endpoint"],
)

# The scrape itself and the container health probe are noise that would dwarf real
# traffic — exclude them, matching the access log's exclusions.
_EXCLUDE_PATHS = {"/metrics", "/api/health"}


def configure_metrics(app):
    @app.before_request
    def _start_timer():
        request._metrics_start = time.perf_counter()

    @app.after_request
    def _record(response):
        if request.path in _EXCLUDE_PATHS or request.method == "OPTIONS":
            return response
        endpoint = request.endpoint or "unknown"
        REQUEST_COUNT.labels(request.method, endpoint, response.status_code).inc()
        start = getattr(request, "_metrics_start", None)
        if start is not None:
            REQUEST_LATENCY.labels(request.method, endpoint).observe(time.perf_counter() - start)
        return response

    @app.route("/metrics")
    def metrics():
        return Response(generate_latest(), mimetype=CONTENT_TYPE_LATEST)
