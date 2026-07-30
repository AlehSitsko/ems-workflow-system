"""Prometheus /metrics — request counters and latency, labelled by endpoint."""


def test_metrics_endpoint_is_open_and_prometheus_formatted(client):
    resp = client.get("/metrics")
    assert resp.status_code == 200
    assert "text/plain" in resp.content_type  # Prometheus exposition format
    body = resp.get_data(as_text=True)
    assert "http_requests_total" in body
    assert "http_request_duration_seconds" in body


def test_a_request_is_counted_by_endpoint_and_status(client):
    # Two auth-failing calls (no session) to a known endpoint.
    client.get("/api/employees/1")
    client.get("/api/employees/1")
    body = client.get("/metrics").get_data(as_text=True)
    # A counter line for that endpoint at 401 with a value >= 2.
    line = next((l for l in body.splitlines()
                 if l.startswith("http_requests_total{")
                 and 'endpoint="employee.get_employee"' in l
                 and 'status="401"' in l), None)
    assert line is not None, "no counter for the employee endpoint at 401"
    assert float(line.rsplit(" ", 1)[1]) >= 2


def test_the_scrape_and_health_are_not_counted(client):
    client.get("/metrics")
    client.get("/api/health")
    body = client.get("/metrics").get_data(as_text=True)
    assert 'endpoint="metrics"' not in body
    assert 'endpoint="health_check"' not in body
