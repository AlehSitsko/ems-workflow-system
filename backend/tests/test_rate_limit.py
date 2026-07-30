"""Security review — rate limiting on the PIN-gated kiosk endpoints.

A 4-digit kiosk PIN with no session behind it is brute-forceable, so the
verify-pin / clock endpoints are capped per employee, per IP. The default test
app disables rate limiting, so this builds its own app with it enabled.
"""

import pytest

from app import create_app
from models import db as _db, Employee


@pytest.fixture()
def rl_app():
    app = create_app({
        "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
        "RATELIMIT_ENABLED": True,
    })
    with app.app_context():
        _db.create_all()
        a = Employee(first_name="Kiosk", last_name="One", kiosk_pin="1234")
        b = Employee(first_name="Kiosk", last_name="Two", kiosk_pin="5678")
        _db.session.add_all([a, b])
        _db.session.commit()
        yield app, a.id, b.id
        _db.session.remove()
        _db.drop_all()


def test_pin_guesses_against_one_employee_are_capped(rl_app):
    app, emp_id, other_id = rl_app
    client = app.test_client()

    # Ten wrong-PIN guesses against one employee are allowed; the eleventh is 429.
    codes = [
        client.post("/api/kiosk/verify-pin", json={"employee_id": emp_id, "pin": f"{i:04d}"}).status_code
        for i in range(11)
    ]
    assert 429 not in codes[:10]
    assert codes[10] == 429


def test_a_different_employee_is_a_separate_bucket(rl_app):
    app, emp_id, other_id = rl_app
    client = app.test_client()

    for i in range(11):  # exhaust the first employee's bucket
        client.post("/api/kiosk/verify-pin", json={"employee_id": emp_id, "pin": f"{i:04d}"})

    # A shared wall kiosk clocking a different person is not blocked by that.
    resp = client.post("/api/kiosk/verify-pin", json={"employee_id": other_id, "pin": "0000"})
    assert resp.status_code != 429
