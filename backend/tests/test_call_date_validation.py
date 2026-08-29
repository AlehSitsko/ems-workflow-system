"""Server-side date validation on call intake.

A call may be dateless (it waits in the scheduling inbox), but any date that *is*
supplied must be a real calendar date in YYYY-MM-DD form — otherwise an impossible
value like '2026-02-30', or stray text like 'not-a-date', is stored and never lands
on any board, and it breaks the date-range filters that assume ISO dates.
"""

import pytest


def create_call(client, **fields):
    body = {"trip_date": "2026-08-01", "pickup_time": "10:00", "service_level": "BLS"}
    body.update(fields)
    return client.post("/api/calls", json=body)


BAD_DATES = [
    "2026-02-30",   # impossible day (Feb has 28/29)
    "2026-13-45",   # impossible month and day
    "not-a-date",   # not a date at all
    "0000-00-00",   # zero month/day
    "2026-00-10",   # zero month
    "10/31/2026",   # wrong format (US slash form)
    "2026-8-1",     # unpadded — not ISO YYYY-MM-DD
]


def test_valid_date_is_accepted(clients):
    assert create_call(clients["dispatcher"], trip_date="2026-08-01").status_code == 201


def test_call_may_be_dateless(clients):
    # The scheduling inbox holds calls with no trip date yet.
    assert create_call(clients["dispatcher"], trip_date="").status_code == 201
    assert create_call(clients["dispatcher"], trip_date=None).status_code == 201


@pytest.mark.parametrize("bad", BAD_DATES)
def test_invalid_trip_date_is_rejected_on_create(clients, bad):
    assert create_call(clients["dispatcher"], trip_date=bad).status_code == 400


@pytest.mark.parametrize("bad", BAD_DATES)
def test_invalid_date_of_call_is_rejected_on_create(clients, bad):
    assert create_call(clients["dispatcher"], date_of_call=bad).status_code == 400


def test_update_rejects_an_invalid_trip_date(clients):
    call_id = create_call(clients["dispatcher"]).get_json()["id"]
    assert clients["dispatcher"].put(f"/api/calls/{call_id}",
                                     json={"trip_date": "2026-02-30"}).status_code == 400


def test_update_accepts_a_valid_trip_date(clients):
    call_id = create_call(clients["dispatcher"]).get_json()["id"]
    updated = clients["dispatcher"].put(f"/api/calls/{call_id}",
                                        json={"trip_date": "2026-09-15"})
    assert updated.status_code == 200
    assert updated.get_json()["trip_date"] == "2026-09-15"
