"""Calendar event participants, reminders and their notifications.

Participants are employees (mirroring task participants): they see the event on
their calendar and — through their linked user account — receive an invite when
added and a reminder before it starts.
"""

from datetime import datetime as real_datetime


from conftest import make_user
from models import db, Employee, NotificationEvent, UserNotification


def _employee(first="Pat", last="Rider"):
    e = Employee(first_name=first, last_name=last, role="EMT", status="active", is_active=True)
    db.session.add(e)
    db.session.commit()
    return e


def mk(client, **fields):
    body = {"title": "Standup", "eventDate": "2026-08-10", "visibility": "personal"}
    body.update(fields)
    return client.post("/api/calendar-events", json=body)


# ── Reminder validation ──────────────────────────────────────────────────────

def test_reminder_minutes_round_trip(clients):
    resp = mk(clients["admin"], reminderMinutes=30)
    assert resp.status_code == 201
    assert resp.get_json()["reminderMinutes"] == 30


def test_reminder_minutes_must_be_an_allowed_value(clients):
    assert mk(clients["admin"], reminderMinutes=45).status_code == 400
    assert mk(clients["admin"], reminderMinutes="soon").status_code == 400


# ── Participant validation + visibility ──────────────────────────────────────

def test_participants_round_trip_and_are_returned(clients):
    emp = _employee()
    resp = mk(clients["admin"], participantEmployeeIds=[emp.id])
    assert resp.status_code == 201
    parts = resp.get_json()["participants"]
    assert [p["employeeId"] for p in parts] == [emp.id]
    assert parts[0]["name"] == "Pat Rider"


def test_unknown_participant_id_is_rejected(clients):
    assert mk(clients["admin"], participantEmployeeIds=[999999]).status_code == 400


def test_participant_sees_an_otherwise_personal_event(app, clients):
    emp = _employee("Sam", "Cruz")
    # A user linked to that employee — this is who "sees" it.
    make_user("dispatcher", username="sam_portal", employee_id=emp.id)
    part_client = app.test_client()
    from conftest import login
    login(part_client, "sam_portal")

    created = mk(clients["admin"], eventDate="2026-08-12",
                 participantEmployeeIds=[emp.id]).get_json()

    # The owner's personal event is invisible to a non-participant…
    hr_ids = [e["sourceId"] for e in _manual(clients["hr"])]
    assert created["id"] not in hr_ids
    # …but the participant sees it.
    seen = [e["sourceId"] for e in _manual(part_client)]
    assert created["id"] in seen


def _manual(client, start="2026-08-01", end="2026-08-31"):
    resp = client.get(f"/api/calendar-events?start={start}&end={end}")
    assert resp.status_code == 200
    return [{"sourceId": e["id"], **e} for e in resp.get_json()]


def test_editing_participants_replaces_the_set(clients):
    a, b = _employee("A", "One"), _employee("B", "Two")
    event = mk(clients["admin"], participantEmployeeIds=[a.id]).get_json()
    resp = clients["admin"].patch(f"/api/calendar-events/{event['id']}",
                                  json={"participantEmployeeIds": [b.id]})
    assert resp.status_code == 200
    assert [p["employeeId"] for p in resp.get_json()["participants"]] == [b.id]


# ── Invite notifications ─────────────────────────────────────────────────────

def test_adding_a_participant_notifies_their_linked_user(app, clients):
    emp = _employee("Dana", "Lee")
    user = make_user("hr", username="dana_portal", employee_id=emp.id)

    mk(clients["admin"], participantEmployeeIds=[emp.id])

    invites = (
        db.session.query(UserNotification)
        .join(NotificationEvent, UserNotification.event_id == NotificationEvent.id)
        .filter(UserNotification.user_id == user.id,
                NotificationEvent.type == "event_invite")
        .all()
    )
    assert len(invites) == 1


def test_owner_is_not_invited_to_their_own_event(app, users, clients):
    # The admin owner is linked to an employee, then adds themself + another.
    owner_emp = _employee("Owner", "Self")
    users["admin"].employee_id = owner_emp.id
    db.session.commit()
    other = _employee("Other", "Guy")

    mk(clients["admin"], participantEmployeeIds=[owner_emp.id, other.id])

    self_invites = (
        db.session.query(UserNotification)
        .join(NotificationEvent, UserNotification.event_id == NotificationEvent.id)
        .filter(UserNotification.user_id == users["admin"].id,
                NotificationEvent.type == "event_invite")
        .count()
    )
    assert self_invites == 0


# ── Reminder scan ────────────────────────────────────────────────────────────

class _FrozenNow(real_datetime):
    """datetime with now() pinned to a fixed instant; strptime/replace inherited."""
    _pinned = real_datetime(2026, 8, 1, 9, 0, 0)

    @classmethod
    def now(cls, tz=None):
        return cls._pinned


def test_reminder_fires_for_owner_and_participants(app, clients, monkeypatch):
    import notification_utils as nu

    emp = _employee("Rae", "Ng")
    part_user = make_user("dispatcher", username="rae_portal", employee_id=emp.id)
    owner = make_user("supervisor", username="event_owner")
    owner_client = app.test_client()
    from conftest import login
    login(owner_client, "event_owner")

    # A timed event 5 minutes after the frozen "now", with a 10-minute reminder:
    # trigger 08:55 ≤ 09:00 < 09:05, so it is inside the window.
    owner_client.post("/api/calendar-events", json={
        "title": "Briefing", "eventDate": "2026-08-01", "allDay": False,
        "startTime": "09:05", "reminderMinutes": 10,
        "participantEmployeeIds": [emp.id],
    })

    monkeypatch.setattr(nu, "datetime", _FrozenNow)
    nu._last_temporal_check_at = 0.0  # defeat the cross-test throttle
    nu.run_temporal_checks()

    for uid in (owner.id, part_user.id):
        got = (
            db.session.query(UserNotification)
            .join(NotificationEvent, UserNotification.event_id == NotificationEvent.id)
            .filter(UserNotification.user_id == uid,
                    NotificationEvent.type == "event_reminder")
            .count()
        )
        assert got == 1, f"user {uid} should have exactly one reminder"


def test_reminder_does_not_fire_outside_the_window(app, clients, monkeypatch):
    import notification_utils as nu

    make_user("supervisor", username="owner2")
    owner_client = app.test_client()
    from conftest import login
    login(owner_client, "owner2")

    # Starts at 15:00 — well past the 10-minute lead from the frozen 09:00 now.
    owner_client.post("/api/calendar-events", json={
        "title": "Afternoon", "eventDate": "2026-08-01", "allDay": False,
        "startTime": "15:00", "reminderMinutes": 10,
    })

    monkeypatch.setattr(nu, "datetime", _FrozenNow)
    nu._last_temporal_check_at = 0.0
    nu.run_temporal_checks()

    fired = db.session.query(NotificationEvent).filter_by(type="event_reminder").count()
    assert fired == 0


# ── Performance regression: the event list must not be a nested N+1 ──────────

def test_event_list_query_count_is_bounded_not_per_event(clients):
    """CalendarEvent.to_dict() serializes every participant (name via the linked
    Employee), so listing a month eager-loads participants + their employees in a
    constant few queries. Before that fix each event lazily loaded its
    participants, and each participant its employee — a nested N+1 that grew with
    the calendar. This guards it: adding 8 more events must not add ~8 queries."""
    from contextlib import contextmanager
    from sqlalchemy import event as sa_event

    @contextmanager
    def count_selects():
        seen = {"n": 0}
        engine = db.engine

        def _cb(conn, cursor, statement, params, context, executemany):
            if statement.lstrip()[:6].upper() == "SELECT":
                seen["n"] += 1

        sa_event.listen(engine, "before_cursor_execute", _cb)
        try:
            yield seen
        finally:
            sa_event.remove(engine, "before_cursor_execute", _cb)

    admin = clients["admin"]
    emps = [_employee(f"P{i}", "R") for i in range(4)]
    ids = [e.id for e in emps]

    def make_event(n):
        assert mk(admin, title=f"Ev{n}", eventDate="2026-08-10", visibility="company",
                  participantEmployeeIds=ids[: (n % 3) + 1]).status_code == 201

    for i in range(2):
        make_event(i)
    with count_selects() as base:
        assert admin.get("/api/calendar-events?start=2026-08-01&end=2026-08-31").status_code == 200

    for i in range(8):
        make_event(100 + i)
    with count_selects() as grown:
        assert admin.get("/api/calendar-events?start=2026-08-01&end=2026-08-31").status_code == 200

    assert grown["n"] - base["n"] <= 3, (
        f"event list scales per-event ({base['n']} -> {grown['n']} SELECTs for +8 "
        "events): the participant/employee N+1 eager-load regressed"
    )
