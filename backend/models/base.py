"""Shared SQLAlchemy base: the db instance and the small pure helpers the
model modules build on. Split out of the former monolithic models.py."""

from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


def dob_month_day(dob):
    """"YYYY-MM-DD" -> "MM-DD" for the birthday calendar; None for empty / ciphertext /
    malformed. Non-identifying: it carries the birthday month+day but not the year (the
    identifying part), which stays encrypted. See docs/design/DOB_LASTNAME_ENCRYPTION.md."""
    from core.security.crypto import is_ciphertext
    if not dob or is_ciphertext(dob):
        return None
    parts = dob.split("-")
    if len(parts) == 3 and len(parts[1]) == 2 and len(parts[2]) == 2:
        return f"{parts[1]}-{parts[2]}"
    return None
