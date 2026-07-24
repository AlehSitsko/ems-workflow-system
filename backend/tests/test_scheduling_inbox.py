"""Scheduling inbox: calls taken without a trip date.

Before this, a call with no date was invisible — the calendar filters by date and
the board loads a single day — so it existed in the database and nowhere in the
product. These tests pin that such calls are findable, that giving one a date
removes it from the queue, and that the inbox cannot be used to schedule into
the past or to resurrect a finished call.
"""

from datetime import date, timedelta

import pytest
from werkzeug.security import generate_password_hash

from models import db, User, Call, Patient


FUTURE = (date.today() + timedelta(days=5)).isoformat()
PAST = (date.today() - timedelta(days=5)).isoformat()
TODAY = date.today().isoformat()


@pytest.fixture()
def roles(app, request):
    """A signed-in client per role.

    Identity is a session cookie now, so a test signs in for real rather than
    asserting a role in a header — which means these tests also exercise the
    authentication path itself.
    """
    from conftest import make_user, login

    out = {}
    prefix = request.node.module.__name__.rsplit(".", 1)[-1]
    for role in ("admin", "supervisor", "dispatcher", "hr"):
        user = make_user(role, username=f"{prefix}_{role}")
        c = app.test_client()
        login(c, user.username)
        out[role] = c
    return out


def mk_call(trip_date=None, status="new", date_of_call="2026-01-05", patient=None):
    call = Call(trip_date=trip_date, status=status, date_of_call=date_of_call,
                service_level="BLS", call_type="Appointment",
                patient_id=patient.id if patient else None)
    db.session.add(call)
    db.session.commit()
    return call


def inbox(api):
    resp = api.get("/api/calls/unscheduled")
    assert resp.status_code == 200, resp.get_json()
    return resp.get_json()


# ── What belongs in the queue ───────────────────────────────────────────────

def test_a_call_with_no_trip_date_is_in_the_inbox(client, roles):
    call = mk_call(trip_date=None)
    assert [c["id"] for c in inbox(roles["dispatcher"])] == [call.id]


def test_an_empty_string_trip_date_counts_as_missing(client, roles):
    """Both spellings exist in the data; a read path must not miss one."""
    call = mk_call(trip_date="")
    assert [c["id"] for c in inbox(roles["dispatcher"])] == [call.id]


def test_a_scheduled_call_is_not_in_the_inbox(client, roles):
    mk_call(trip_date=FUTURE)
    assert inbox(roles["dispatcher"]) == []


@pytest.mark.parametrize("status", ["cancelled", "completed"])
def test_finished_calls_are_not_waiting_for_a_date(client, roles, status):
    mk_call(trip_date=None, status=status)
    assert inbox(roles["dispatcher"]) == []


def test_the_backlog_is_oldest_intake_first(client, roles):
    """The one waiting longest is the one most at risk of being forgotten."""
    newer = mk_call(trip_date=None, date_of_call="2026-02-01")
    older = mk_call(trip_date=None, date_of_call="2026-01-01")

    assert [c["id"] for c in inbox(roles["dispatcher"])] == [older.id, newer.id]


def test_the_inbox_carries_a_minimized_patient_label(client, roles):
    patient = Patient(first_name="John", last_name="Doe")
    db.session.add(patient)
    db.session.commit()
    mk_call(trip_date=None, patient=patient)

    assert inbox(roles["dispatcher"])[0]["patientLabel"] == "John D."


def test_a_call_without_a_patient_still_lists(client, roles):
    mk_call(trip_date=None)
    assert inbox(roles["dispatcher"])[0]["patientLabel"] is None


# ── Scheduling one ──────────────────────────────────────────────────────────

def test_scheduling_a_call_removes_it_from_the_inbox(client, roles):
    call = mk_call(trip_date=None)

    resp = roles["dispatcher"].patch(f"/api/calls/{call.id}/schedule", 
                        json={"trip_date": FUTURE, "pickup_time": "09:30"})
    assert resp.status_code == 200
    assert resp.get_json()["trip_date"] == FUTURE
    assert resp.get_json()["pickup_time"] == "09:30"
    assert inbox(roles["dispatcher"]) == []


def test_a_pickup_time_is_optional(client, roles):
    call = mk_call(trip_date=None)
    resp = roles["dispatcher"].patch(f"/api/calls/{call.id}/schedule", 
                        json={"trip_date": FUTURE})
    assert resp.status_code == 200
    assert inbox(roles["dispatcher"]) == []


def test_today_is_a_valid_target(client, roles):
    call = mk_call(trip_date=None)
    assert roles["dispatcher"].patch(f"/api/calls/{call.id}/schedule", 
                        json={"trip_date": TODAY}).status_code == 200


def test_scheduling_into_the_past_is_refused(client, roles):
    """A past board is read-only, so the call would land where nobody can act."""
    call = mk_call(trip_date=None)
    resp = roles["dispatcher"].patch(f"/api/calls/{call.id}/schedule", 
                        json={"trip_date": PAST})
    assert resp.status_code == 409
    assert "read-only" in resp.get_json()["error"]


def test_an_impossible_date_is_refused(client, roles):
    """409, matching require_operational_date — the shared guard the rest of the
    dispatch surface answers with for an unusable date."""
    call = mk_call(trip_date=None)
    resp = roles["dispatcher"].patch(f"/api/calls/{call.id}/schedule", 
                        json={"trip_date": "2099-02-30"})
    assert resp.status_code == 409
    assert "no valid operational" in resp.get_json()["error"]


def test_a_bad_pickup_time_is_refused(client, roles):
    call = mk_call(trip_date=None)
    resp = roles["dispatcher"].patch(f"/api/calls/{call.id}/schedule", 
                        json={"trip_date": FUTURE, "pickup_time": "9am"})
    assert resp.status_code == 400


def test_a_trip_date_is_required(client, roles):
    call = mk_call(trip_date=None)
    resp = roles["dispatcher"].patch(f"/api/calls/{call.id}/schedule",  json={})
    assert resp.status_code == 400
    assert "trip_date is required" in resp.get_json()["error"]


@pytest.mark.parametrize("status", ["cancelled", "completed"])
def test_scheduling_cannot_resurrect_a_finished_call(client, roles, status):
    call = mk_call(trip_date=None, status=status)
    resp = roles["dispatcher"].patch(f"/api/calls/{call.id}/schedule", 
                        json={"trip_date": FUTURE})
    assert resp.status_code == 409


def test_scheduling_an_unknown_call_is_a_404(client, roles):
    assert roles["dispatcher"].patch("/api/calls/999999/schedule", 
                        json={"trip_date": FUTURE}).status_code == 404


def test_the_inbox_route_is_not_parsed_as_a_call_id(client, roles):
    """The literal path must win over "/calls/<int:call_id>"-style matching."""
    mk_call(trip_date=None)
    resp = roles["dispatcher"].get("/api/calls/unscheduled")
    assert resp.status_code == 200
    assert isinstance(resp.get_json(), list)


def test_anonymous_access_is_rejected(client):
    assert client.get("/api/calls/unscheduled").status_code in (401, 403)


# ── The badge counts ────────────────────────────────────────────────────────

def test_the_inbox_count_is_published_for_the_navigation_badge(client, roles):
    """A queue nobody is reminded about is a queue that grows."""
    mk_call(trip_date=None)
    mk_call(trip_date="")
    mk_call(trip_date=FUTURE)                       # scheduled: not waiting
    mk_call(trip_date=None, status="cancelled")     # not waiting either

    counts = roles["dispatcher"].get("/api/operations/attention").get_json()
    assert counts["schedulingInbox"] == 2


def test_scheduling_a_call_lowers_the_badge(client, roles):
    call = mk_call(trip_date=None)
    roles["dispatcher"].patch(f"/api/calls/{call.id}/schedule", 
                 json={"trip_date": FUTURE})

    counts = roles["dispatcher"].get("/api/operations/attention").get_json()
    assert counts["schedulingInbox"] == 0


def test_hr_is_not_nagged_about_queues_it_cannot_open(client, roles):
    """HR has no dispatch access, so a dispatch badge would be noise it cannot act on."""
    mk_call(trip_date=None)

    counts = roles["hr"].get("/api/operations/attention").get_json()
    assert "schedulingInbox" not in counts
