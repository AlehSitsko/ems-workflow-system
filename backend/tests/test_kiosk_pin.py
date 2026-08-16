"""Kiosk PIN is hashed at rest, never returned by the API, and verified per employee.

Set-don't-view: creating/updating an employee with a PIN stores only a hash; the
API exposes `hasPin`, never the PIN. Verify and clock-in accept the correct PIN and
reject a wrong one; an empty PIN on update leaves the existing one unchanged.
"""

from models import db, Employee


def _create(clients, pin=None):
    payload = {"firstName": "Pin", "lastName": "Holder", "role": "EMT"}
    if pin is not None:
        payload["kioskPin"] = pin
    r = clients["admin"].post("/api/employees", json=payload)
    assert r.status_code == 201, r.get_json()
    return r.get_json()


def _stored_hash(eid):
    from tenant import unfiltered
    with unfiltered():
        return db.session.get(Employee, eid).kiosk_pin_hash


def test_pin_is_hashed_and_never_returned(clients):
    body = _create(clients, "1234")
    assert body["hasPin"] is True
    assert "kioskPin" not in body
    h = _stored_hash(body["id"])
    assert h and h != "1234"          # stored as a hash, not plaintext
    assert "1234" not in h


def test_no_pin_means_haspin_false(clients):
    assert _create(clients)["hasPin"] is False


def test_verify_pin_accepts_correct_and_rejects_wrong(clients):
    eid = _create(clients, "1234")["id"]
    ok = clients["admin"].post("/api/kiosk/verify-pin", json={"employee_id": eid, "pin": "1234"})
    assert ok.status_code == 200
    bad = clients["admin"].post("/api/kiosk/verify-pin", json={"employee_id": eid, "pin": "0000"})
    assert bad.status_code == 403


def test_clock_in_requires_the_correct_pin(clients):
    eid = _create(clients, "1234")["id"]
    assert clients["admin"].post("/api/kiosk/clock-in",
                                 json={"employee_id": eid, "pin": "0000"}).status_code == 403
    assert clients["admin"].post("/api/kiosk/clock-in",
                                 json={"employee_id": eid, "pin": "1234"}).status_code == 201


def test_employee_with_no_pin_can_clock_in_without_one(clients):
    eid = _create(clients)["id"]  # no PIN set → not required (prior behaviour)
    assert clients["admin"].post("/api/kiosk/clock-in", json={"employee_id": eid}).status_code == 201


def test_empty_pin_on_update_leaves_it_unchanged_and_a_new_one_replaces(clients):
    eid = _create(clients, "1234")["id"]
    base = {"firstName": "Pin", "lastName": "Holder", "role": "EMT"}

    # Saving the form without touching the PIN (empty) keeps the old one.
    clients["admin"].put(f"/api/employees/{eid}", json={**base, "kioskPin": ""})
    assert clients["admin"].post("/api/kiosk/verify-pin",
                                 json={"employee_id": eid, "pin": "1234"}).status_code == 200

    # A new PIN replaces the old one.
    clients["admin"].put(f"/api/employees/{eid}", json={**base, "kioskPin": "9999"})
    assert clients["admin"].post("/api/kiosk/verify-pin",
                                 json={"employee_id": eid, "pin": "1234"}).status_code == 403
    assert clients["admin"].post("/api/kiosk/verify-pin",
                                 json={"employee_id": eid, "pin": "9999"}).status_code == 200
