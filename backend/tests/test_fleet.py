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
