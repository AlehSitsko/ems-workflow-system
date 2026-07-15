"""Authentication + authorization boundary for the operational APIs.

These are regression tests for a confirmed P0: the Dispatch Board served 41
calls *with patient names* to an anonymous request, and anonymous callers could
create crew units. The frontend hiding a page is not a security boundary — the
API must fail closed.

Contract:
    no identity            -> 401 Authentication required
    identity, wrong role   -> 403 Insufficient permissions
    permitted role         -> success

Note these tests also document the *limit* of the current scheme: the role is
taken from a request header, so they prove the gate works, not that the identity
is trustworthy. Real auth is the deferred hardening phase — see
docs/PRODUCTION_READINESS.md.
"""

import pytest
from werkzeug.security import generate_password_hash

from models import db, User, Call, DailyCrewUnit, CallAssignment, Patient


@pytest.fixture()
def roles(app):
    headers = {}
    for role in ("admin", "supervisor", "dispatcher", "hr"):
        user = User(
            username=f"sec_{role}",
            password_hash=generate_password_hash("pw"),
            display_name=f"Sec {role.title()}",
            role=role,
            is_active=True,
        )
        db.session.add(user)
        db.session.flush()
        headers[role] = {"X-User-Id": str(user.id), "X-User-Role": role, "X-User-Name": user.display_name}
    db.session.commit()
    return headers


@pytest.fixture()
def board_data(app):
    """A call with a real patient name, plus a unit and an active assignment."""
    patient = Patient(first_name="Confidential", last_name="Patient")
    db.session.add(patient)
    db.session.flush()
    call = Call(trip_date="2026-07-15", status="assigned", service_level="BLS",
                pickup_time="10:00", patient_id=patient.id)
    unit = DailyCrewUnit(shift_date="2026-07-15", unit_type="BLS",
                         truck_number="900", start_time="08:00")
    db.session.add_all([call, unit])
    db.session.flush()
    assignment = CallAssignment(call_id=call.id, unit_id=unit.id, is_active=True)
    db.session.add(assignment)
    db.session.commit()
    return {"call": call, "unit": unit, "assignment": assignment, "patient": patient}


# Every mutating dispatch route, as (method, url_template, json_body).
DISPATCH_MUTATIONS = [
    ("post", "/api/dispatch/assign", {"call_id": "{call}", "unit_id": "{unit}"}),
    ("delete", "/api/dispatch/assign/{assignment}", None),
    ("patch", "/api/dispatch/assign/{assignment}/complete", None),
    ("patch", "/api/dispatch/assign/{assignment}/reopen", None),
    ("patch", "/api/dispatch/units/{unit}/status", {"status": "en_route"}),
    ("patch", "/api/dispatch/units/{unit}/call-order", {"callIds": []}),
]


def _resolve(template, data):
    return (template
            .replace("{call}", str(data["call"].id))
            .replace("{unit}", str(data["unit"].id))
            .replace("{assignment}", str(data["assignment"].id)))


def _body(spec, data):
    if not spec:
        return None
    return {k: int(_resolve(v, data)) if isinstance(v, str) and v.startswith("{") else v
            for k, v in spec.items()}


# ── Dispatch Board: the confirmed PHI leak ──────────────────────────────────

def test_anonymous_cannot_read_the_dispatch_board(client, board_data):
    """The reported P0: this used to return 200 with patient names."""
    resp = client.get("/api/dispatch/board?date=2026-07-15")
    assert resp.status_code == 401
    assert b"Confidential" not in resp.data


def test_hr_cannot_read_the_dispatch_board(client, roles, board_data):
    resp = client.get("/api/dispatch/board?date=2026-07-15", headers=roles["hr"])
    assert resp.status_code == 403
    assert b"Confidential" not in resp.data


@pytest.mark.parametrize("role", ["admin", "supervisor", "dispatcher"])
def test_operational_roles_can_read_the_board(client, roles, board_data, role):
    resp = client.get("/api/dispatch/board?date=2026-07-15", headers=roles[role])
    assert resp.status_code == 200


def test_unknown_role_is_forbidden_not_unauthenticated(client, board_data):
    # A claimed-but-invalid role is identified, just not allowed.
    resp = client.get("/api/dispatch/board?date=2026-07-15", headers={"X-User-Role": "ghost"})
    assert resp.status_code == 403


# ── Dispatch mutations ──────────────────────────────────────────────────────

@pytest.mark.parametrize("method,url,body", DISPATCH_MUTATIONS)
def test_dispatch_mutations_reject_anonymous(client, board_data, method, url, body):
    resp = getattr(client, method)(_resolve(url, board_data), json=_body(body, board_data))
    assert resp.status_code == 401


@pytest.mark.parametrize("method,url,body", DISPATCH_MUTATIONS)
def test_dispatch_mutations_reject_hr(client, roles, board_data, method, url, body):
    resp = getattr(client, method)(_resolve(url, board_data),
                                   json=_body(body, board_data), headers=roles["hr"])
    assert resp.status_code == 403


# ── Crew units: the confirmed anonymous-write hole ──────────────────────────

def crew_payload(**overrides):
    data = {"shiftDate": "2026-09-09", "unitType": "BLS",
            "truckNumber": "SEC-1", "startTime": "08:00"}
    data.update(overrides)
    return data


def test_anonymous_cannot_create_a_crew_unit(client):
    """The reported P0: this used to return 201."""
    resp = client.post("/api/crew-units", json=crew_payload())
    assert resp.status_code == 401
    assert DailyCrewUnit.query.filter_by(truck_number="SEC-1").first() is None


def test_hr_cannot_create_a_crew_unit(client, roles):
    resp = client.post("/api/crew-units", json=crew_payload(truckNumber="SEC-2"), headers=roles["hr"])
    assert resp.status_code == 403
    assert DailyCrewUnit.query.filter_by(truck_number="SEC-2").first() is None


@pytest.mark.parametrize("role", ["admin", "supervisor", "dispatcher"])
def test_operational_roles_can_create_a_crew_unit(client, roles, role):
    resp = client.post("/api/crew-units", json=crew_payload(truckNumber=f"SEC-{role}"),
                       headers=roles[role])
    assert resp.status_code == 201


def test_anonymous_cannot_read_crew_units(client, board_data):
    # Crew units carry the day's patient order, which is PHI.
    assert client.get("/api/crew-units").status_code == 401


def test_hr_cannot_read_crew_units(client, roles, board_data):
    assert client.get("/api/crew-units", headers=roles["hr"]).status_code == 403


def test_anonymous_cannot_mutate_crew_units(client, board_data):
    unit_id = board_data["unit"].id
    assert client.put(f"/api/crew-units/{unit_id}", json=crew_payload()).status_code == 401
    assert client.delete(f"/api/crew-units/{unit_id}").status_code == 401
    assert client.post(f"/api/crew-units/{unit_id}/make-night", json={}).status_code == 401
    assert client.get("/api/crew-units/alerts").status_code == 401


def test_hr_cannot_mutate_crew_units(client, roles, board_data):
    unit_id = board_data["unit"].id
    h = roles["hr"]
    assert client.put(f"/api/crew-units/{unit_id}", json=crew_payload(), headers=h).status_code == 403
    assert client.delete(f"/api/crew-units/{unit_id}", headers=h).status_code == 403
    assert client.post(f"/api/crew-units/{unit_id}/make-night", json={}, headers=h).status_code == 403


# ── The gate must not be bypassable by omitting only part of the identity ───

def test_user_id_without_role_is_still_anonymous(client, board_data):
    resp = client.get("/api/dispatch/board?date=2026-07-15", headers={"X-User-Id": "1"})
    assert resp.status_code == 401


def test_empty_role_header_is_anonymous(client, board_data):
    resp = client.get("/api/dispatch/board?date=2026-07-15", headers={"X-User-Role": ""})
    assert resp.status_code == 401
