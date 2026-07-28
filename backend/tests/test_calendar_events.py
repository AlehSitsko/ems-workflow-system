"""Manually created calendar events — CRUD, visibility scopes and the gate on
broadcasting, plus that they surface through the calendar aggregator.
"""

import pytest


def mk(client, **fields):
    body = {"title": "Standup", "eventDate": "2026-08-10", "visibility": "personal"}
    body.update(fields)
    return client.post("/api/calendar-events", json=body)


def list_events(client, start="2026-08-01", end="2026-08-31"):
    return client.get(f"/api/calendar-events?start={start}&end={end}")


# ── Create + validation ──────────────────────────────────────────────────────

def test_anyone_can_create_a_personal_event(clients):
    resp = mk(clients["dispatcher"])
    assert resp.status_code == 201
    body = resp.get_json()
    assert body["visibility"] == "personal"
    assert body["ownerName"]


def test_title_and_date_are_required(clients):
    assert clients["hr"].post("/api/calendar-events", json={"eventDate": "2026-08-10"}).status_code == 400
    assert clients["hr"].post("/api/calendar-events", json={"title": "x"}).status_code == 400


def test_bad_date_and_time_are_rejected(clients):
    assert mk(clients["admin"], eventDate="2026-02-30").status_code == 400
    assert mk(clients["admin"], allDay=False, startTime="25:00").status_code == 400


# ── Broadcast gate ───────────────────────────────────────────────────────────

@pytest.mark.parametrize("role", ["admin", "supervisor"])
def test_supervisors_may_broadcast(clients, role):
    assert mk(clients[role], visibility="company").status_code == 201
    assert mk(clients[role], visibility="role", visibleToRole="dispatcher").status_code == 201


@pytest.mark.parametrize("role", ["dispatcher", "hr"])
def test_others_may_not_broadcast(clients, role):
    assert mk(clients[role], visibility="company").status_code == 400
    assert mk(clients[role], visibility="role", visibleToRole="dispatcher").status_code == 400


def test_role_scope_needs_a_valid_role(clients):
    assert mk(clients["admin"], visibility="role", visibleToRole="wizard").status_code == 400


# ── Visibility on read ───────────────────────────────────────────────────────

def test_personal_events_are_private_to_the_owner(clients):
    mk(clients["dispatcher"], title="Dentist")
    # The owner sees it; another user does not.
    assert any(e["title"] == "Dentist" for e in list_events(clients["dispatcher"]).get_json())
    assert not any(e["title"] == "Dentist" for e in list_events(clients["hr"]).get_json())


def test_company_events_are_visible_to_everyone(clients):
    mk(clients["admin"], title="All-hands", visibility="company")
    for role in ("admin", "supervisor", "dispatcher", "hr"):
        assert any(e["title"] == "All-hands" for e in list_events(clients[role]).get_json())


def test_role_events_reach_only_that_role(clients):
    mk(clients["admin"], title="Dispatch huddle", visibility="role", visibleToRole="dispatcher")
    assert any(e["title"] == "Dispatch huddle" for e in list_events(clients["dispatcher"]).get_json())
    assert not any(e["title"] == "Dispatch huddle" for e in list_events(clients["hr"]).get_json())


# ── Ownership on edit/delete ─────────────────────────────────────────────────

def test_owner_can_edit_and_delete(clients):
    eid = mk(clients["dispatcher"]).get_json()["id"]
    assert clients["dispatcher"].patch(f"/api/calendar-events/{eid}",
                                       json={"title": "Standup (moved)"}).status_code == 200
    assert clients["dispatcher"].delete(f"/api/calendar-events/{eid}").status_code == 200


def test_a_non_owner_non_admin_cannot_edit(clients):
    # Supervisor owns a company event; HR can see it but may not change it.
    eid = mk(clients["supervisor"], title="Mine", visibility="company").get_json()["id"]
    assert clients["hr"].patch(f"/api/calendar-events/{eid}", json={"title": "Hijack"}).status_code == 403


def test_admin_can_delete_anyones_event(clients):
    eid = mk(clients["supervisor"], title="Mine", visibility="company").get_json()["id"]
    assert clients["admin"].delete(f"/api/calendar-events/{eid}").status_code == 200


# ── Aggregator integration ───────────────────────────────────────────────────

def test_manual_events_surface_in_the_calendar_aggregator(clients):
    mk(clients["admin"], title="All-hands", eventDate="2026-08-12", visibility="company")
    body = clients["dispatcher"].get("/api/calendar/events?start=2026-08-01&end=2026-08-28").get_json()
    manual = [e for e in body["events"] if e["type"] == "calendar_event"]
    assert any(e["title"] == "All-hands" for e in manual)


def test_aggregator_hides_a_personal_event_from_others(clients):
    mk(clients["dispatcher"], title="Private note", eventDate="2026-08-12")
    body = clients["hr"].get("/api/calendar/events?start=2026-08-01&end=2026-08-28").get_json()
    assert not any(e.get("title") == "Private note" for e in body["events"])
