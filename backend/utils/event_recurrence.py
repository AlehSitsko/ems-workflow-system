"""Recurrence expansion for manual calendar events.

Deliberately small: a base date plus one of a few simple frequencies, expanded
into the concrete days it lands on inside a query window. There is no per-
occurrence editing — an event is one row and editing it edits the whole series —
so an occurrence needs no identity beyond its date.

Weekly keeps the base weekday; monthly keeps the base day-of-month, clamped to a
short month (Jan 31 → Feb 28 → Mar 31) so the day never drifts.

Distinct from utils/recurrence.py, which generates trips from a standing order —
a different domain entirely.
"""

from calendar import monthrange
from datetime import date, timedelta


VALID_RECURRENCES = {"none", "daily", "weekly", "monthly"}

# A window is always bounded (≤ ~3 months for the calendar), so this only guards
# against a pathological base far in the past — never a real limit.
_MAX_OCCURRENCES = 5000


def _to_date(value):
    try:
        return date.fromisoformat(value)
    except (ValueError, TypeError):
        return None


def _nth_monthly(base, n):
    """The nth monthly occurrence after `base`, keeping base's day-of-month."""
    month_index = base.month - 1 + n
    year = base.year + month_index // 12
    month = month_index % 12 + 1
    day = min(base.day, monthrange(year, month)[1])
    return date(year, month, day)


def occurrences_in(event_date, recurrence, recurrence_until, range_start, range_end):
    """ISO date strings on which the event occurs within [range_start, range_end].

    `range_start`/`range_end` are `date`s. A malformed base date yields nothing.
    `recurrence_until` (inclusive) caps the series; None means "as far as the
    window reaches".
    """
    base = _to_date(event_date)
    if base is None:
        return []

    recurrence = recurrence or "none"
    until = _to_date(recurrence_until)
    hard_end = range_end if until is None else min(range_end, until)

    if base > hard_end:
        return []

    if recurrence == "none":
        return [base.isoformat()] if range_start <= base <= range_end else []

    if recurrence in ("daily", "weekly"):
        step = 1 if recurrence == "daily" else 7
        # Jump straight to the first occurrence on/after the window start.
        if range_start > base:
            gap = (range_start - base).days
            skip = -(-gap // step)  # ceil division
            cur = base + timedelta(days=skip * step)
        else:
            cur = base
        out = []
        while cur <= hard_end:
            out.append(cur.isoformat())
            cur += timedelta(days=step)
        return out

    if recurrence == "monthly":
        out = []
        n = 0
        while n < _MAX_OCCURRENCES:
            occ = _nth_monthly(base, n)
            if occ > hard_end:
                break
            if occ >= range_start:
                out.append(occ.isoformat())
            n += 1
        return out

    # Unknown frequency — treat as a one-off rather than raising in a read path.
    return [base.isoformat()] if range_start <= base <= range_end else []
