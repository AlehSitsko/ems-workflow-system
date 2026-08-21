"""Punctuality / lateness computation for the analytics reports.

Pure functions over Call-like dicts — no DB, no Flask — so they are cheap to unit
test. A call has a *scheduled* time (``pickup_time`` / ``appointment_time``, an
``"HH:MM"`` clock time on its ``trip_date``) and an *actual* arrival
(``arrived_pickup_at`` / ``arrived_dest_at``, an ISO ``"YYYY-MM-DDTHH:MM:SS"``
timestamp stamped when the crew reached on-scene / at-destination).

Lateness is ``actual − scheduled`` in whole minutes (negative = early). A call
counts as *late* only when that exceeds the org's grace period, so a couple of
minutes' rounding never dings anyone.
"""

from datetime import datetime

# Fallback when an org has not set its own punctuality grace.
DEFAULT_GRACE_MINUTES = 5

# Only these leave/trip lateness kinds exist; kept explicit for callers.
PICKUP = "pickup"
APPOINTMENT = "appointment"


def scheduled_datetime(trip_date, time_hhmm):
    """Combine ``'YYYY-MM-DD'`` + ``'HH:MM'`` into a datetime, or None when either
    part is missing or malformed."""
    if not trip_date or not time_hhmm:
        return None
    try:
        return datetime.fromisoformat(f"{trip_date}T{time_hhmm}:00")
    except (ValueError, TypeError):
        return None


def parse_actual(iso):
    """Parse an ISO timestamp, or None when missing/malformed."""
    if not iso:
        return None
    try:
        return datetime.fromisoformat(iso)
    except (ValueError, TypeError):
        return None


def lateness_minutes(scheduled, actual):
    """Whole minutes ``actual`` is after ``scheduled`` (negative = early), or None
    when either side is missing."""
    if scheduled is None or actual is None:
        return None
    return round((actual - scheduled).total_seconds() / 60)


def pickup_lateness(call):
    """Minutes late arriving at pickup, or None if not measurable."""
    return lateness_minutes(
        scheduled_datetime(call.get("trip_date"), call.get("pickup_time")),
        parse_actual(call.get("arrived_pickup_at")),
    )


def appointment_lateness(call):
    """Minutes late arriving at the destination vs the appointment time, or None."""
    return lateness_minutes(
        scheduled_datetime(call.get("trip_date"), call.get("appointment_time")),
        parse_actual(call.get("arrived_dest_at")),
    )


def is_late(minutes, grace=DEFAULT_GRACE_MINUTES):
    """True when a measured lateness exceeds the grace period."""
    return minutes is not None and minutes > grace


def summarize(latenesses, grace=DEFAULT_GRACE_MINUTES):
    """Roll a list of per-call lateness values (None = unmeasurable, skipped) into
    punctuality stats:

    - ``measured``     — calls with a usable scheduled+actual pair
    - ``late``         — of those, how many exceeded grace
    - ``onTime``       — measured − late
    - ``onTimeRate``   — percent on time (None when nothing measured)
    - ``avgLateMinutes`` — mean lateness *of the late ones* (0 when none late)
    - ``maxLateMinutes`` — worst single lateness (0 when none late)
    """
    vals = [m for m in latenesses if m is not None]
    measured = len(vals)
    late_vals = [m for m in vals if m > grace]
    late = len(late_vals)
    on_time = measured - late
    return {
        "measured": measured,
        "late": late,
        "onTime": on_time,
        "onTimeRate": round(100 * on_time / measured) if measured else None,
        "avgLateMinutes": round(sum(late_vals) / late) if late else 0,
        "maxLateMinutes": max(late_vals) if late_vals else 0,
    }
