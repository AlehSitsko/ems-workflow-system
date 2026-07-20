"""Confirmation calls: the day-before ring-round that checks a trip is still on.

Four states rather than a yes/no flag, because "nobody answered" and "not called
yet" look identical on a board and mean opposite things to whoever is working the
list. A declined trip cancels the call outright — it is not happening, and
leaving it looking scheduled is how a truck gets sent to a door nobody opens.
"""

from datetime import date, timedelta

import pytest
from werkzeug.security import generate_password_hash

from models import db, User, Call, Patient


TOMORROW = (date.today() + timedelta(days=1)).isoformat()


@pytest.fixture()
def roles(app):
    headers = {}
    for role in ("admin", "dispatcher", "hr"):
        user = User(username=f"conf_{role}", password_hash=generate_password_hash("pw"),
                    display_name=f"Conf {role.title()}", role=role, is_active=True)
        db.session.add(user)
        db.session.flush()
        headers[role] = {"X-User-Id": str(user.id), "X-User-Role": role, "X-User-Name": user.display_name}
    db.session.commit()
    return headers


@pytest.fixture()
def call(app):
    c = Call(trip_date=TOMORROW, status="new", service_level="BLS",
             call_type="Appointment", pickup_time="09:00", date_of_call="2026-01-05")
    db.session.add(c)
    db.session.commit()
    return c


def set_confirmation(client, headers, call_id, status, note=None):
    body = {"confirmation_status": status}
    if note is not None:
        body["confirmation_note"] = note
    return client.patch(f"/api/calls/{call_id}/confirmation", headers=headers, json=body)


# ── Default state ───────────────────────────────────────────────────────────

def test_a_new_call_starts_as_not_called(client, roles, call):
    body = client.get(f"/api/calls/{call.id}", headers=roles["dispatcher"]).get_json()
    assert body["confirmation_status"] == "not_called"
    assert body["confirmed_at"] == ""


# ── Recording an outcome ────────────────────────────────────────────────────

def test_confirming_records_who_and_when(client, roles, call):
    body = set_confirmation(client, roles["dispatcher"], call.id, "confirmed",
                            "Spoke to the patient").get_json()

    assert body["confirmation_status"] == "confirmed"
    assert body["confirmation_note"] == "Spoke to the patient"
    assert body["confirmed_by_name"] == "Conf Dispatcher"
    assert body["confirmed_at"]
    assert body["status"] == "new"      # still an active trip


def test_no_answer_is_distinct_from_not_called(client, roles, call):
    """The whole reason for four states: these must not collapse into one."""
    body = set_confirmation(client, roles["dispatcher"], call.id, "no_answer").get_json()
    assert body["confirmation_status"] == "no_answer"
    # It was attempted, so the attempt is on the record.
    assert body["confirmed_at"]
    assert body["status"] == "new"


def test_resetting_to_not_called_clears_the_trail(client, roles, call):
    """"Not called" is the absence of a call, not a thing someone did at 14:05."""
    set_confirmation(client, roles["dispatcher"], call.id, "confirmed")
    body = set_confirmation(client, roles["dispatcher"], call.id, "not_called").get_json()

    assert body["confirmed_at"] == ""
    assert body["confirmed_by_name"] == ""


def test_an_alias_is_normalized(client, roles, call):
    body = set_confirmation(client, roles["dispatcher"], call.id, "voicemail").get_json()
    assert body["confirmation_status"] == "no_answer"


def test_an_unknown_status_is_rejected(client, roles, call):
    resp = set_confirmation(client, roles["dispatcher"], call.id, "maybe")
    assert resp.status_code == 400
    assert "confirmation_status must be one of" in resp.get_json()["error"]


def test_an_overlong_note_is_rejected(client, roles, call):
    resp = set_confirmation(client, roles["dispatcher"], call.id, "confirmed", "x" * 1001)
    assert resp.status_code == 400


# ── Declined cancels the trip ───────────────────────────────────────────────

def test_declining_cancels_the_call_and_keeps_it_in_history(client, roles, call):
    body = set_confirmation(client, roles["dispatcher"], call.id, "declined",
                            "Patient is in hospital").get_json()

    assert body["confirmation_status"] == "declined"
    assert body["status"] == "cancelled"
    assert body["cancel_reason"] == "Patient is in hospital"
    assert body["cancelledByConfirmation"] is True

    # Kept, not deleted — the record is still readable.
    assert Call.query.get(call.id) is not None


def test_declining_without_a_note_still_records_a_reason(client, roles, call):
    """A cancellation with no reason is not something the rest of the app allows."""
    body = set_confirmation(client, roles["dispatcher"], call.id, "declined").get_json()
    assert body["status"] == "cancelled"
    assert "declined" in body["cancel_reason"].lower()


def test_a_declined_call_leaves_the_open_board(client, roles, call):
    set_confirmation(client, roles["dispatcher"], call.id, "declined")

    board = client.get(f"/api/dispatch/board?date={TOMORROW}", headers=roles["dispatcher"]).get_json()
    assert call.id not in [c["id"] for c in board.get("openCalls", [])]


def test_declining_an_already_cancelled_call_is_allowed_and_idempotent(client, roles, call):
    set_confirmation(client, roles["dispatcher"], call.id, "declined", "First")
    body = set_confirmation(client, roles["dispatcher"], call.id, "declined", "Second").get_json()

    assert body["status"] == "cancelled"
    # The original cancellation reason is not rewritten by a repeat.
    assert body["cancel_reason"] == "First"


def test_confirming_a_cancelled_call_is_refused(client, roles, call):
    """Reviving a cancelled trip needs the explicit uncancel workflow."""
    client.patch(f"/api/calls/{call.id}/cancel", headers=roles["dispatcher"],
                 json={"cancel_reason": "Facility closed"})

    resp = set_confirmation(client, roles["dispatcher"], call.id, "confirmed")
    assert resp.status_code == 409
    assert "Uncancel it first" in resp.get_json()["error"] or "Uncancel" in resp.get_json()["error"]


# ── Access ──────────────────────────────────────────────────────────────────

def test_anonymous_cannot_record_a_confirmation(client, call):
    assert client.patch(f"/api/calls/{call.id}/confirmation",
                        json={"confirmation_status": "confirmed"}).status_code in (401, 403)


def test_an_unknown_call_is_a_404(client, roles):
    assert set_confirmation(client, roles["dispatcher"], 999999, "confirmed").status_code == 404


def test_the_detail_endpoint_carries_a_minimized_patient_label(client, roles):
    patient = Patient(first_name="John", last_name="Doe")
    db.session.add(patient)
    db.session.commit()
    c = Call(trip_date=TOMORROW, status="new", patient_id=patient.id)
    db.session.add(c)
    db.session.commit()

    body = client.get(f"/api/calls/{c.id}", headers=roles["dispatcher"]).get_json()
    assert body["patientLabel"] == "John D."


# ── The day's round ─────────────────────────────────────────────────────────

def round_for(client, headers, day=TOMORROW):
    resp = client.get(f"/api/calls/confirmation-round?date={day}", headers=headers)
    assert resp.status_code == 200, resp.get_json()
    return resp.get_json()


def test_the_round_lists_the_day_in_pickup_order(client, roles):
    for time in ("14:00", "08:30", "11:15"):
        db.session.add(Call(trip_date=TOMORROW, status="new", pickup_time=time))
    db.session.commit()

    times = [c["pickup_time"] for c in round_for(client, roles["dispatcher"])["calls"]]
    assert times == ["08:30", "11:15", "14:00"]


def test_calls_without_a_time_sort_last(client, roles):
    """Establishing the time is often the point of ringing, so they are not lost
    at the top of the list."""
    db.session.add(Call(trip_date=TOMORROW, status="new", pickup_time="09:00"))
    db.session.add(Call(trip_date=TOMORROW, status="new", pickup_time=""))
    db.session.commit()

    times = [c["pickup_time"] for c in round_for(client, roles["dispatcher"])["calls"]]
    assert times == ["09:00", ""]


def test_the_round_tallies_what_is_left(client, roles):
    confirmed = Call(trip_date=TOMORROW, status="new", confirmation_status="confirmed")
    no_answer = Call(trip_date=TOMORROW, status="new", confirmation_status="no_answer")
    fresh = Call(trip_date=TOMORROW, status="new")
    db.session.add_all([confirmed, no_answer, fresh])
    db.session.commit()

    summary = round_for(client, roles["dispatcher"])["summary"]
    assert summary["total"] == 3
    assert summary["confirmed"] == 1
    # Still to ring: never called, plus the ones that did not pick up.
    assert summary["remaining"] == 2


def test_cancelled_and_completed_trips_are_not_in_the_round(client, roles):
    db.session.add(Call(trip_date=TOMORROW, status="cancelled"))
    db.session.add(Call(trip_date=TOMORROW, status="completed"))
    db.session.add(Call(trip_date=TOMORROW, status="new"))
    db.session.commit()

    assert round_for(client, roles["dispatcher"])["summary"]["total"] == 1


def test_declining_during_the_round_removes_it_from_the_round(client, roles, call):
    assert round_for(client, roles["dispatcher"])["summary"]["total"] == 1

    set_confirmation(client, roles["dispatcher"], call.id, "declined", "Not needed")
    assert round_for(client, roles["dispatcher"])["summary"]["total"] == 0


def test_the_round_validates_its_date(client, roles):
    assert client.get("/api/calls/confirmation-round?date=2099-02-30",
                      headers=roles["dispatcher"]).status_code == 400
    assert client.get("/api/calls/confirmation-round",
                      headers=roles["dispatcher"]).status_code == 400
