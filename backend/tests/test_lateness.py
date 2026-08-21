"""Unit tests for the punctuality/lateness engine (pure, no app/DB)."""

from utils import lateness as L


def test_scheduled_datetime_combines_or_rejects():
    assert L.scheduled_datetime("2026-08-19", "09:00").isoformat() == "2026-08-19T09:00:00"
    assert L.scheduled_datetime("2026-08-19", None) is None
    assert L.scheduled_datetime(None, "09:00") is None
    assert L.scheduled_datetime("2026-08-19", "not-a-time") is None


def test_parse_actual():
    assert L.parse_actual("2026-08-19T09:30:00").hour == 9
    assert L.parse_actual(None) is None
    assert L.parse_actual("garbage") is None


def test_lateness_minutes_signed():
    sched = L.scheduled_datetime("2026-08-19", "09:00")
    assert L.lateness_minutes(sched, L.parse_actual("2026-08-19T09:30:00")) == 30   # late
    assert L.lateness_minutes(sched, L.parse_actual("2026-08-19T08:55:00")) == -5   # early
    assert L.lateness_minutes(sched, None) is None
    assert L.lateness_minutes(None, L.parse_actual("2026-08-19T09:30:00")) is None


def test_pickup_lateness_the_users_example():
    # pickup 09:00, crew pressed on-scene at 09:30 → 30 minutes late.
    call = {"trip_date": "2026-08-19", "pickup_time": "09:00",
            "arrived_pickup_at": "2026-08-19T09:30:00"}
    assert L.pickup_lateness(call) == 30
    # No actual arrival yet → not measurable.
    assert L.pickup_lateness({"trip_date": "2026-08-19", "pickup_time": "09:00"}) is None


def test_appointment_lateness():
    call = {"trip_date": "2026-08-19", "appointment_time": "10:00",
            "arrived_dest_at": "2026-08-19T10:12:00"}
    assert L.appointment_lateness(call) == 12
    # No appointment scheduled → not measurable, even with an arrival.
    assert L.appointment_lateness({"trip_date": "2026-08-19",
                                   "arrived_dest_at": "2026-08-19T10:12:00"}) is None


def test_is_late_respects_grace():
    assert L.is_late(6, grace=5) is True
    assert L.is_late(5, grace=5) is False      # exactly grace is on time
    assert L.is_late(-3, grace=5) is False      # early
    assert L.is_late(None, grace=5) is False    # unmeasurable never counts as late


def test_summarize_rolls_up_on_time_rate_and_averages():
    # 2 & 3 min → on time (grace 5); 20 & 40 → late; None → skipped.
    s = L.summarize([2, 3, 20, 40, None], grace=5)
    assert s["measured"] == 4
    assert s["late"] == 2
    assert s["onTime"] == 2
    assert s["onTimeRate"] == 50
    assert s["avgLateMinutes"] == 30   # mean of the late ones (20, 40)
    assert s["maxLateMinutes"] == 40


def test_summarize_empty_and_all_on_time():
    empty = L.summarize([], grace=5)
    assert empty["measured"] == 0 and empty["onTimeRate"] is None
    allok = L.summarize([0, 1, 5], grace=5)
    assert allok["late"] == 0 and allok["onTimeRate"] == 100
    assert allok["avgLateMinutes"] == 0 and allok["maxLateMinutes"] == 0
