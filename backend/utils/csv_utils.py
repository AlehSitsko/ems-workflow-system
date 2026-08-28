"""CSV export hardening — neutralize spreadsheet formula injection.

User-controlled free text (names, addresses, notes) can reach a CSV export. A cell
whose (possibly whitespace-prefixed) text begins with a formula trigger — ``= + - @``
— or with a leading tab / CR / LF is interpreted as a formula by Excel / Google
Sheets (e.g. a name ``=HYPERLINK("http://evil","click")`` or ``=cmd|...``), so it
must be neutralized. The OWASP-aligned mitigation is to prefix such a cell with a
single quote so the spreadsheet treats it as literal text.

Policy (documented for review):
- ``=SUM(A1)``, ``+…``, ``-…``, ``@…``           -> prefixed (formula triggers)
- ``" =SUM(A1)"`` (leading spaces before a trigger) -> prefixed (Excel strips the
  spaces and would evaluate it)
- ``"\\t=…"`` / ``"\\r=…"`` / ``"\\n=…"`` (leading control char) -> prefixed
- ``None`` / ``int`` / ``float`` / date objects (non-strings) -> unchanged
- ``""`` (empty) and ordinary text / ``"123 Main St"`` / ``"O'Brien"``  -> unchanged

Numeric and date columns are backend-generated and are NOT routed through this guard,
so real numbers, negative amounts and identifiers are never altered.
"""

_TRIGGERS = ("=", "+", "-", "@")
_LEADING_CONTROL = ("\t", "\r", "\n")


def csv_safe(value):
    """Return `value` with a leading `'` if it is a string that would be parsed as a
    formula (a trigger char first, possibly after leading spaces, or a leading control
    character); otherwise unchanged. Non-strings pass straight through."""
    if not isinstance(value, str) or value == "":
        return value
    if value[0] in _LEADING_CONTROL:
        return "'" + value
    stripped = value.lstrip(" ")
    if stripped and stripped[0] in _TRIGGERS:
        return "'" + value
    return value


def csv_safe_row(values):
    """Apply csv_safe to every cell of a row — the single guard used by every CSV
    export so no user-controlled string can slip through unprotected."""
    return [csv_safe(v) for v in values]
