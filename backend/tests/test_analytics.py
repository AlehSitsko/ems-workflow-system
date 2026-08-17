"""Supervisor dispatcher analytics: correct aggregation, and — the security-critical
part — tenant isolation (the endpoint aggregates Call rows, which must never cross an
org boundary). Also pins the role gate."""

import pytest

from models import db, Organization, Call
from conftest import make_user, login


def _org(slug):
    o = Organization(name=slug, slug=slug)
    db.session.add(o)
    db.session.commit()
    return o.id


def _client(app, org_id, role="admin", username="an_admin"):
    c = app.test_client()
    login(c, make_user(role, username=username, org_id=org_id).username)
    return c


def _add_call(org_id, dispatcher, quality=None, crit="", opt="", expl=None):
    from tenant import set_current_org
    set_current_org(org_id)
    call = Call(trip_date="2026-06-15", service_level="BLS", status="new",
                dispatcher_name=dispatcher, quality_score=quality,
                missing_critical_fields=crit, missing_optional_fields=opt,
                missing_info_explanation=expl)
    db.session.add(call)
    db.session.commit()
    set_current_org(None)
    return call.id


def test_dispatcher_analytics_aggregates_correctly(app):
    org = _org("an_a")
    _add_call(org, "Alice", 90, crit="patient_name,pickup", opt="phone")
    _add_call(org, "Alice", 80, crit="", opt="", expl="checked, none missing")
    _add_call(org, "Bob", 70)

    data = _client(app, org, username="an_admin1").get("/api/analytics/dispatchers").get_json()
    by = {d["dispatcher_name"]: d for d in data}

    assert by["Alice"]["total_calls"] == 2
    assert by["Alice"]["average_quality_score"] == 85           # round((90+80)/2)
    assert by["Alice"]["missing_critical_count"] == 2            # patient_name, pickup
    assert by["Alice"]["missing_optional_count"] == 1            # phone
    assert by["Alice"]["calls_with_missing_critical"] == 1       # only the first call
    assert by["Alice"]["calls_with_explanation"] == 1           # only the second
    assert by["Bob"]["total_calls"] == 1 and by["Bob"]["average_quality_score"] == 70
    # Sorted by average quality descending.
    assert [d["dispatcher_name"] for d in data][0] == "Alice"


def test_dispatcher_analytics_never_crosses_orgs(app):
    org_a, org_b = _org("an_ta"), _org("an_tb")
    _add_call(org_a, "AliceA", 90)
    _add_call(org_b, "BobB", 40)

    data = _client(app, org_a, username="an_ta_admin").get("/api/analytics/dispatchers").get_json()
    names = {d["dispatcher_name"] for d in data}
    assert names == {"AliceA"}, f"analytics leaked another org's calls: {names}"


def test_dispatcher_analytics_requires_a_privileged_role(app):
    org = _org("an_role")
    _add_call(org, "Alice", 90)
    # A dispatcher is not admin/supervisor -> forbidden.
    resp = _client(app, org, role="dispatcher", username="an_disp").get("/api/analytics/dispatchers")
    assert resp.status_code == 403
