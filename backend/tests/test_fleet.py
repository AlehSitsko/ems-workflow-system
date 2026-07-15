"""Fleet (Vehicle) permission matrix and audit trail.

Fleet is operational data: admin/supervisor manage it, dispatchers get read-only
visibility of what is available, HR has no operational reason to see it. The
frontend gate is a convenience — these tests pin the backend enforcement.
"""

import pytest
from werkzeug.security import generate_password_hash

from models import db, User, Vehicle, AuditLog


@pytest.fixture()
def roles(app):
    headers = {}
    for role in ("admin", "supervisor", "dispatcher", "hr"):
        user = User(
            username=f"fleet_{role}",
            password_hash=generate_password_hash("pw"),
            display_name=f"Fleet {role.title()}",
            role=role,
            is_active=True,
        )
        db.session.add(user)
        db.session.flush()
        headers[role] = {"X-User-Id": str(user.id), "X-User-Role": role, "X-User-Name": user.display_name}
    db.session.commit()
    return headers


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
    assert client.get("/api/vehicles", headers=roles[role]).status_code == 200


def test_hr_cannot_view_fleet(client, roles, vehicle):
    assert client.get("/api/vehicles", headers=roles["hr"]).status_code == 403


def test_unknown_role_cannot_view_fleet(client):
    assert client.get("/api/vehicles", headers={"X-User-Role": "ghost"}).status_code == 403


# ── Edit access ─────────────────────────────────────────────────────────────

@pytest.mark.parametrize("role", ["admin", "supervisor"])
def test_managers_can_create_a_vehicle(client, roles, role):
    resp = client.post("/api/vehicles", json=payload(unitNumber=f"90{role[:1]}"), headers=roles[role])
    assert resp.status_code == 201


@pytest.mark.parametrize("role", ["dispatcher", "hr"])
def test_non_managers_cannot_create_a_vehicle(client, roles, role):
    assert client.post("/api/vehicles", json=payload(), headers=roles[role]).status_code == 403


def test_dispatcher_can_look_but_not_touch(client, roles, vehicle):
    assert client.get("/api/vehicles", headers=roles["dispatcher"]).status_code == 200
    assert client.put(f"/api/vehicles/{vehicle.id}", json=payload(), headers=roles["dispatcher"]).status_code == 403
    assert client.patch(f"/api/vehicles/{vehicle.id}/toggle-active", headers=roles["dispatcher"]).status_code == 403
    assert client.delete(f"/api/vehicles/{vehicle.id}", headers=roles["dispatcher"]).status_code == 403


# ── Taxonomy on write ───────────────────────────────────────────────────────

def test_legacy_bari_is_canonicalized_on_create(client, roles):
    resp = client.post("/api/vehicles", json=payload(unitNumber="777", unitType="BARI"), headers=roles["admin"])
    assert resp.status_code == 201
    assert resp.get_json()["unitType"] == "Bariatric"


def test_invalid_vehicle_type_is_rejected(client, roles):
    resp = client.post("/api/vehicles", json=payload(unitNumber="778", unitType="spaceship"), headers=roles["admin"])
    assert resp.status_code == 400


# ── Audit trail (feeds the Vehicle Workspace Activity tab) ──────────────────

def test_create_is_audited(client, roles):
    resp = client.post("/api/vehicles", json=payload(unitNumber="555"), headers=roles["admin"])
    vid = resp.get_json()["id"]
    entry = AuditLog.query.filter_by(entity_type="vehicle", entity_id=vid, action="vehicle.created").first()
    assert entry is not None
    assert entry.user_name == "Fleet Admin"


def test_update_audits_only_the_changed_fields(client, roles, vehicle):
    client.put(f"/api/vehicles/{vehicle.id}",
               json=payload(unitName="Ambu-1", unitNumber="101", unitType="BLS", notes="Now with a note"),
               headers=roles["supervisor"])
    entry = AuditLog.query.filter_by(entity_type="vehicle", entity_id=vehicle.id, action="vehicle.updated").first()
    assert entry is not None
    assert "notes" in entry.details
    assert "unit_name" not in entry.details  # unchanged fields are not logged


def test_toggle_active_is_audited_with_the_resulting_state(client, roles, vehicle):
    client.patch(f"/api/vehicles/{vehicle.id}/toggle-active", headers=roles["admin"])
    entry = AuditLog.query.filter_by(entity_type="vehicle", entity_id=vehicle.id).order_by(AuditLog.id.desc()).first()
    assert entry.action == "vehicle.deactivated"


def test_delete_is_audited_before_the_row_disappears(client, roles, vehicle):
    vid = vehicle.id
    client.delete(f"/api/vehicles/{vid}", headers=roles["admin"])
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
    resp = client.post(f"/api/vehicles/{vehicle.id}/odometer",
                       json={"reading": 12000, "unit": "mi", "notes": "Start of shift"},
                       headers=roles["admin"])
    assert resp.status_code == 201
    assert resp.get_json()["reading"] == 12000
    refreshed = db.session.get(Vehicle, vehicle.id)
    assert refreshed.current_odometer == 12000
    assert refreshed.last_odometer_update


def test_odometer_history_is_kept_not_overwritten(client, roles, vehicle):
    for reading in (100, 200, 300):
        client.post(f"/api/vehicles/{vehicle.id}/odometer", json={"reading": reading}, headers=roles["admin"])
    history = client.get(f"/api/vehicles/{vehicle.id}/odometer", headers=roles["dispatcher"]).get_json()
    assert [e["reading"] for e in history] == [300, 200, 100]   # newest first, nothing lost


def test_odometer_cannot_run_backwards(client, roles, vehicle):
    client.post(f"/api/vehicles/{vehicle.id}/odometer", json={"reading": 5000}, headers=roles["admin"])
    resp = client.post(f"/api/vehicles/{vehicle.id}/odometer", json={"reading": 4000}, headers=roles["admin"])
    assert resp.status_code == 409
    assert "backwards" in resp.get_json()["error"]
    assert db.session.get(Vehicle, vehicle.id).current_odometer == 5000  # unchanged


def test_odometer_rollback_allowed_as_an_explicit_correction(client, roles, vehicle):
    client.post(f"/api/vehicles/{vehicle.id}/odometer", json={"reading": 5000}, headers=roles["admin"])
    resp = client.post(f"/api/vehicles/{vehicle.id}/odometer",
                       json={"reading": 4000, "correction": True}, headers=roles["admin"])
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
    resp = client.post(f"/api/vehicles/{vehicle.id}/odometer", json=payload, headers=roles["admin"])
    assert resp.status_code == expected


def test_dispatcher_can_read_but_not_record_odometer(client, roles, vehicle):
    assert client.get(f"/api/vehicles/{vehicle.id}/odometer", headers=roles["dispatcher"]).status_code == 200
    assert client.post(f"/api/vehicles/{vehicle.id}/odometer", json={"reading": 1},
                       headers=roles["dispatcher"]).status_code == 403
    assert client.get(f"/api/vehicles/{vehicle.id}/odometer", headers=roles["hr"]).status_code == 403


# ── Maintenance API ─────────────────────────────────────────────────────────

def test_create_and_list_maintenance(client, roles, vehicle):
    resp = client.post(f"/api/vehicles/{vehicle.id}/maintenance",
                       json={"maintenanceType": "oil_change", "scheduledDate": "2026-08-01",
                             "vendor": "Joe Garage", "cost": 89.5},
                       headers=roles["supervisor"])
    assert resp.status_code == 201
    assert resp.get_json()["status"] == "scheduled"
    records = client.get(f"/api/vehicles/{vehicle.id}/maintenance", headers=roles["dispatcher"]).get_json()
    assert len(records) == 1


@pytest.mark.parametrize("payload", [
    {"maintenanceType": "teleportation"},
    {"maintenanceType": "oil_change", "status": "invented"},
    {"maintenanceType": "oil_change", "scheduledDate": "2026-02-30"},
    {"maintenanceType": "oil_change", "cost": -10},
    {"maintenanceType": "oil_change", "odometerAtService": -1},
])
def test_maintenance_validation(client, roles, vehicle, payload):
    assert client.post(f"/api/vehicles/{vehicle.id}/maintenance", json=payload,
                       headers=roles["admin"]).status_code == 400


def test_completing_maintenance_fills_a_completion_date_and_updates_the_vehicle(client, roles, vehicle):
    created = client.post(f"/api/vehicles/{vehicle.id}/maintenance",
                          json={"maintenanceType": "oil_change", "scheduledDate": "2026-08-01"},
                          headers=roles["admin"]).get_json()
    record_id = created["id"]
    resp = client.patch(f"/api/vehicles/maintenance/{record_id}",
                        json={"status": "completed", "odometerAtService": 30000},
                        headers=roles["admin"])
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["status"] == "completed"
    assert body["completedDate"]                    # filled rather than left blank
    refreshed = db.session.get(Vehicle, vehicle.id)
    assert refreshed.last_service_date == body["completedDate"]
    assert refreshed.last_service_mileage == 30000


def test_dispatcher_cannot_create_maintenance(client, roles, vehicle):
    assert client.post(f"/api/vehicles/{vehicle.id}/maintenance",
                       json={"maintenanceType": "oil_change"},
                       headers=roles["dispatcher"]).status_code == 403


# ── Capabilities ────────────────────────────────────────────────────────────

def test_capabilities_are_validated_and_canonicalized(client, roles):
    resp = client.post("/api/vehicles",
                       json={"unitName": "Multi", "unitNumber": "MC1", "unitType": "BLS",
                             "capabilities": ["bls", "BARI", "wc"]},
                       headers=roles["admin"])
    assert resp.status_code == 201
    assert resp.get_json()["capabilities"] == ["BLS", "Bariatric", "Wheelchair"]


def test_invalid_capability_is_rejected(client, roles):
    resp = client.post("/api/vehicles",
                       json={"unitName": "Bad", "unitNumber": "BC1", "unitType": "BLS",
                             "capabilities": ["BLS", "teleport"]},
                       headers=roles["admin"])
    assert resp.status_code == 400
    assert "teleport" in resp.get_json()["error"]


# ── Retire instead of delete ────────────────────────────────────────────────

def test_retire_requires_a_reason(client, roles, vehicle):
    assert client.post(f"/api/vehicles/{vehicle.id}/retire", json={}, headers=roles["admin"]).status_code == 400


def test_retiring_makes_a_vehicle_unavailable_but_keeps_it(client, roles, vehicle):
    resp = client.post(f"/api/vehicles/{vehicle.id}/retire",
                       json={"reason": "Sold"}, headers=roles["admin"])
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["isRetired"] is True and body["availableForService"] is False
    assert body["retiredReason"] == "Sold"
    assert db.session.get(Vehicle, vehicle.id) is not None   # still there


def test_retiring_twice_is_rejected_and_unretire_restores(client, roles, vehicle):
    client.post(f"/api/vehicles/{vehicle.id}/retire", json={"reason": "Sold"}, headers=roles["admin"])
    assert client.post(f"/api/vehicles/{vehicle.id}/retire", json={"reason": "Again"},
                       headers=roles["admin"]).status_code == 409
    resp = client.post(f"/api/vehicles/{vehicle.id}/unretire", headers=roles["admin"])
    assert resp.status_code == 200
    assert resp.get_json()["isRetired"] is False


def test_vehicle_with_history_cannot_be_deleted(client, roles, vehicle):
    from models import DailyCrewUnit
    unit = DailyCrewUnit(shift_date="2026-07-20", unit_type="BLS", truck_number="101",
                         start_time="08:00", vehicle_id=vehicle.id)
    db.session.add(unit)
    db.session.commit()

    resp = client.delete(f"/api/vehicles/{vehicle.id}", headers=roles["admin"])
    assert resp.status_code == 409
    assert "Retire it instead" in resp.get_json()["error"]
    assert resp.get_json()["shifts"] == 1
    assert db.session.get(Vehicle, vehicle.id) is not None


def test_vehicle_without_history_can_still_be_deleted(client, roles, vehicle):
    assert client.delete(f"/api/vehicles/{vehicle.id}", headers=roles["admin"]).status_code == 200


def test_odometer_history_also_blocks_deletion(client, roles, vehicle):
    client.post(f"/api/vehicles/{vehicle.id}/odometer", json={"reading": 10}, headers=roles["admin"])
    resp = client.delete(f"/api/vehicles/{vehicle.id}", headers=roles["admin"])
    assert resp.status_code == 409
    assert resp.get_json()["odometerEntries"] == 1
