"""Day operational timeline — /api/operations/days/<day>/timeline.

The read side of the lifecycle timestamps: the day's trips as an agenda with
planned times, actual milestones and the pickup variance.
"""

import pytest

from models import db, Call


DAY = "2026-08-05"


def mk_call(pickup_time="10:00", **fields):
    c = Call(trip_date=DAY, pickup_time=pickup_time, service_level="BLS",
             status="completed", **fields)
    db.session.add(c)
    db.session.commit()
    return c


def timeline(client, day=DAY):
    return client.get(f"/api/operations/days/{day}/timeline")


# ── Access + validation ──────────────────────────────────────────────────────

def test_view_roles_may_read_it(clients):
    assert timeline(clients["dispatcher"]).status_code == 200
    assert timeline(clients["admin"]).status_code == 200


def test_hr_may_not(clients):
    # The operational day is admin/supervisor/dispatcher; HR has no part in it.
    assert timeline(clients["hr"]).status_code == 403


def test_bad_date_is_rejected(clients):
    assert clients["admin"].get("/api/operations/days/2026-02-30/timeline").status_code == 400


def test_empty_day_has_no_trips(clients):
    body = timeline(clients["admin"]).get_json()
    assert body["day"] == DAY
    assert body["trips"] == []
    assert body["summary"]["trips"] == 0


# ── Content ──────────────────────────────────────────────────────────────────

def test_trips_are_ordered_by_pickup_with_unscheduled_last(clients):
    mk_call(pickup_time="14:00")
    mk_call(pickup_time="08:30")
    mk_call(pickup_time="")  # unscheduled → sinks to the bottom

    trips = timeline(clients["admin"]).get_json()["trips"]
    assert [t["planned"]["pickup"] for t in trips] == ["08:30", "14:00", ""]


def test_actual_milestones_are_local_hhmm(clients):
    mk_call(pickup_time="09:00",
            dispatched_at="2026-08-05T09:02:00",
            arrived_pickup_at="2026-08-05T09:12:00",
            completed_at="2026-08-05T10:05:00")
    t = timeline(clients["admin"]).get_json()["trips"][0]
    assert t["actual"]["dispatched"] == "09:02"
    assert t["actual"]["arrivedPickup"] == "09:12"
    assert t["actual"]["completed"] == "10:05"


def test_pickup_variance_is_actual_minus_planned(clients):
    mk_call(pickup_time="09:00", arrived_pickup_at="2026-08-05T09:12:00")
    t = timeline(clients["admin"]).get_json()["trips"][0]
    assert t["pickupVarianceMinutes"] == 12


def test_variance_is_null_without_an_actual_arrival(clients):
    mk_call(pickup_time="09:00")  # never arrived
    t = timeline(clients["admin"]).get_json()["trips"][0]
    assert t["pickupVarianceMinutes"] is None


def test_late_arrivals_counts_over_ten_minutes(clients):
    mk_call(pickup_time="09:00", arrived_pickup_at="2026-08-05T09:05:00")  # 5 late → on time
    mk_call(pickup_time="10:00", arrived_pickup_at="2026-08-05T10:25:00")  # 25 late → late
    summary = timeline(clients["admin"]).get_json()["summary"]
    assert summary["trips"] == 2
    assert summary["withPickupVariance"] == 2
    assert summary["lateArrivals"] == 1


def test_planned_end_is_carried_through(clients):
    mk_call(pickup_time="09:00", estimated_duration_minutes=90)
    t = timeline(clients["admin"]).get_json()["trips"][0]
    assert t["planned"]["end"] == "10:30"
