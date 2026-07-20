"""Turning a standing transport order into actual trips.

The rules that matter, in one place:

  * A generated trip is an ordinary Call. Nothing downstream needs to know it
    came from a template.
  * Regeneration is idempotent: running it twice does not double-book a patient.
  * A trip a human has touched is never rewritten or removed by the template.
    A schedule change must not quietly undo a dispatcher's correction, and the
    `recurrence_locked` flag is what makes that a rule rather than a hope.
  * The past is left alone entirely.
"""

from datetime import datetime, timedelta

from models import db, Call, CallAssignment
from utils.operational_dates import local_today, parse_operational_date


# A generated call stops being the template's business once any of these is true.
def is_touched(call):
    """True when a human has acted on this call.

    Explicitly locked, or given a decision it could only get from a person: it
    has been confirmed/declined, cancelled, completed, or assigned to a unit.
    """
    if call.recurrence_locked:
        return True
    if call.status not in ("new",):
        return True
    if (call.confirmation_status or "not_called") != "not_called":
        return True
    return CallAssignment.query.filter_by(call_id=call.id, is_active=True).first() is not None


def occurrences(trip, horizon_end=None, today=None):
    """The dates this standing order should run on, from today to the horizon.

    Never returns a past date: backfilling trips that nobody drove would put
    invented history on the board.
    """
    today = today or local_today()
    start = parse_operational_date(trip.start_date)
    if not start:
        return []

    weekdays = trip.parsed_weekdays()
    if not weekdays:
        return []

    first = max(start, today)
    horizon = horizon_end or (today + timedelta(weeks=trip.horizon_weeks or 4))

    end = horizon
    trip_end = parse_operational_date(trip.end_date) if trip.end_date else None
    if trip_end and trip_end < end:
        end = trip_end

    out = []
    cursor = first
    while cursor <= end:
        if cursor.weekday() in weekdays:
            out.append(cursor.isoformat())
        cursor += timedelta(days=1)
    return out


def _new_call_from(trip, day, is_return=False):
    return Call(
        patient_id=trip.patient_id,
        dispatcher_name=trip.created_by_name or "Recurring schedule",
        date_of_call=local_today().isoformat(),
        trip_date=day,
        pickup_time=(trip.return_pickup_time if is_return else trip.pickup_time) or None,
        # The return leg runs the same journey backwards.
        pickup_address=trip.dropoff_address if is_return else trip.pickup_address,
        dropoff_address=trip.pickup_address if is_return else trip.dropoff_address,
        call_type="return" if is_return else (trip.call_type or "Appointment"),
        service_level=trip.service_level,
        notes=trip.notes,
        status="new",
        confirmation_status="not_called",
        recurring_trip_id=trip.id,
        recurrence_locked=False,
        received_at=datetime.now().isoformat(timespec="seconds"),
    )


def generate(trip, apply_to_touched=False, today=None):
    """Materialise this order's trips up to its horizon.

    Returns a report of what changed. Days that already have a generated call are
    left alone unless the template's details drifted, in which case an untouched
    call is refreshed. Generated calls on days the order no longer covers are
    removed — again, only the untouched ones.

    `apply_to_touched` is the deliberate override: it re-syncs calls a human has
    already worked, which is destructive and therefore never the default.
    """
    today = today or local_today()
    wanted = set(occurrences(trip, today=today))

    existing = (Call.query
                .filter(Call.recurring_trip_id == trip.id,
                        Call.trip_date >= today.isoformat())
                .all())

    # Outbound legs are keyed by day; the return leg rides along with its parent.
    by_day = {}
    for call in existing:
        if call.call_type == "return":
            continue
        by_day.setdefault(call.trip_date, []).append(call)

    created, updated, removed, skipped = 0, 0, 0, 0

    for day in sorted(wanted):
        if day in by_day:
            for call in by_day[day]:
                if is_touched(call) and not apply_to_touched:
                    skipped += 1
                    continue
                if _refresh(call, trip):
                    updated += 1
            continue

        outbound = _new_call_from(trip, day)
        db.session.add(outbound)
        created += 1

        if trip.return_pickup_time:
            db.session.flush()          # need the outbound id to link the pair
            back = _new_call_from(trip, day, is_return=True)
            back.linked_call_id = outbound.id
            db.session.add(back)
            db.session.flush()
            outbound.linked_call_id = back.id
            created += 1

    # Days the order no longer covers.
    for day, calls in by_day.items():
        if day in wanted:
            continue
        for call in calls:
            if is_touched(call) and not apply_to_touched:
                skipped += 1
                continue
            for leg in Call.query.filter_by(linked_call_id=call.id).all():
                db.session.delete(leg)
                removed += 1
            db.session.delete(call)
            removed += 1

    db.session.commit()
    return {"created": created, "updated": updated, "removed": removed, "skipped": skipped}


def _refresh(call, trip):
    """Copy the template onto an untouched call. True when something changed."""
    fields = {
        "pickup_time": trip.pickup_time or None,
        "pickup_address": trip.pickup_address,
        "dropoff_address": trip.dropoff_address,
        "service_level": trip.service_level,
        "call_type": trip.call_type or "Appointment",
        "notes": trip.notes,
    }
    changed = False
    for field, value in fields.items():
        if getattr(call, field) != value:
            setattr(call, field, value)
            changed = True
    return changed
