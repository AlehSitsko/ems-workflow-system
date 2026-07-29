"""ICS export of manual calendar events — /api/calendar-events/export.ics.

A one-way snapshot the user can import into Google/Outlook. These pin the file's
shape, the all-day vs timed encoding, text escaping, and that it respects the
same visibility rule as the calendar.
"""

import pytest


def mk(client, **fields):
    body = {"title": "Standup", "eventDate": "2026-08-10", "visibility": "personal"}
    body.update(fields)
    return client.post("/api/calendar-events", json=body)


def export(client, start="2026-08-01", end="2026-08-31"):
    return client.get(f"/api/calendar-events/export.ics?start={start}&end={end}")


def test_export_is_a_calendar_file_with_a_download_name(clients):
    mk(clients["admin"], title="Board meeting", visibility="company")
    resp = export(clients["admin"])
    assert resp.status_code == 200
    assert resp.mimetype == "text/calendar"
    assert "attachment" in resp.headers["Content-Disposition"]
    assert "ems-calendar_2026-08-01_2026-08-31.ics" in resp.headers["Content-Disposition"]

    body = resp.get_data(as_text=True)
    assert body.startswith("BEGIN:VCALENDAR")
    assert "VERSION:2.0" in body
    assert body.strip().endswith("END:VCALENDAR")
    assert "SUMMARY:Board meeting" in body


def test_all_day_event_uses_date_values_with_exclusive_end(clients):
    mk(clients["admin"], title="Holiday", eventDate="2026-08-15", allDay=True, visibility="company")
    body = export(clients["admin"]).get_data(as_text=True)
    assert "DTSTART;VALUE=DATE:20260815" in body
    assert "DTEND;VALUE=DATE:20260816" in body  # end is the next day, exclusive


def test_timed_event_uses_datetime_values(clients):
    mk(clients["admin"], title="Sync", eventDate="2026-08-12",
       allDay=False, startTime="09:30", endTime="10:15", visibility="company")
    body = export(clients["admin"]).get_data(as_text=True)
    assert "DTSTART:20260812T093000" in body
    assert "DTEND:20260812T101500" in body


def test_special_characters_are_escaped(clients):
    mk(clients["admin"], title="Lunch, then review; notes",
       description="Line one\nline two", visibility="company")
    body = export(clients["admin"]).get_data(as_text=True)
    assert "SUMMARY:Lunch\\, then review\\; notes" in body
    assert "DESCRIPTION:Line one\\nline two" in body


def test_export_respects_visibility(clients):
    # A personal event of the dispatcher must not leak into HR's export.
    mk(clients["dispatcher"], title="Dentist", visibility="personal")
    assert "Dentist" in export(clients["dispatcher"]).get_data(as_text=True)
    assert "Dentist" not in export(clients["hr"]).get_data(as_text=True)


def test_empty_range_is_a_valid_empty_calendar(clients):
    body = export(clients["admin"], start="2027-01-01", end="2027-01-31").get_data(as_text=True)
    assert "BEGIN:VCALENDAR" in body and "END:VCALENDAR" in body
    assert "BEGIN:VEVENT" not in body


def test_bad_range_is_rejected(clients):
    assert export(clients["admin"], start="nope").status_code == 400
    assert export(clients["admin"], start="2026-09-01", end="2026-08-01").status_code == 400


def test_export_requires_a_session(anon):
    assert anon.get("/api/calendar-events/export.ics?start=2026-08-01&end=2026-08-31").status_code == 401
