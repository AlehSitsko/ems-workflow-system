"""Repeat-a-call (5.4) and the append-only call communication log (5.5)."""

from datetime import datetime

from models import db, Call


def _mk_call(**kw):
    defaults = dict(
        trip_date="2026-05-01", status="completed", service_level="BLS",
        call_type="scheduled", pickup_time="09:00",
        pickup_address="1 A St", dropoff_address="2 B St",
        dispatcher_name="Dana", caller_phone="+1 555 0100", caller_note="ring bell",
    )
    defaults.update(kw)
    c = Call(**defaults)
    db.session.add(c)
    db.session.commit()
    return c


# ── Repeat ────────────────────────────────────────────────────────────────────

def test_repeat_creates_a_new_call_for_today(clients):
    src = _mk_call()
    r = clients["dispatcher"].post(f"/api/calls/{src.id}/repeat")
    assert r.status_code == 201
    body = r.get_json()
    today = datetime.now().strftime("%Y-%m-%d")
    assert body["id"] != src.id
    assert body["trip_date"] == today
    assert body["status"] == "new"
    assert body["service_level"] == "BLS"
    assert body["pickup_address"] == "1 A St"
    assert body["dropoff_address"] == "2 B St"
    assert body["caller_phone"] == "+1 555 0100"   # caller contact carried over
    # the source is untouched
    assert db.session.get(Call, src.id).status == "completed"


def test_repeat_requires_dispatch_access(clients):
    src = _mk_call()
    assert clients["hr"].post(f"/api/calls/{src.id}/repeat").status_code == 403


def test_repeat_404_for_missing_call(clients):
    assert clients["dispatcher"].post("/api/calls/999999/repeat").status_code == 404


# ── Communication log ─────────────────────────────────────────────────────────

def test_call_notes_are_append_only_and_ordered(clients):
    c = _mk_call()
    assert clients["dispatcher"].get(f"/api/calls/{c.id}/notes").get_json() == []

    assert clients["dispatcher"].post(
        f"/api/calls/{c.id}/notes", json={"content": "Called facility"}).status_code == 201
    assert clients["supervisor"].post(
        f"/api/calls/{c.id}/notes", json={"content": "Confirmed 2pm"}).status_code == 201

    notes = clients["dispatcher"].get(f"/api/calls/{c.id}/notes").get_json()
    assert [n["content"] for n in notes] == ["Called facility", "Confirmed 2pm"]
    assert notes[0]["userName"]  # the author is recorded
    # append-only: there is no edit/delete route
    assert clients["dispatcher"].put(
        f"/api/calls/{c.id}/notes/{notes[0]['id']}").status_code in (404, 405)


def test_call_note_content_required(clients):
    c = _mk_call()
    assert clients["dispatcher"].post(
        f"/api/calls/{c.id}/notes", json={"content": "  "}).status_code == 400


def test_call_notes_require_dispatch_access(clients):
    c = _mk_call()
    assert clients["hr"].get(f"/api/calls/{c.id}/notes").status_code == 403
