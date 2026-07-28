"""Estimated trip duration → derived planned end time on a Call.

The estimate is optional; when set alongside a pickup time the API derives a
planned end (pickup + duration) so a scheduler sees when the unit is free.
"""

import pytest


def create_call(client, **fields):
    body = {"trip_date": "2026-08-01", "pickup_time": "10:00", "service_level": "BLS"}
    body.update(fields)
    return client.post("/api/calls", json=body)


def test_duration_and_planned_end_round_trip(clients):
    body = create_call(clients["dispatcher"], estimated_duration_minutes=90).get_json()
    assert body["estimated_duration_minutes"] == 90
    assert body["planned_end_time"] == "11:30"
    assert body["planned_end_next_day"] is False


def test_planned_end_is_blank_without_a_duration(clients):
    body = create_call(clients["dispatcher"]).get_json()
    assert body["estimated_duration_minutes"] is None
    assert body["planned_end_time"] == ""
    assert body["planned_end_next_day"] is False


def test_planned_end_is_blank_without_a_pickup_time(clients):
    body = create_call(clients["dispatcher"], pickup_time="", estimated_duration_minutes=60).get_json()
    assert body["planned_end_time"] == ""


def test_planned_end_flags_crossing_midnight(clients):
    body = create_call(clients["dispatcher"],
                       pickup_time="23:30", estimated_duration_minutes=60).get_json()
    assert body["planned_end_time"] == "00:30"
    assert body["planned_end_next_day"] is True


@pytest.mark.parametrize("bad", [0, -15, 1441, "abc", 10.5])
def test_invalid_durations_are_rejected(clients, bad):
    assert create_call(clients["dispatcher"], estimated_duration_minutes=bad).status_code == 400


def test_duration_can_be_updated_and_cleared(clients):
    call_id = create_call(clients["dispatcher"], estimated_duration_minutes=30).get_json()["id"]

    updated = clients["dispatcher"].put(f"/api/calls/{call_id}",
                                        json={"estimated_duration_minutes": 120}).get_json()
    assert updated["estimated_duration_minutes"] == 120
    assert updated["planned_end_time"] == "12:00"

    cleared = clients["dispatcher"].put(f"/api/calls/{call_id}",
                                        json={"estimated_duration_minutes": ""}).get_json()
    assert cleared["estimated_duration_minutes"] is None
    assert cleared["planned_end_time"] == ""


def test_update_rejects_a_bad_duration(clients):
    call_id = create_call(clients["dispatcher"]).get_json()["id"]
    assert clients["dispatcher"].put(f"/api/calls/{call_id}",
                                     json={"estimated_duration_minutes": 5000}).status_code == 400
