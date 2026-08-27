"""Backend tests for the payroll *period* lifecycle (routes/payroll_routes.py):
create / list / delete, validation, RBAC. The payroll math itself is covered by
test_payroll.py; this fills the previously-uncovered HTTP CRUD around periods.

Run: pytest backend/tests/test_payroll_periods.py -v
"""

from models import PayPeriod


def _create(api, **over):
    body = {"start_date": "2026-08-01", "end_date": "2026-08-15", "period_type": "biweekly"}
    body.update(over)
    return api.post("/api/payroll/periods", json=body)


def test_dispatcher_cannot_manage_periods(clients, app):
    assert clients["dispatcher"].get("/api/payroll/periods").status_code == 403


def test_anonymous_cannot_list_periods(anon, app):
    assert anon.get("/api/payroll/periods").status_code == 401


def test_create_requires_start_and_end(clients, app):
    assert clients["hr"].post("/api/payroll/periods", json={"start_date": "2026-08-01"}).status_code == 400


def test_create_list_delete_period(clients, app):
    api = clients["hr"]
    created = _create(api)
    assert created.status_code == 201
    pid = created.get_json()["id"]

    listed = api.get("/api/payroll/periods").get_json()
    assert any(p["id"] == pid for p in listed)

    assert api.delete(f"/api/payroll/periods/{pid}").status_code == 200
    assert PayPeriod.query.get(pid) is None


def test_delete_unknown_period_is_404(clients, app):
    assert clients["admin"].delete("/api/payroll/periods/999999").status_code == 404
