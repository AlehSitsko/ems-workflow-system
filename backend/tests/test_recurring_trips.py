"""Standing transport orders — dialysis every Mon/Wed/Fri and the like.

Two properties carry the whole feature. Regeneration must be idempotent, or a
patient ends up double-booked every time someone opens the schedule. And a trip a
human has touched must never be rewritten or withdrawn by the template, because a
schedule change silently undoing a dispatcher's correction is worse than no
recurrence at all.
"""

from datetime import date, timedelta

import pytest

from models import db, Patient, Call, CallAssignment, DailyCrewUnit, RecurringTrip
from utils.recurrence import generate, occurrences


def next_monday():
    today = date.today()
    return today + timedelta(days=(7 - today.weekday()) % 7 or 7)


MONDAY = next_monday()
START = MONDAY.isoformat()


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


@pytest.fixture()
def patient(app):
    p = Patient(first_name="Ray", last_name="Dial")
    db.session.add(p)
    db.session.commit()
    return p


def payload(patient_id, **overrides):
    data = {
        "patientId": patient_id,
        "weekdays": [0, 2, 4],            # Mon / Wed / Fri
        "startDate": START,
        "pickupTime": "09:00",
        "pickupAddress": "12 Elm Street",
        "dropoffAddress": "Riverside Dialysis",
        "serviceLevel": "BLS",
        "horizonWeeks": 2,
    }
    data.update(overrides)
    return data


def create(api, patient_id, **overrides):
    return api.post("/api/recurring-trips", json=payload(patient_id, **overrides))


def generated_calls(trip_id):
    return Call.query.filter_by(recurring_trip_id=trip_id).order_by(Call.trip_date).all()


# ── Generating ──────────────────────────────────────────────────────────────

def test_creating_an_order_materialises_real_calls(client, roles, patient):
    resp = create(roles["dispatcher"], patient.id)
    assert resp.status_code == 201

    trip_id = resp.get_json()["id"]
    calls = generated_calls(trip_id)
    assert calls, "the order should have produced trips"
    # Every generated trip is an ordinary call the rest of the app understands.
    assert all(c.status == "new" and c.patient_id == patient.id for c in calls)
    assert all(c.service_level == "BLS" for c in calls)


def test_it_only_lands_on_the_chosen_weekdays(client, roles, patient):
    trip_id = create(roles["dispatcher"], patient.id, weekdays=[0]).get_json()["id"]

    days = {date.fromisoformat(c.trip_date).weekday() for c in generated_calls(trip_id)}
    assert days == {0}


def test_regenerating_does_not_double_book(client, roles, patient):
    """Run twice, same trips — otherwise every visit to the schedule adds a copy."""
    trip_id = create(roles["dispatcher"], patient.id).get_json()["id"]
    before = [c.trip_date for c in generated_calls(trip_id)]

    resp = roles["dispatcher"].post(f"/api/recurring-trips/{trip_id}/generate",  json={})
    assert resp.status_code == 200
    assert resp.get_json()["generated"]["created"] == 0

    assert [c.trip_date for c in generated_calls(trip_id)] == before


def test_nothing_is_created_in_the_past(client, roles, patient):
    """Backfilling trips nobody drove would put invented history on the board."""
    past_start = (date.today() - timedelta(days=30)).isoformat()
    trip_id = create(roles["dispatcher"], patient.id, startDate=past_start).get_json()["id"]

    assert all(c.trip_date >= date.today().isoformat() for c in generated_calls(trip_id))


def test_the_horizon_bounds_how_far_ahead_it_runs(client, roles, patient):
    trip_id = create(roles["dispatcher"], patient.id, horizonWeeks=1).get_json()["id"]

    limit = (date.today() + timedelta(weeks=1)).isoformat()
    assert all(c.trip_date <= limit for c in generated_calls(trip_id))


def test_an_end_date_stops_the_series(client, roles, patient):
    # Relative to the start, not to today: the series begins next Monday.
    end = (MONDAY + timedelta(days=3)).isoformat()
    trip_id = create(roles["dispatcher"], patient.id, endDate=end).get_json()["id"]

    assert all(c.trip_date <= end for c in generated_calls(trip_id))


def test_a_return_leg_is_created_and_linked(client, roles, patient):
    trip_id = create(roles["dispatcher"], patient.id,
                     returnPickupTime="14:00").get_json()["id"]

    calls = generated_calls(trip_id)
    outbound = [c for c in calls if c.call_type != "return"]
    returns = [c for c in calls if c.call_type == "return"]
    assert len(outbound) == len(returns)

    back = returns[0]
    out = Call.query.get(back.linked_call_id)
    assert out.linked_call_id == back.id
    # The return runs the journey backwards.
    assert back.pickup_address == out.dropoff_address
    assert back.dropoff_address == out.pickup_address


# ── Protecting what a human touched ─────────────────────────────────────────

def test_editing_the_template_updates_untouched_trips(client, roles, patient):
    trip_id = create(roles["dispatcher"], patient.id).get_json()["id"]

    roles["dispatcher"].put(f"/api/recurring-trips/{trip_id}", 
               json=payload(patient.id, pickupTime="10:30"))

    assert all(c.pickup_time == "10:30" for c in generated_calls(trip_id)
               if c.call_type != "return")


def test_a_confirmed_trip_is_not_rewritten(client, roles, patient):
    """A dispatcher rang the patient; the schedule does not get to undo that."""
    trip_id = create(roles["dispatcher"], patient.id).get_json()["id"]
    touched = generated_calls(trip_id)[0]
    roles["dispatcher"].patch(f"/api/calls/{touched.id}/confirmation", 
                 json={"confirmation_status": "confirmed"})

    roles["dispatcher"].put(f"/api/recurring-trips/{trip_id}", 
               json=payload(patient.id, pickupTime="10:30"))

    assert Call.query.get(touched.id).pickup_time == "09:00"


def test_an_assigned_trip_is_not_rewritten(client, roles, patient):
    trip_id = create(roles["dispatcher"], patient.id).get_json()["id"]
    touched = generated_calls(trip_id)[0]

    unit = DailyCrewUnit(shift_date=touched.trip_date, unit_type="BLS", truck_number="101",
                         start_time="08:00", end_time="20:00")
    db.session.add(unit)
    db.session.flush()
    db.session.add(CallAssignment(call_id=touched.id, unit_id=unit.id, is_active=True))
    db.session.commit()

    roles["dispatcher"].put(f"/api/recurring-trips/{trip_id}", 
               json=payload(patient.id, pickupTime="10:30"))

    assert Call.query.get(touched.id).pickup_time == "09:00"


def test_the_override_re_syncs_touched_trips_when_asked(client, roles, patient):
    trip_id = create(roles["dispatcher"], patient.id).get_json()["id"]
    touched = generated_calls(trip_id)[0]
    roles["dispatcher"].patch(f"/api/calls/{touched.id}/confirmation", 
                 json={"confirmation_status": "confirmed"})

    roles["dispatcher"].put(f"/api/recurring-trips/{trip_id}", 
               json=payload(patient.id, pickupTime="10:30", applyToTouched=True))

    assert Call.query.get(touched.id).pickup_time == "10:30"


def test_dropping_a_weekday_withdraws_only_untouched_trips(client, roles, patient):
    trip_id = create(roles["dispatcher"], patient.id, weekdays=[0, 2]).get_json()["id"]
    wednesday = next(c for c in generated_calls(trip_id)
                     if date.fromisoformat(c.trip_date).weekday() == 2)
    roles["dispatcher"].patch(f"/api/calls/{wednesday.id}/confirmation", 
                 json={"confirmation_status": "confirmed"})
    kept_id = wednesday.id

    roles["dispatcher"].put(f"/api/recurring-trips/{trip_id}", 
               json=payload(patient.id, weekdays=[0]))

    # The confirmed Wednesday survives; the untouched ones are gone.
    assert Call.query.get(kept_id) is not None
    remaining = {date.fromisoformat(c.trip_date).weekday() for c in generated_calls(trip_id)}
    assert remaining == {0, 2}
    assert sum(1 for c in generated_calls(trip_id)
               if date.fromisoformat(c.trip_date).weekday() == 2) == 1


def test_stopping_an_order_withdraws_untouched_future_trips_only(client, roles, patient):
    trip_id = create(roles["dispatcher"], patient.id).get_json()["id"]
    kept = generated_calls(trip_id)[0]
    roles["dispatcher"].patch(f"/api/calls/{kept.id}/confirmation", 
                 json={"confirmation_status": "confirmed"})

    resp = roles["dispatcher"].delete(f"/api/recurring-trips/{trip_id}")
    assert resp.status_code == 200
    assert resp.get_json()["withdrawn"]["skipped"] >= 1

    assert Call.query.get(kept.id) is not None
    # The template row itself is kept — the worked trips still point at it.
    assert RecurringTrip.query.get(trip_id).is_active is False


# ── Validation ──────────────────────────────────────────────────────────────

def test_weekdays_are_required(client, roles, patient):
    resp = create(roles["dispatcher"], patient.id, weekdays=[])
    assert resp.status_code == 400
    assert "weekdays" in resp.get_json()["error"]


def test_weekdays_must_be_real_days(client, roles, patient):
    assert create(roles["dispatcher"], patient.id, weekdays=[9]).status_code == 400


def test_an_unknown_patient_is_rejected(client, roles):
    assert create(roles["dispatcher"], 999999).status_code == 400


def test_an_impossible_start_date_is_rejected(client, roles, patient):
    assert create(roles["dispatcher"], patient.id, startDate="2099-02-30").status_code == 400


def test_an_end_before_the_start_is_rejected(client, roles, patient):
    end = (MONDAY - timedelta(days=7)).isoformat()
    resp = create(roles["dispatcher"], patient.id, endDate=end)
    assert resp.status_code == 400
    assert "endDate must not be before" in resp.get_json()["error"]


def test_the_horizon_is_capped(client, roles, patient):
    assert create(roles["dispatcher"], patient.id, horizonWeeks=52).status_code == 400


def test_a_bad_pickup_time_is_rejected(client, roles, patient):
    assert create(roles["dispatcher"], patient.id, pickupTime="9am").status_code == 400


# ── Access ──────────────────────────────────────────────────────────────────

def test_hr_has_no_access(client, roles, patient):
    assert roles["hr"].get("/api/recurring-trips").status_code == 403


def test_anonymous_has_no_access(client):
    assert client.get("/api/recurring-trips").status_code in (401, 403)


# ── The occurrence rule itself ──────────────────────────────────────────────

def test_occurrences_never_reach_before_today(app, patient):
    trip = RecurringTrip(patient_id=patient.id, weekdays="[0,1,2,3,4,5,6]",
                         start_date=(date.today() - timedelta(days=10)).isoformat(),
                         horizon_weeks=1)
    db.session.add(trip)
    db.session.commit()

    days = occurrences(trip)
    assert days
    assert min(days) >= date.today().isoformat()


def test_a_paused_order_generates_nothing_new(app, patient):
    trip = RecurringTrip(patient_id=patient.id, weekdays="[]", start_date=START, horizon_weeks=2)
    db.session.add(trip)
    db.session.commit()

    assert occurrences(trip) == []
    assert generate(trip)["created"] == 0


def test_editing_a_generated_call_by_hand_locks_it(client, roles, patient):
    """The correction survives the next schedule change; that is the point."""
    trip_id = create(roles["dispatcher"], patient.id).get_json()["id"]
    call = generated_calls(trip_id)[0]

    roles["dispatcher"].put(f"/api/calls/{call.id}", 
               json={"pickup_address": "New pickup the patient gave us"})
    assert Call.query.get(call.id).recurrence_locked is True

    roles["dispatcher"].put(f"/api/recurring-trips/{trip_id}", 
               json=payload(patient.id, pickupAddress="12 Elm Street"))

    assert Call.query.get(call.id).pickup_address == "New pickup the patient gave us"
