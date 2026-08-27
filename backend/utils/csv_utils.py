"""CSV export hardening — neutralize spreadsheet formula injection.

User-controlled free text (names, addresses, notes) can reach a CSV export. A cell
whose text begins with a formula trigger (``=`` ``+`` ``-`` ``@`` or a leading tab /
carriage return) is interpreted as a formula by Excel/Sheets — e.g. a patient named
``=HYPERLINK("http://evil","click")`` or ``=cmd|...`` — so it must be neutralized.
The standard OWASP mitigation is to prefix such a cell with a single quote so the
spreadsheet treats it as literal text. Applied only to the free-text fields; numeric
and date columns are backend-generated and not attacker-controlled.
"""

_TRIGGERS = ("=", "+", "-", "@", "\t", "\r")


def csv_safe(value):
    """Return `value` with a leading `'` if it is a string that starts with a
    formula trigger; otherwise unchanged (non-strings pass straight through)."""
    if isinstance(value, str) and value and value[0] in _TRIGGERS:
        return "'" + value
    return value
