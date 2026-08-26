"""Crew shifts run a real fleet vehicle, not a typed-in truck number.

DailyCrewUnit.vehicle_id is the link Fleet reporting depends on (a vehicle's
shift history is driven by the FK, never by matching truck_number strings).
These tests pin that the write path actually fills it, that the stored
truck_number is a snapshot of the vehicle, and that clients predating the link
keep working.
"""

import pytest

from models import db, Vehicle, DailyCrewUnit


@pytest.fixture()
def dispatcher(app):
    """A signed-in dispatcher client — identity is a session cookie, not a header."""
    from conftest import make_user, login

    user = make_user("dispatcher", username="crew_link_dispatcher")
    c = app.test_client()
    login(c, user.username)
    return c


@pytest.fixture()
def vehicles(app):
    made = {}
    for key, kwargs in {
        "active": dict(unit_name="Ambu-1", unit_number="101", unit_type="BLS"),
        "oos": dict(unit_name="Ambu-2", unit_number="102", unit_type="BLS",
                    operational_status="out_of_service"),
        "inactive": dict(unit_name="Ambu-3", unit_number="103", unit_type="BLS", is_active=False),
        "retired": dict(unit_name="Ambu-4", unit_number="104", unit_type="BLS", is_retired=True),
    }.items():
        v = Vehicle(**kwargs)
        db.session.add(v)
        made[key] = v
    db.session.commit()
    return made


def unit_payload(**overrides):
    data = {
        "shiftDate": "2099-01-01",   # future: the board rejects historical writes
        "startTime": "08:00",
        "unitType": "BLS",
        "crew": {},
    }
    data.update(overrides)
    return data


def test_create_links_vehicle_and_snapshots_its_number(client, dispatcher, vehicles):
    resp = dispatcher.post("/api/crew-units", 
                       json=unit_payload(vehicleId=vehicles["active"].id))
    assert resp.status_code == 201, resp.get_json()

    body = resp.get_json()
    assert body["vehicleId"] == vehicles["active"].id
    # The number is taken from the vehicle, not from whatever the client typed.
    assert body["truckNumber"] == "101"


def test_client_supplied_truck_number_never_overrides_the_vehicle(client, dispatcher, vehicles):
    resp = dispatcher.post("/api/crew-units", 
                       json=unit_payload(vehicleId=vehicles["active"].id, truckNumber="999"))
    assert resp.status_code == 201
    assert resp.get_json()["truckNumber"] == "101"


def test_out_of_service_vehicle_is_allowed_as_a_warning_not_an_error(client, dispatcher, vehicles):
    # Planning ahead of a repair is legitimate; the UI warns, the API allows.
    resp = dispatcher.post("/api/crew-units", 
                       json=unit_payload(vehicleId=vehicles["oos"].id))
    assert resp.status_code == 201
    assert resp.get_json()["vehicleId"] == vehicles["oos"].id


@pytest.mark.parametrize("key", ["retired", "inactive"])
def test_retired_and_inactive_vehicles_are_rejected(client, dispatcher, vehicles, key):
    resp = dispatcher.post("/api/crew-units", 
                       json=unit_payload(vehicleId=vehicles[key].id))
    assert resp.status_code == 400
    assert "cannot be assigned" in resp.get_json()["error"]


def test_unknown_vehicle_is_rejected(client, dispatcher, vehicles):
    resp = dispatcher.post("/api/crew-units",  json=unit_payload(vehicleId=999999))
    assert resp.status_code == 400
    assert resp.get_json()["error"] == "Selected vehicle does not exist"


def test_legacy_client_sending_only_a_truck_number_still_works(client, dispatcher, vehicles):
    resp = dispatcher.post("/api/crew-units",  json=unit_payload(truckNumber="77"))
    assert resp.status_code == 201

    body = resp.get_json()
    assert body["truckNumber"] == "77"
    assert body["vehicleId"] is None


def test_a_unit_needs_either_a_vehicle_or_a_truck_number(client, dispatcher):
    resp = dispatcher.post("/api/crew-units",  json=unit_payload())
    assert resp.status_code == 400
    assert resp.get_json()["error"] == "Truck Number is required"


def test_update_without_vehicle_id_keeps_the_existing_link(client, dispatcher, vehicles):
    created = dispatcher.post("/api/crew-units", 
                          json=unit_payload(vehicleId=vehicles["active"].id)).get_json()

    # A partial save (e.g. an older client, or a crew-only edit) must not
    # silently unlink the vehicle.
    resp = dispatcher.put(f"/api/crew-units/{created['id']}", 
                      json=unit_payload(truckNumber="101", startTime="09:00"))
    assert resp.status_code == 200
    assert resp.get_json()["vehicleId"] == vehicles["active"].id


def test_update_can_clear_the_link_back_to_free_text(client, dispatcher, vehicles):
    created = dispatcher.post("/api/crew-units", 
                          json=unit_payload(vehicleId=vehicles["active"].id)).get_json()

    resp = dispatcher.put(f"/api/crew-units/{created['id']}", 
                      json=unit_payload(vehicleId=None, truckNumber="rental van"))
    assert resp.status_code == 200
    assert resp.get_json()["vehicleId"] is None
    assert resp.get_json()["truckNumber"] == "rental van"


def test_night_copy_carries_the_vehicle_link(client, dispatcher, vehicles):
    created = dispatcher.post("/api/crew-units", 
                          json=unit_payload(vehicleId=vehicles["active"].id)).get_json()

    resp = dispatcher.post(f"/api/crew-units/{created['id']}/make-night",  json={})
    assert resp.status_code == 201, resp.get_json()

    night = DailyCrewUnit.query.filter_by(shift_type="night").one()
    assert night.vehicle_id == vehicles["active"].id


# ── Deleting a shift that still holds calls ─────────────────────────────────

def _mk_call_on(api, trip_date):
    from models import Call
    call = Call(trip_date=trip_date, status="new", service_level="BLS",
                pickup_time="10:00", call_type="Appointment")
    db.session.add(call)
    db.session.commit()
    return call


def test_deleting_a_shift_with_assigned_calls_is_refused_not_a_500(client, dispatcher, vehicles):
    """It used to raise a raw IntegrityError and leak the SQL in a 500."""
    unit = dispatcher.post("/api/crew-units", 
                       json=unit_payload(vehicleId=vehicles["active"].id)).get_json()
    call = _mk_call_on(dispatcher, "2099-01-01")

    assert dispatcher.post("/api/dispatch/assign", 
                       json={"call_id": call.id, "unit_id": unit["id"]}).status_code == 201

    resp = dispatcher.delete(f"/api/crew-units/{unit['id']}")
    assert resp.status_code == 409

    body = resp.get_json()
    assert body["assignedCalls"] == 1
    assert "Unassign them" in body["error"]
    # The refusal must not expose internals.
    assert "IntegrityError" not in body["error"] and "SQL" not in body["error"]

    # And the shift is still there.
    assert dispatcher.get("/api/crew-units?shift_date=2099-01-01").get_json()


def test_a_shift_deletes_once_its_calls_are_unassigned(client, dispatcher, vehicles):
    unit = dispatcher.post("/api/crew-units", 
                       json=unit_payload(vehicleId=vehicles["active"].id)).get_json()
    call = _mk_call_on(dispatcher, "2099-01-01")
    assign = dispatcher.post("/api/dispatch/assign", 
                         json={"call_id": call.id, "unit_id": unit["id"]}).get_json()

    dispatcher.delete(f"/api/dispatch/assign/{assign['id']}")

    assert dispatcher.delete(f"/api/crew-units/{unit['id']}").status_code == 200


def test_an_empty_shift_still_deletes(client, dispatcher, vehicles):
    unit = dispatcher.post("/api/crew-units", 
                       json=unit_payload(vehicleId=vehicles["active"].id)).get_json()

    assert dispatcher.delete(f"/api/crew-units/{unit['id']}").status_code == 200


def test_deleting_a_shift_leaves_its_calls_alone(client, dispatcher, vehicles):
    """The shift goes; the call stays and is simply unassigned again."""
    from models import Call

    unit = dispatcher.post("/api/crew-units", 
                       json=unit_payload(vehicleId=vehicles["active"].id)).get_json()
    call = _mk_call_on(dispatcher, "2099-01-01")
    assign = dispatcher.post("/api/dispatch/assign", 
                         json={"call_id": call.id, "unit_id": unit["id"]}).get_json()
    dispatcher.delete(f"/api/dispatch/assign/{assign['id']}")

    assert dispatcher.delete(f"/api/crew-units/{unit['id']}").status_code == 200
    assert db.session.get(Call, call.id) is not None
