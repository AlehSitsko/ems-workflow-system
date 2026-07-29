"""Occurrence expansion for manual calendar events — pure date logic."""

from datetime import date

from utils.event_recurrence import occurrences_in


def occ(event_date, recurrence, until, start, end):
    return occurrences_in(event_date, recurrence, until, date.fromisoformat(start), date.fromisoformat(end))


# ── One-off ──────────────────────────────────────────────────────────────────

def test_none_returns_the_single_date_when_in_range():
    assert occ("2026-08-10", "none", None, "2026-08-01", "2026-08-31") == ["2026-08-10"]


def test_none_outside_the_range_is_empty():
    assert occ("2026-07-10", "none", None, "2026-08-01", "2026-08-31") == []


def test_malformed_base_yields_nothing():
    assert occ("not-a-date", "weekly", None, "2026-08-01", "2026-08-31") == []


# ── Daily ────────────────────────────────────────────────────────────────────

def test_daily_fills_every_day_in_range():
    assert occ("2026-08-01", "daily", None, "2026-08-01", "2026-08-04") == [
        "2026-08-01", "2026-08-02", "2026-08-03", "2026-08-04",
    ]


def test_daily_starts_at_window_when_base_is_earlier():
    # Base far before the window: only the in-window days come back.
    result = occ("2026-01-01", "daily", None, "2026-08-10", "2026-08-12")
    assert result == ["2026-08-10", "2026-08-11", "2026-08-12"]


# ── Weekly ───────────────────────────────────────────────────────────────────

def test_weekly_keeps_the_weekday():
    result = occ("2026-08-03", "weekly", None, "2026-08-01", "2026-08-31")  # a Monday
    assert result == ["2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24", "2026-08-31"]
    assert all(date.fromisoformat(d).weekday() == 0 for d in result)


def test_weekly_jump_aligns_to_the_cadence():
    # Base Aug 3 (Mon); window starts Aug 12 → first occurrence is Aug 17, not 12.
    assert occ("2026-08-03", "weekly", None, "2026-08-12", "2026-08-31")[0] == "2026-08-17"


# ── Monthly ──────────────────────────────────────────────────────────────────

def test_monthly_keeps_day_of_month():
    result = occ("2026-01-15", "monthly", None, "2026-01-01", "2026-04-30")
    assert result == ["2026-01-15", "2026-02-15", "2026-03-15", "2026-04-15"]


def test_monthly_clamps_short_months_without_drifting():
    # The 31st: Feb clamps to 28, but March returns to 31 (no permanent drift).
    result = occ("2026-01-31", "monthly", None, "2026-01-01", "2026-03-31")
    assert result == ["2026-01-31", "2026-02-28", "2026-03-31"]


# ── until cap ────────────────────────────────────────────────────────────────

def test_recurrence_until_caps_the_series():
    result = occ("2026-08-01", "weekly", "2026-08-15", "2026-08-01", "2026-08-31")
    assert result == ["2026-08-01", "2026-08-08", "2026-08-15"]


def test_base_after_the_window_is_empty():
    assert occ("2026-09-05", "daily", None, "2026-08-01", "2026-08-31") == []
