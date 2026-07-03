import re
from datetime import date

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


def check_length(value, max_len, field_name):
    """Raise ValueError if a string field exceeds max_len characters."""
    if value and len(str(value)) > max_len:
        raise ValueError(f"{field_name} must be {max_len} characters or fewer")


def is_valid_date(value):
    """True if value is a real calendar date in YYYY-MM-DD form."""
    if not value or not _DATE_RE.match(value):
        return False
    try:
        date.fromisoformat(value)
        return True
    except ValueError:
        return False


def is_valid_time(value):
    """True if value is HH:MM on a 24-hour clock (00:00–23:59)."""
    return bool(value and _TIME_RE.match(value))
