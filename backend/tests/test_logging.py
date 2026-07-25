"""Structured logging: format, the request access log, and its PHI boundary."""

import json
import logging

import pytest

from logging_config import JsonFormatter, configure_logging
from models import db


def test_json_formatter_emits_one_valid_object_with_structured_fields():
    record = logging.LogRecord("app", logging.INFO, "x", 0, "GET /api/x 200 3ms", None, None)
    record.method, record.path, record.status = "GET", "/api/x", 200
    record.duration_ms, record.user_id, record.remote_addr = 3.0, 7, "127.0.0.1"

    parsed = json.loads(JsonFormatter().format(record))
    assert parsed["level"] == "INFO"
    assert parsed["path"] == "/api/x"
    assert parsed["status"] == 200
    assert parsed["user_id"] == 7


def test_json_formatter_omits_fields_that_are_absent():
    # An unauthenticated request has no user_id; it must not appear as null noise.
    record = logging.LogRecord("app", logging.INFO, "x", 0, "GET /api/x 401 1ms", None, None)
    record.method, record.path, record.status, record.remote_addr = "GET", "/api/x", 401, "::1"
    parsed = json.loads(JsonFormatter().format(record))
    assert "user_id" not in parsed


def _record_for(caplog, client, method, path, **kw):
    caplog.clear()
    with caplog.at_level(logging.INFO):
        getattr(client, method)(path, **kw)
    return [r for r in caplog.records if r.getMessage().startswith(f"{method.upper()} ")
            or getattr(r, "path", None) == path]


def test_every_request_is_access_logged_with_its_outcome(client, caplog):
    recs = _record_for(caplog, client, "get", "/api/taxonomy")
    assert recs, "no access-log record was emitted"
    r = recs[-1]
    assert r.method == "GET"
    assert r.path == "/api/taxonomy"
    assert r.status in (200, 401)
    assert r.duration_ms is not None


def test_the_actor_is_logged_when_signed_in(app, caplog):
    from conftest import make_user, login
    make_user("admin", username="logtest_admin")
    c = app.test_client()
    login(c, "logtest_admin")

    recs = _record_for(caplog, c, "get", "/api/employees")
    assert recs[-1].user_id is not None, "the acting user was not recorded"


def test_health_checks_and_preflight_are_not_logged(client, caplog):
    caplog.clear()
    with caplog.at_level(logging.INFO):
        client.get("/api/health")
        client.open("/api/taxonomy", method="OPTIONS")
    # A container probes health every few seconds; logging it would bury signal.
    assert not any(getattr(r, "path", None) == "/api/health" for r in caplog.records)
    assert not any(r.getMessage().startswith("OPTIONS ") for r in caplog.records)


def test_the_access_log_never_carries_a_request_body(app, caplog):
    """The path and actor are logged; a call/patient payload is PHI and is not."""
    from conftest import make_user, login
    make_user("admin", username="logtest_body")
    c = app.test_client()
    login(c, "logtest_body")

    caplog.clear()
    with caplog.at_level(logging.INFO):
        c.post("/api/patients", json={"first_name": "Secret", "last_name": "Patient"})

    for r in caplog.records:
        blob = json.dumps({k: str(v) for k, v in r.__dict__.items()})
        assert "Secret" not in blob, "a request body leaked into the access log"


def test_no_ad_hoc_print_logging_in_request_code():
    """print() to stderr was the old logging inside request handling; those paths
    now go through logging. Standalone CLI scripts (scripts/, cli.py) legitimately
    print — that is their user-facing output, not application logging — so they
    are out of scope here."""
    import os
    import re

    # The code that runs while serving a request.
    files = ["app.py", "audit_utils.py", "notification_utils.py", "extensions.py"]
    for base in ("routes", "utils"):
        for dirpath, _dirs, names in os.walk(base):
            files.extend(os.path.join(dirpath, n) for n in names if n.endswith(".py"))

    offenders = []
    for path in files:
        if not os.path.exists(path):
            continue
        for i, line in enumerate(open(path, encoding="utf-8"), 1):
            if re.match(r"\s*print\(", line):
                offenders.append(f"{path}:{i}")
    assert offenders == [], f"ad-hoc print logging remains in request code: {offenders}"
