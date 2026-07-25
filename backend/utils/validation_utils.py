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


# Minimum password policy for staff accounts. Enforced on the user-management
# routes only — never on login, so existing (and demo) accounts keep working,
# and never on the demo seed, which writes the hash directly. Rotation and expiry
# are separate, deferred items (see docs/PRODUCTION_READINESS.md).
PASSWORD_MIN_LENGTH = 10


def validate_password_strength(password, username=""):
    """Return an error string if the password is too weak, else None.

    A deliberately modest baseline — long enough to resist casual guessing, mixed
    enough to rule out a single dictionary word or all-digits, and not the
    username itself. It is not a substitute for rate limiting (which the login
    route already has) or for a breach-corpus check (a deployment concern).
    """
    if not password or len(password) < PASSWORD_MIN_LENGTH:
        return f"Password must be at least {PASSWORD_MIN_LENGTH} characters"
    if not any(c.isalpha() for c in password):
        return "Password must contain at least one letter"
    if not any(c.isdigit() for c in password):
        return "Password must contain at least one number"
    if username and password.strip().lower() == username.strip().lower():
        return "Password must not be the same as the username"
    return None
