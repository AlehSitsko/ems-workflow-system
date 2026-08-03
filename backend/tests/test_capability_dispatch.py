"""Capability-aware assignment through the dispatch API: a mismatch (the unit's
vehicle can't serve the call) is flagged on the board and raises a warning
notification, but is never blocked.
"""

import json
from datetime import datetime

from models import db, Vehicle, DailyCrewUnit, Call, NotificationEvent


def _today():
    return datetime.now().strftime("%Y-%m-%d")


def mk_vehicle(caps, number="V1"):
    v = Vehicle(unit_name=f"Ambu {number}", unit_number=number, unit_type=caps[0],
                is_retired=False, capabilities=json.dumps(caps))
    db.session.add(v)
    db.session.commit()
    return v


def mk_unit(vehicle, truck="10"):
    u = DailyCrewUnit(shift_date=_today(), unit_type=vehicle.unit_type, truck_number=truck,
                      start_time="08:00", end_time="20:00", vehicle_id=vehicle.id)
    db.session.add(u)
    db.session.commit()
    return u


def mk_call(service_level):
    c = Call(trip_date=_today(), service_level=service_level, status="new",
             pickup_time="10:00", call_type="scheduled")
    db.session.add(c)
    db.session.commit()
    return c


def _assign(clients, call, unit):
    return clients["dispatcher"].post("/api/dispatch/assign",
                                      json={"call_id": call.id, "unit_id": unit.id})


def _board_call(clients, unit_id, call_id):
    board = clients["dispatcher"].get(f"/api/dispatch/board?date={_today()}").get_json()
    unit = next(u for u in board["units"] if u["id"] == unit_id)
    return next(c for c in unit["assignedCalls"] if c["id"] == call_id)


def _mismatch_count():
    return NotificationEvent.query.filter_by(type="call_als_on_bls").count()


def test_bls_vehicle_on_an_als_call_is_flagged_not_blocked(clients):
    unit = mk_unit(mk_vehicle(["BLS"]))
    call = mk_call("ALS")
    resp = _assign(clients, call, unit)
    assert resp.status_code == 201            # never blocked

    flagged = _board_call(clients, unit.id, call.id)
    assert flagged["mismatch"] and "ALS call" in flagged["mismatch"]
    assert _mismatch_count() == 1             # a warning was raised


def test_als_vehicle_on_a_bls_call_is_fine(clients):
    unit = mk_unit(mk_vehicle(["ALS", "BLS"]))
    call = mk_call("BLS")
    _assign(clients, call, unit)

    assert _board_call(clients, unit.id, call.id)["mismatch"] is None
    assert _mismatch_count() == 0


def test_a_bariatric_call_needs_a_bariatric_vehicle(clients):
    unit = mk_unit(mk_vehicle(["ALS", "BLS"]))   # capable, but not Bariatric
    call = mk_call("Bariatric")
    _assign(clients, call, unit)

    flagged = _board_call(clients, unit.id, call.id)
    assert flagged["mismatch"] == "vehicle is not Bariatric-capable"


def test_a_multi_capability_vehicle_serves_a_special_call(clients):
    unit = mk_unit(mk_vehicle(["ALS", "BLS", "Bariatric"]))
    call = mk_call("Bariatric")
    _assign(clients, call, unit)

    assert _board_call(clients, unit.id, call.id)["mismatch"] is None
    assert _mismatch_count() == 0
