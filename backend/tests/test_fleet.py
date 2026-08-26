"""Fleet (Vehicle) permission matrix and audit trail.

Fleet is operational data: admin/supervisor manage it, dispatchers get read-only
visibility of what is available, HR has no operational reason to see it. The
frontend gate is a convenience — these tests pin the backend enforcement.
"""

import pytest

from models import db, Vehicle, AuditLog


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
def vehicle(app):
    v = Vehicle(unit_name="Ambu-1", unit_number="101", unit_type="BLS")
    db.session.add(v)
    db.session.commit()
    return v


def payload(**overrides):
    data = {"unitName": "Ambu-9", "unitNumber": "909", "unitType": "BLS"}
    data.update(overrides)
    return data


# ── View access ─────────────────────────────────────────────────────────────

@pytest.mark.parametrize("role", ["admin", "supervisor", "dispatcher"])
def test_operational_roles_can_view_fleet(client, roles, vehicle, role):
    assert roles[role].get("/api/vehicles").status_code == 200


def test_hr_cannot_view_fleet(client, roles, vehicle):
    assert roles["hr"].get("/api/vehicles").status_code == 403


def test_unknown_role_cannot_view_fleet(app):
    """A signed-in user whose role the app does not recognise is identified but
    allowed nowhere. (A header can no longer claim a role at all — see
    test_security.py.)"""
    from conftest import make_user, login

    user = make_user("ghost", username="fleet_ghost")
    c = app.test_client()
    login(c, user.username)

    assert c.get("/api/vehicles").status_code == 403


# ── Edit access ─────────────────────────────────────────────────────────────

@pytest.mark.parametrize("role", ["admin", "supervisor"])
def test_managers_can_create_a_vehicle(client, roles, role):
    resp = roles[role].post("/api/vehicles", json=payload(unitNumber=f"90{role[:1]}"))
    assert resp.status_code == 201


@pytest.mark.parametrize("role", ["dispatcher", "hr"])
def test_non_managers_cannot_create_a_vehicle(client, roles, role):
    assert roles[role].post("/api/vehicles", json=payload()).status_code == 403


def test_dispatcher_can_look_but_not_touch(client, roles, vehicle):
    assert roles["dispatcher"].get("/api/vehicles").status_code == 200
    assert roles["dispatcher"].put(f"/api/vehicles/{vehicle.id}", json=payload()).status_code == 403
    assert roles["dispatcher"].patch(f"/api/vehicles/{vehicle.id}/toggle-active").status_code == 403
    assert roles["dispatcher"].delete(f"/api/vehicles/{vehicle.id}").status_code == 403


# ── Taxonomy on write ───────────────────────────────────────────────────────

def test_legacy_bari_is_canonicalized_on_create(client, roles):
    resp = roles["admin"].post("/api/vehicles", json=payload(unitNumber="777", unitType="BARI"))
    assert resp.status_code == 201
    assert resp.get_json()["unitType"] == "Bariatric"


def test_invalid_vehicle_type_is_rejected(client, roles):
    resp = roles["admin"].post("/api/vehicles", json=payload(unitNumber="778", unitType="spaceship"))
    assert resp.status_code == 400


# ── Audit trail (feeds the Vehicle Workspace Activity tab) ──────────────────

def test_create_is_audited(client, roles):
    resp = roles["admin"].post("/api/vehicles", json=payload(unitNumber="555"))
    vid = resp.get_json()["id"]
    entry = AuditLog.query.filter_by(entity_type="vehicle", entity_id=vid, action="vehicle.created").first()
    assert entry is not None
    assert entry.user_name == "Test Admin"


def test_update_audits_only_the_changed_fields(client, roles, vehicle):
    roles["supervisor"].put(f"/api/vehicles/{vehicle.id}",
               json=payload(unitName="Ambu-1", unitNumber="101", unitType="BLS", notes="Now with a note"))
    entry = AuditLog.query.filter_by(entity_type="vehicle", entity_id=vehicle.id, action="vehicle.updated").first()
    assert entry is not None
    assert "notes" in entry.details
    assert "unit_name" not in entry.details  # unchanged fields are not logged


def test_toggle_active_is_audited_with_the_resulting_state(client, roles, vehicle):
    roles["admin"].patch(f"/api/vehicles/{vehicle.id}/toggle-active")
    entry = AuditLog.query.filter_by(entity_type="vehicle", entity_id=vehicle.id).order_by(AuditLog.id.desc()).first()
    assert entry.action == "vehicle.deactivated"


def test_delete_is_audited_before_the_row_disappears(client, roles, vehicle):
    vid = vehicle.id
    roles["admin"].delete(f"/api/vehicles/{vid}")
    assert db.session.get(Vehicle, vid) is None
    assert AuditLog.query.filter_by(entity_type="vehicle", entity_id=vid, action="vehicle.deleted").first() is not None


# ── Legacy crew-unit -> vehicle linking ─────────────────────────────────────

def test_linking_only_takes_unambiguous_exact_matches(app):
    """Guessing a vehicle would attach a shift's history to the wrong physical
    truck, so only an exact single match is linked; everything else is reported
    and left null."""
    from models import DailyCrewUnit
    from cli import link_crew_units_to_vehicles_command

    exact = Vehicle(unit_name="Ambu-A", unit_number="201", unit_type="BLS")
    dupe_a = Vehicle(unit_name="Dupe-1", unit_number="DUP", unit_type="BLS")
    dupe_b = Vehicle(unit_name="Dupe-2", unit_number="dup", unit_type="ALS")  # same key, different case
    db.session.add_all([exact, dupe_a, dupe_b])
    db.session.commit()

    def mk_unit(truck):
        u = DailyCrewUnit(shift_date="2026-07-20", unit_type="BLS", truck_number=truck, start_time="08:00")
        db.session.add(u)
        return u

    matched = mk_unit("201")
    unmatched = mk_unit("BADINPUT")
    ambiguous = mk_unit("DUP")
    db.session.commit()

    result = app.test_cli_runner().invoke(link_crew_units_to_vehicles_command, ["--apply"])
    assert result.exit_code == 0

    assert db.session.get(DailyCrewUnit, matched.id).vehicle_id == exact.id
    assert db.session.get(DailyCrewUnit, unmatched.id).vehicle_id is None
    assert db.session.get(DailyCrewUnit, ambiguous.id).vehicle_id is None
    assert "UNRESOLVED" in result.output and "BADINPUT" in result.output
    assert "AMBIGUOUS" in result.output


def test_linking_dry_run_writes_nothing(app):
    from models import DailyCrewUnit
    from cli import link_crew_units_to_vehicles_command

    v = Vehicle(unit_name="Ambu-A", unit_number="301", unit_type="BLS")
    db.session.add(v)
    db.session.commit()
    unit = DailyCrewUnit(shift_date="2026-07-20", unit_type="BLS", truck_number="301", start_time="08:00")
    db.session.add(unit)
    db.session.commit()

    result = app.test_cli_runner().invoke(link_crew_units_to_vehicles_command)
    assert result.exit_code == 0
    assert "dry run" in result.output
    assert db.session.get(DailyCrewUnit, unit.id).vehicle_id is None


# ── Vehicle model behaviour ─────────────────────────────────────────────────

def test_capabilities_fall_back_to_unit_type_for_legacy_rows(app):
    v = Vehicle(unit_name="Legacy", unit_number="L1", unit_type="ALS")  # no capabilities set
    db.session.add(v)
    db.session.commit()
    assert v.parsed_capabilities() == ["ALS"]


def test_capabilities_can_express_more_than_one_thing(app):
    import json
    v = Vehicle(unit_name="Multi", unit_number="M1", unit_type="BLS",
                capabilities=json.dumps(["BLS", "Stretcher", "Wheelchair"]))
    db.session.add(v)
    db.session.commit()
    assert v.parsed_capabilities() == ["BLS", "Stretcher", "Wheelchair"]


def test_corrupt_capabilities_json_degrades_instead_of_raising(app):
    v = Vehicle(unit_name="Broken", unit_number="B1", unit_type="BLS", capabilities="{not json")
    db.session.add(v)
    db.session.commit()
    assert v.parsed_capabilities() == ["BLS"]


@pytest.mark.parametrize("kwargs,expected", [
    ({}, True),
    ({"is_active": False}, False),
    ({"is_retired": True}, False),
    ({"operational_status": "out_of_service"}, False),
    ({"operational_status": "maintenance"}, False),
])
def test_availability_for_service(app, kwargs, expected):
    v = Vehicle(unit_name="Avail", unit_number="AV1", unit_type="BLS",
                is_active=True, is_retired=False, operational_status="in_service")
    for key, value in kwargs.items():
        setattr(v, key, value)
    db.session.add(v)
    db.session.commit()
    assert v.is_available_for_service() is expected


# ── Odometer API ────────────────────────────────────────────────────────────

def test_odometer_reading_is_recorded_and_caches_current(client, roles, vehicle):
    resp = roles["admin"].post(f"/api/vehicles/{vehicle.id}/odometer",
                       json={"reading": 12000, "unit": "mi", "notes": "Start of shift"})
    assert resp.status_code == 201
    assert resp.get_json()["reading"] == 12000
    refreshed = db.session.get(Vehicle, vehicle.id)
    assert refreshed.current_odometer == 12000
    assert refreshed.last_odometer_update


def test_odometer_history_is_kept_not_overwritten(client, roles, vehicle):
    for reading in (100, 200, 300):
        roles["admin"].post(f"/api/vehicles/{vehicle.id}/odometer", json={"reading": reading})
    history = roles["dispatcher"].get(f"/api/vehicles/{vehicle.id}/odometer").get_json()
    assert [e["reading"] for e in history] == [300, 200, 100]   # newest first, nothing lost


def test_odometer_cannot_run_backwards(client, roles, vehicle):
    roles["admin"].post(f"/api/vehicles/{vehicle.id}/odometer", json={"reading": 5000})
    resp = roles["admin"].post(f"/api/vehicles/{vehicle.id}/odometer", json={"reading": 4000})
    assert resp.status_code == 409
    assert "backwards" in resp.get_json()["error"]
    assert db.session.get(Vehicle, vehicle.id).current_odometer == 5000  # unchanged


def test_odometer_rollback_allowed_as_an_explicit_correction(client, roles, vehicle):
    roles["admin"].post(f"/api/vehicles/{vehicle.id}/odometer", json={"reading": 5000})
    resp = roles["admin"].post(f"/api/vehicles/{vehicle.id}/odometer",
                       json={"reading": 4000, "correction": True})
    assert resp.status_code == 201
    assert resp.get_json()["source"] == "correction"
    assert db.session.get(Vehicle, vehicle.id).current_odometer == 4000


@pytest.mark.parametrize("payload,expected", [
    ({}, 400),                      # reading required
    ({"reading": -5}, 400),         # negative
    ({"reading": "abc"}, 400),      # not an integer
    ({"reading": 9999999}, 400),    # implausible - likely a typo
    ({"reading": 100, "unit": "furlongs"}, 400),
])
def test_odometer_validation(client, roles, vehicle, payload, expected):
    resp = roles["admin"].post(f"/api/vehicles/{vehicle.id}/odometer", json=payload)
    assert resp.status_code == expected


def test_dispatcher_can_read_but_not_record_odometer(client, roles, vehicle):
    assert roles["dispatcher"].get(f"/api/vehicles/{vehicle.id}/odometer").status_code == 200
    assert roles["dispatcher"].post(f"/api/vehicles/{vehicle.id}/odometer", json={"reading": 1}).status_code == 403
    assert roles["hr"].get(f"/api/vehicles/{vehicle.id}/odometer").status_code == 403


# ── Maintenance API ─────────────────────────────────────────────────────────

def test_create_and_list_maintenance(client, roles, vehicle):
    resp = roles["supervisor"].post(f"/api/vehicles/{vehicle.id}/maintenance",
                       json={"maintenanceType": "oil_change", "scheduledDate": "2026-08-01",
                             "vendor": "Joe Garage", "cost": 89.5})
    assert resp.status_code == 201
    assert resp.get_json()["status"] == "scheduled"
    records = roles["dispatcher"].get(f"/api/vehicles/{vehicle.id}/maintenance").get_json()
    assert len(records) == 1


@pytest.mark.parametrize("payload", [
    {"maintenanceType": "teleportation"},
    {"maintenanceType": "oil_change", "status": "invented"},
    {"maintenanceType": "oil_change", "scheduledDate": "2026-02-30"},
    {"maintenanceType": "oil_change", "cost": -10},
    {"maintenanceType": "oil_change", "odometerAtService": -1},
])
def test_maintenance_validation(client, roles, vehicle, payload):
    assert roles["admin"].post(f"/api/vehicles/{vehicle.id}/maintenance", json=payload).status_code == 400


def test_completing_maintenance_fills_a_completion_date_and_updates_the_vehicle(client, roles, vehicle):
    created = roles["admin"].post(f"/api/vehicles/{vehicle.id}/maintenance",
                          json={"maintenanceType": "oil_change", "scheduledDate": "2026-08-01"}).get_json()
    record_id = created["id"]
    resp = roles["admin"].patch(f"/api/vehicles/maintenance/{record_id}",
                        json={"status": "completed", "odometerAtService": 30000})
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["status"] == "completed"
    assert body["completedDate"]                    # filled rather than left blank
    refreshed = db.session.get(Vehicle, vehicle.id)
    assert refreshed.last_service_date == body["completedDate"]
    assert refreshed.last_service_mileage == 30000


def test_dispatcher_cannot_create_maintenance(client, roles, vehicle):
    assert roles["dispatcher"].post(f"/api/vehicles/{vehicle.id}/maintenance",
                       json={"maintenanceType": "oil_change"}).status_code == 403


# ── Capabilities ────────────────────────────────────────────────────────────

def test_capabilities_are_validated_and_canonicalized(client, roles):
    resp = roles["admin"].post("/api/vehicles",
                       json={"unitName": "Multi", "unitNumber": "MC1", "unitType": "BLS",
                             "capabilities": ["bls", "BARI", "wc"]})
    assert resp.status_code == 201
    assert resp.get_json()["capabilities"] == ["BLS", "Bariatric", "Wheelchair"]


def test_invalid_capability_is_rejected(client, roles):
    resp = roles["admin"].post("/api/vehicles",
                       json={"unitName": "Bad", "unitNumber": "BC1", "unitType": "BLS",
                             "capabilities": ["BLS", "teleport"]})
    assert resp.status_code == 400
    assert "teleport" in resp.get_json()["error"]


# ── Retire instead of delete ────────────────────────────────────────────────

def test_retire_requires_a_reason(client, roles, vehicle):
    assert roles["admin"].post(f"/api/vehicles/{vehicle.id}/retire", json={}).status_code == 400


def test_retiring_makes_a_vehicle_unavailable_but_keeps_it(client, roles, vehicle):
    resp = roles["admin"].post(f"/api/vehicles/{vehicle.id}/retire",
                       json={"reason": "Sold"})
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["isRetired"] is True and body["availableForService"] is False
    assert body["retiredReason"] == "Sold"
    assert db.session.get(Vehicle, vehicle.id) is not None   # still there


def test_retiring_twice_is_rejected_and_unretire_restores(client, roles, vehicle):
    roles["admin"].post(f"/api/vehicles/{vehicle.id}/retire", json={"reason": "Sold"})
    assert roles["admin"].post(f"/api/vehicles/{vehicle.id}/retire", json={"reason": "Again"}).status_code == 409
    resp = roles["admin"].post(f"/api/vehicles/{vehicle.id}/unretire")
    assert resp.status_code == 200
    assert resp.get_json()["isRetired"] is False


def test_vehicle_with_history_cannot_be_deleted(client, roles, vehicle):
    from models import DailyCrewUnit
    unit = DailyCrewUnit(shift_date="2026-07-20", unit_type="BLS", truck_number="101",
                         start_time="08:00", vehicle_id=vehicle.id)
    db.session.add(unit)
    db.session.commit()

    resp = roles["admin"].delete(f"/api/vehicles/{vehicle.id}")
    assert resp.status_code == 409
    assert "Retire it instead" in resp.get_json()["error"]
    assert resp.get_json()["shifts"] == 1
    assert db.session.get(Vehicle, vehicle.id) is not None


def test_vehicle_without_history_can_still_be_deleted(client, roles, vehicle):
    assert roles["admin"].delete(f"/api/vehicles/{vehicle.id}").status_code == 200


def test_odometer_history_also_blocks_deletion(client, roles, vehicle):
    roles["admin"].post(f"/api/vehicles/{vehicle.id}/odometer", json={"reading": 10})
    resp = roles["admin"].delete(f"/api/vehicles/{vehicle.id}")
    assert resp.status_code == 409
    assert resp.get_json()["odometerEntries"] == 1


# ── Shift history (drives the Vehicle Workspace tab) ────────────────────────

def test_shift_history_uses_the_real_vehicle_link_not_truck_number(client, roles, vehicle):
    """Truck numbers get reused and reassigned, so a matching string is not
    evidence this vehicle did that work. Only the FK counts."""
    from models import DailyCrewUnit

    linked = DailyCrewUnit(shift_date="2026-07-20", unit_type="BLS", truck_number="101",
                           start_time="08:00", vehicle_id=vehicle.id)
    # Same truck_number, but never linked — must not be attributed to this vehicle.
    unlinked = DailyCrewUnit(shift_date="2026-07-21", unit_type="BLS", truck_number="101",
                             start_time="08:00", vehicle_id=None)
    db.session.add_all([linked, unlinked])
    db.session.commit()

    body = roles["admin"].get(f"/api/vehicles/{vehicle.id}/shifts").get_json()
    assert [s["id"] for s in body] == [linked.id]


def test_shift_history_is_newest_first_and_carries_crew(client, roles, vehicle):
    from models import DailyCrewUnit, Employee

    driver = Employee(first_name="Nina", last_name="Boyd", role="Driver")
    medic = Employee(first_name="John", last_name="Cole", role="EMT")
    db.session.add_all([driver, medic])
    db.session.commit()

    older = DailyCrewUnit(shift_date="2026-07-18", unit_type="BLS", truck_number="101",
                          start_time="08:00", vehicle_id=vehicle.id)
    newer = DailyCrewUnit(shift_date="2026-07-20", unit_type="ALS", truck_number="101",
                          start_time="07:00", end_time="19:00", vehicle_id=vehicle.id,
                          driver_id=driver.id, medical_id=medic.id)
    db.session.add_all([older, newer])
    db.session.commit()

    body = roles["admin"].get(f"/api/vehicles/{vehicle.id}/shifts").get_json()
    assert [s["shiftDate"] for s in body] == ["2026-07-20", "2026-07-18"]
    assert body[0]["crew"]["driver"] == "Nina B."
    assert body[0]["crew"]["medical"] == "John C."
    assert body[0]["link"] == f"/dispatch?date=2026-07-20&unit={newer.id}"


def test_shift_history_is_empty_for_a_vehicle_that_never_worked(client, roles, vehicle):
    assert roles["admin"].get(f"/api/vehicles/{vehicle.id}/shifts").get_json() == []


def test_shift_history_respects_the_fleet_permission_matrix(client, roles, vehicle):
    assert roles["dispatcher"].get(f"/api/vehicles/{vehicle.id}/shifts").status_code == 200
    assert roles["hr"].get(f"/api/vehicles/{vehicle.id}/shifts").status_code == 403
    assert client.get(f"/api/vehicles/{vehicle.id}/shifts").status_code == 401


def test_shift_history_404s_for_an_unknown_vehicle(client, roles):
    assert roles["admin"].get("/api/vehicles/999999/shifts").status_code == 404


def test_shift_history_limit_is_validated_and_capped(client, roles, vehicle):
    assert roles["admin"].get(f"/api/vehicles/{vehicle.id}/shifts?limit=abc").status_code == 400
    # Over-large limits are clamped rather than allowed to scan the table.
    assert roles["admin"].get(f"/api/vehicles/{vehicle.id}/shifts?limit=99999").status_code == 200
