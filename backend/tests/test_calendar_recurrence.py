"""Recurring manual calendar events — CRUD validation, expansion in the calendar
aggregator, and RRULE in the ICS export. The occurrence maths itself is pinned in
test_event_recurrence.py; this checks the wiring end to end.
"""



def mk(client, **fields):
    body = {"title": "Standup", "eventDate": "2026-08-03", "visibility": "company"}
    body.update(fields)
    return client.post("/api/calendar-events", json=body)


def calendar_events(client, start="2026-08-01", end="2026-08-31"):
    resp = client.get(f"/api/calendar/events?start={start}&end={end}")
    return [e for e in resp.get_json()["events"] if e["type"] == "calendar_event"]


# ── CRUD validation ──────────────────────────────────────────────────────────

def test_recurrence_round_trips(clients):
    body = mk(clients["admin"], recurrence="weekly", recurrenceUntil="2026-09-30").get_json()
    assert body["recurrence"] == "weekly"
    assert body["recurrenceUntil"] == "2026-09-30"


def test_invalid_recurrence_is_rejected(clients):
    assert mk(clients["admin"], recurrence="fortnightly").status_code == 400


def test_invalid_until_is_rejected(clients):
    assert mk(clients["admin"], recurrence="weekly", recurrenceUntil="2026-13-40").status_code == 400


def test_none_recurrence_drops_any_until(clients):
    body = mk(clients["admin"], recurrence="none", recurrenceUntil="2026-09-30").get_json()
    assert body["recurrence"] == "none"
    assert body["recurrenceUntil"] == ""


# ── Aggregator expansion ─────────────────────────────────────────────────────

def test_a_weekly_event_expands_into_occurrences(clients):
    mk(clients["admin"], title="Weekly sync", eventDate="2026-08-03", recurrence="weekly")
    events = [e for e in calendar_events(clients["admin"]) if e["title"] == "Weekly sync"]
    dates = sorted(e["date"] for e in events)
    assert dates == ["2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24", "2026-08-31"]
    # Every occurrence points back at the one row, and is flagged recurring.
    assert {e["sourceId"] for e in events} == {events[0]["sourceId"]}
    assert all(e["metadata"]["isRecurring"] for e in events)
    # Occurrence ids are unique so the calendar can key them.
    assert len({e["id"] for e in events}) == len(events)


def test_recurrence_until_caps_expansion(clients):
    mk(clients["admin"], title="Capped", eventDate="2026-08-03", recurrence="weekly",
       recurrenceUntil="2026-08-17")
    dates = sorted(e["date"] for e in calendar_events(clients["admin"]) if e["title"] == "Capped")
    assert dates == ["2026-08-03", "2026-08-10", "2026-08-17"]


def test_a_recurring_event_before_the_window_still_shows_inside_it(clients):
    # Base in July, window in August: the series must still surface.
    mk(clients["admin"], title="Ongoing", eventDate="2026-07-06", recurrence="weekly")
    dates = sorted(e["date"] for e in calendar_events(clients["admin"]) if e["title"] == "Ongoing")
    assert dates and dates[0] >= "2026-08-01" and dates[-1] <= "2026-08-31"


def test_a_one_off_still_shows_once(clients):
    mk(clients["admin"], title="Once", eventDate="2026-08-12", recurrence="none")
    dates = [e["date"] for e in calendar_events(clients["admin"]) if e["title"] == "Once"]
    assert dates == ["2026-08-12"]


# ── ICS RRULE ────────────────────────────────────────────────────────────────

def test_ics_emits_an_rrule_for_a_recurring_event(clients):
    mk(clients["admin"], title="Repeat", eventDate="2026-08-03", allDay=True,
       recurrence="weekly", recurrenceUntil="2026-08-31")
    body = clients["admin"].get(
        "/api/calendar-events/export.ics?start=2026-08-01&end=2026-08-31"
    ).get_data(as_text=True)
    assert "RRULE:FREQ=WEEKLY;UNTIL=20260831" in body


def test_ics_has_no_rrule_for_a_one_off(clients):
    mk(clients["admin"], title="Single", eventDate="2026-08-03", recurrence="none")
    body = clients["admin"].get(
        "/api/calendar-events/export.ics?start=2026-08-01&end=2026-08-31"
    ).get_data(as_text=True)
    assert "RRULE" not in body
