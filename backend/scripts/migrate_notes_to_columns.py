"""
One-time data migration: extract structured fields embedded in Call.notes
into their proper columns (caller_phone, caller_note, dispatcher_name).

Run from backend/ directory:
    python scripts/migrate_notes_to_columns.py

Safe to run multiple times — only updates records where notes contain
legacy structured lines AND the proper column is currently empty.
"""

import re
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app import app
from models import db, Call


# Lines that were embedded as "Key: value" in notes for old records
STRUCTURED_PREFIXES = [
    "Dispatcher:",
    "Phone:",
    "DOB:",
    "Caller note:",
    "Patient:",
    "Linked Patient",
    "Pickup Time:",
    "Appointment Time:",
    "Call Quality",
    "Missing",
    "Return leg",
    "Emergency service",
]


def extract_from_notes(notes):
    """Extract legacy key-value lines from notes text.
    Returns (dispatcher, phone, caller_note, clean_notes).
    """
    if not notes:
        return None, None, None, notes

    lines = notes.split("\n")
    dispatcher = None
    phone = None
    caller_note = None
    clean = []

    for line in lines:
        stripped = line.strip()
        if stripped.startswith("Dispatcher:"):
            dispatcher = stripped[len("Dispatcher:"):].strip() or None
        elif stripped.startswith("Phone:"):
            phone = stripped[len("Phone:"):].strip() or None
        elif stripped.startswith("Caller note:"):
            caller_note = stripped[len("Caller note:"):].strip() or None
        elif any(stripped.startswith(p) for p in STRUCTURED_PREFIXES):
            pass  # skip other legacy structured lines
        else:
            clean.append(line)

    clean_notes = "\n".join(clean).strip() or None
    return dispatcher, phone, caller_note, clean_notes


def run():
    with app.app_context():
        calls = Call.query.all()
        updated = 0

        for call in calls:
            if not call.notes:
                continue

            # Only process if notes look like they contain legacy structured data
            has_legacy = any(
                (call.notes or "").find(p) >= 0
                for p in ["Dispatcher:", "Phone:", "Caller note:", "DOB:"]
            )
            if not has_legacy:
                continue

            dispatcher, phone, caller_note, clean_notes = extract_from_notes(call.notes)

            changed = False

            if dispatcher and not call.dispatcher_name:
                call.dispatcher_name = dispatcher
                changed = True

            if phone and not call.caller_phone:
                call.caller_phone = phone
                changed = True

            if caller_note and not call.caller_note:
                call.caller_note = caller_note
                changed = True

            if clean_notes != call.notes:
                call.notes = clean_notes
                changed = True

            if changed:
                updated += 1

        db.session.commit()
        print(f"Migration complete. Updated {updated} call records out of {len(calls)} total.")


if __name__ == "__main__":
    run()
