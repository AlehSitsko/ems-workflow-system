from models import db, Employee


def _make(app, **kw):
    emp = Employee(first_name=kw.get("first_name", "Jane"),
                   last_name=kw.get("last_name", "Doe"),
                   role=kw.get("role", "EMT"))
    db.session.add(emp)
    db.session.commit()
    return emp


def test_get_employee_returns_the_record(client, app):
    emp = _make(app, first_name="Sarah", last_name="Collins", role="Paramedic")
    resp = client.get(f"/api/employees/{emp.id}")
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["firstName"] == "Sarah"
    assert body["lastName"] == "Collins"
    assert body["role"] == "Paramedic"
    # Nested certification blocks come back shaped for the workspace.
    assert set(body["cpr"]) == {"hasLicense", "licenseName", "expirationDate"}


def test_get_employee_404_for_unknown_id(client):
    resp = client.get("/api/employees/999999")
    assert resp.status_code == 404
    assert "error" in resp.get_json()
