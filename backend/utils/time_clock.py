"""Clock in / out — the state machine behind both entry points.

The shared wall clock kiosk (PIN-authenticated) and the employee portal
(session-authenticated) differ only in *who* they let clock; the actual open/close
of a `TimeEntry` is identical, so it lives here and both call it. That keeps one
rule — a person is clocked in when they have exactly one open `clock` entry — in
one place.
"""

from datetime import datetime

from models import db, TimeEntry


def active_clock_entry(employee_id):
    """The employee's open clock entry (no clock_out), or None."""
    return (
        TimeEntry.query
        .filter(
            TimeEntry.employee_id == employee_id,
            TimeEntry.clock_out.is_(None),
            TimeEntry.entry_type == "clock",
        )
        .order_by(TimeEntry.clock_in.desc())
        .first()
    )


def clock_in(employee_id):
    """Open a clock entry. Returns (entry, None) or (None, active_entry) when the
    employee is already clocked in (the caller decides the error shape)."""
    active = active_clock_entry(employee_id)
    if active:
        return None, active
    entry = TimeEntry(
        employee_id=employee_id,
        clock_in=datetime.now().isoformat(timespec="seconds"),
        entry_type="clock",
        status="approved",
    )
    db.session.add(entry)
    db.session.commit()
    return entry, None


def clock_out(employee_id):
    """Close the open clock entry. Returns (entry, None) or (None, None) when the
    employee was not clocked in."""
    active = active_clock_entry(employee_id)
    if not active:
        return None, None
    active.clock_out = datetime.now().isoformat(timespec="seconds")
    db.session.commit()
    return active, None
