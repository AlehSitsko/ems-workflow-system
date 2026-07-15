"""Shared operational-date rules for the Dispatch Board and Calendar.

Planning / Live / History are **backend** rules, not just frontend affordances.
A disabled button is a convenience; these helpers are the enforcement.

  * Planning (future date) — plan crew shifts, assign/unassign, reorder the
    queue. No live lifecycle: no Complete/Reopen, no unit status transitions,
    no lifecycle timestamps.
  * Live (today)           — planning operations plus the full live lifecycle.
  * History (past date)    — read-only. There is deliberately no supervisor/admin
    override; adding one requires its own workflow (reason + audit record).

`Call.trip_date` and `DailyCrewUnit.shift_date` are **local operational dates**.
They are never parsed as UTC — a shift on 2026-07-14 is that calendar day for
the crew working it, regardless of server timezone offset.

Every guard returns either `None` (allowed) or an `(payload, status)` tuple the
view can return directly, so route code stays a one-line check.
"""

from datetime import date, datetime

from utils.validation_utils import is_valid_date

PLANNING = "planning"
LIVE = "live"
HISTORY = "history"


def local_today():
    """Today's server-local operational date (never UTC)."""
    return datetime.now().date()


def parse_operational_date(value):
    """Strict YYYY-MM-DD → `date`, or None if it is not a real calendar date.

    Rejects malformed input (2026-99-99) and non-existent days (2026-02-30);
    accepts a valid leap day (2028-02-29).
    """
    if not is_valid_date(value):
        return None
    return date.fromisoformat(value)


def operational_mode(value, today=None):
    """Return PLANNING / LIVE / HISTORY for a date string or `date`.

    Returns None when the value is not a valid operational date.
    """
    parsed = value if isinstance(value, date) else parse_operational_date(value)
    if parsed is None:
        return None
    reference = today or local_today()
    if parsed == reference:
        return LIVE
    return PLANNING if parsed > reference else HISTORY


# ── Guards ──────────────────────────────────────────────────────────────────

def require_valid_date(value, field="date"):
    """400 unless `value` is a real YYYY-MM-DD calendar date."""
    if not is_valid_date(value):
        return {"error": f"{field} must be a real calendar date in YYYY-MM-DD format"}, 400
    return None


def require_operational_date(value, field="date"):
    """409 when a record has no usable operational date to reason about.

    A call/unit with a missing or malformed date cannot be placed on a day, so
    it cannot take part in date-scoped operations.
    """
    if not is_valid_date(value):
        return {
            "error": f"Record has no valid operational {field} — it cannot be used in "
                     f"date-scoped dispatch operations.",
        }, 409
    return None


def require_live_date(value, what="This action"):
    """409 unless `value` is today. Live-only lifecycle operations."""
    invalid = require_operational_date(value)
    if invalid:
        return invalid
    mode = operational_mode(value)
    if mode != LIVE:
        return {
            "error": f"{what} is only available on today's board. {value} is a "
                     f"{mode} date.",
            "mode": mode,
            "date": value,
        }, 409
    return None


def prohibit_historical_mutation(value, what="This action"):
    """409 when `value` is a past date. Planning + Live are allowed."""
    invalid = require_operational_date(value)
    if invalid:
        return invalid
    mode = operational_mode(value)
    if mode == HISTORY:
        return {
            "error": f"{value} is a past (history) date — it is read-only. "
                     f"{what} is not permitted.",
            "mode": mode,
            "date": value,
        }, 409
    return None


def validate_call_unit_dates(trip_date, shift_date):
    """409 unless the call's trip_date matches the unit's shift_date.

    A call may only be assigned to a unit working that same operational day —
    cross-date assignment silently corrupts both boards.
    """
    invalid = require_operational_date(trip_date, "trip_date")
    if invalid:
        return invalid
    invalid = require_operational_date(shift_date, "shift_date")
    if invalid:
        return invalid
    if trip_date != shift_date:
        return {
            "error": f"Cross-date assignment is not allowed: the call is on "
                     f"{trip_date} but the unit works {shift_date}.",
            "tripDate": trip_date,
            "shiftDate": shift_date,
        }, 409
    return None
