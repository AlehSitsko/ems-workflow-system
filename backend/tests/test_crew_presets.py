"""Backend tests for reusable crew presets (routes/crew_preset_routes.py).

A crew preset is a saved crew layout for the Crew Planner. These routes are gated
to the crew-planning roles (admin/supervisor/dispatcher) — notably NOT hr, which
had previously unguarded read/write access. Covers RBAC, the full CRUD lifecycle,
input validation (missing body / name, non-integer employee ids), and 404s.

Run: pytest backend/tests/test_crew_presets.py -v
"""

from models import db, CrewPreset


def _preset(name="Night ALS", unit="ALS"):
    p = CrewPreset(preset_name=name, unit_type=unit)
    db.session.add(p)
    db.session.commit()
    return p


# ── RBAC ─────────────────────────────────────────────────────────────────────

def test_hr_is_forbidden_from_crew_presets(clients, app):
    assert clients["hr"].get("/api/crew-presets").status_code == 403


def test_anonymous_is_unauthorized(anon, app):
    assert anon.get("/api/crew-presets").status_code == 401


def test_planning_roles_may_list(clients, app):
    for role in ("admin", "supervisor", "dispatcher"):
        assert clients[role].get("/api/crew-presets").status_code == 200


# ── create ───────────────────────────────────────────────────────────────────

def test_create_preset_happy_path(clients, app):
    r = clients["admin"].post("/api/crew-presets",
                              json={"presetName": "Day BLS", "unitType": "BLS",
                                    "crew": {"driver": "", "medical": None}})
    assert r.status_code == 201
    body = r.get_json()
    assert body["presetName"] == "Day BLS" and body["unitType"] == "BLS"


def test_create_requires_json_body(clients, app):
    # An empty JSON object -> falsy data -> 400 (not a 500).
    r = clients["admin"].post("/api/crew-presets", json={})
    assert r.status_code == 400


def test_create_requires_preset_name(clients, app):
    r = clients["admin"].post("/api/crew-presets", json={"presetName": "   "})
    assert r.status_code == 400
    assert "name" in r.get_json()["error"].lower()


def test_create_rejects_non_integer_employee_id(clients, app):
    r = clients["admin"].post("/api/crew-presets",
                              json={"presetName": "Bad", "crew": {"driver": "not-a-number"}})
    assert r.status_code == 400
    assert "employee id" in r.get_json()["error"].lower()


# ── list ordering ────────────────────────────────────────────────────────────

def test_presets_listed_alphabetically(clients, app):
    _preset("Zulu"); _preset("Alpha")
    names = [p["presetName"] for p in clients["admin"].get("/api/crew-presets").get_json()]
    assert names == sorted(names)


# ── update ───────────────────────────────────────────────────────────────────

def test_update_preset(clients, app):
    p = _preset("Old", "BLS")
    r = clients["supervisor"].put(f"/api/crew-presets/{p.id}",
                                  json={"presetName": "New", "unitType": "ALS"})
    assert r.status_code == 200
    body = r.get_json()
    assert body["presetName"] == "New" and body["unitType"] == "ALS"


def test_update_unknown_preset_is_404(clients, app):
    assert clients["admin"].put("/api/crew-presets/999999",
                                json={"presetName": "x"}).status_code == 404


def test_update_requires_name(clients, app):
    p = _preset()
    assert clients["admin"].put(f"/api/crew-presets/{p.id}", json={"presetName": ""}).status_code == 400


# ── delete ───────────────────────────────────────────────────────────────────

def test_delete_preset(clients, app):
    p = _preset()
    assert clients["admin"].delete(f"/api/crew-presets/{p.id}").status_code == 200
    assert CrewPreset.query.get(p.id) is None


def test_delete_unknown_preset_is_404(clients, app):
    assert clients["admin"].delete("/api/crew-presets/999999").status_code == 404
