"""Backend tests for daily crew units (routes/crew_routes.py) — the DailyCrewUnit
CRUD used by the Crew Planner / Dispatch Board.

Covers RBAC (crew-planning roles only), the create-time validation branches
(required fields, malformed date/time, non-integer vehicle/crew ids, past-date
historical guard), list + shift_date filter, delete + 404, make-night, and the
shift-alerts endpoint. A far-future date is used so the historical guard passes.

Run: pytest backend/tests/test_crew_units.py -v
"""

from models import DailyCrewUnit

FUTURE = "2027-01-15"


def _valid(**over):
    body = {"shiftDate": FUTURE, "startTime": "08:00", "truckNumber": "101"}
    body.update(over)
    return body


def _create(api, **over):
    return api.post("/api/crew-units", json=_valid(**over))


# ── RBAC ─────────────────────────────────────────────────────────────────────

def test_hr_cannot_access_crew_units(clients, app):
    assert clients["hr"].get("/api/crew-units").status_code == 403


def test_anonymous_is_unauthorized(anon, app):
    assert anon.get("/api/crew-units").status_code == 401


def test_crew_roles_may_list(clients, app):
    for role in ("admin", "supervisor", "dispatcher"):
        assert clients[role].get("/api/crew-units").status_code == 200


# ── create validation ────────────────────────────────────────────────────────

def test_create_requires_json_body(clients, app):
    assert clients["admin"].post("/api/crew-units", json={}).status_code == 400


def test_create_required_fields(clients, app):
    api = clients["admin"]
    assert api.post("/api/crew-units", json={"startTime": "08:00", "truckNumber": "1"}).status_code == 400  # no date
    assert api.post("/api/crew-units", json={"shiftDate": FUTURE, "startTime": "08:00"}).status_code == 400  # no truck
    assert api.post("/api/crew-units", json={"shiftDate": FUTURE, "truckNumber": "1"}).status_code == 400    # no start


def test_create_rejects_malformed_datetimes(clients, app):
    api = clients["admin"]
    assert _create(api, shiftDate="15-01-2027").status_code == 400
    assert _create(api, startTime="8am").status_code == 400
    assert _create(api, endTime="25:00").status_code == 400
    assert _create(api, endDate="nope").status_code == 400


def test_create_rejects_non_integer_vehicle_and_crew_ids(clients, app):
    api = clients["admin"]
    assert api.post("/api/crew-units", json=_valid(vehicleId="not-int")).status_code == 400
    assert api.post("/api/crew-units", json=_valid(crew={"driver": "abc"})).status_code == 400


def test_create_past_date_is_readonly_409(clients, app):
    # a past date is read-only history -> 409 Conflict (not a 400)
    assert _create(clients["admin"], shiftDate="2020-01-01").status_code == 409


# ── happy path + list + delete ───────────────────────────────────────────────

def test_create_list_delete(clients, app):
    api = clients["admin"]
    created = _create(api)
    assert created.status_code == 201
    uid = created.get_json()["id"]

    listed = api.get(f"/api/crew-units?shift_date={FUTURE}").get_json()
    assert any(u["id"] == uid for u in listed)
    # a different date filters it out
    assert api.get("/api/crew-units?shift_date=2027-02-02").get_json() == []

    assert api.delete(f"/api/crew-units/{uid}").status_code == 200
    assert DailyCrewUnit.query.get(uid) is None


def test_delete_unknown_unit_is_404(clients, app):
    assert clients["admin"].delete("/api/crew-units/999999").status_code == 404


def test_make_night_on_a_unit(clients, app):
    api = clients["admin"]
    uid = _create(api).get_json()["id"]
    r = api.post(f"/api/crew-units/{uid}/make-night", json={})
    assert r.status_code in (200, 201)


# ── shift alerts ─────────────────────────────────────────────────────────────

def test_shift_alerts_endpoint(clients, app):
    r = clients["dispatcher"].get("/api/crew-units/alerts")
    assert r.status_code == 200
