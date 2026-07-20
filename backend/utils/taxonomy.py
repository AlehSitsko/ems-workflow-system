"""Canonical operational taxonomy — the single source of truth for the strings
that classify employees, vehicles, daily units, patients and calls.

Before this module the same vocabulary was re-declared as ad-hoc arrays in half a
dozen components, which is how the database ended up holding `bls` and `BLS`,
`BARI` and `Bariatric`, and `emergency` stored as a *service level* (it is a call
type, not a level of care).

Contract: **this module is authoritative.** `frontend/src/utils/taxonomy.js`
mirrors it for display, and `GET /api/taxonomy` publishes it so the contract is
discoverable and testable rather than duplicated by hand.

Four vocabularies that are deliberately *not* the same thing:

  * `SERVICE_LEVELS`  — level of care/transport required. Used by BOTH
    `Patient.default_service_level` (a default/preference only) and
    `Call.service_level` (the actual requirement of that one trip).
  * `UNIT_TYPES`      — how a crew unit is deployed for a day (DailyCrewUnit).
  * `VEHICLE_CAPABILITIES` — what a physical vehicle can do. A vehicle may have
    several; the single `Vehicle.unit_type` column is a legacy narrowing that
    Fleet Management (roadmap Phase 4c) replaces with real capabilities.
  * `QUALIFICATIONS`  — what an employee is qualified to do. This is NOT the role
    they work on a given shift: a Paramedic may be rostered as Driver. The shift
    role comes from the DailyCrewUnit slot (see `SHIFT_ROLES`).

Normalizers return the canonical value, or `None` for anything unrecognised.
Unknown values are never silently rewritten or dropped — callers surface them as
"unknown" so bad data stays visible instead of being laundered.
"""

# ── Vocabularies ────────────────────────────────────────────────────────────

SERVICE_LEVELS = ["BLS", "ALS", "BLS-4", "BLS-6", "CCT", "Bariatric", "Stretcher", "Wheelchair"]

UNIT_TYPES = ["BLS", "ALS", "BLS-4", "BLS-6", "CCT", "Bariatric", "Assist"]

VEHICLE_CAPABILITIES = ["BLS", "ALS", "CCT", "Bariatric", "Stretcher", "Wheelchair", "Assist"]

# Employee qualification — what they are certified/permitted to do.
QUALIFICATIONS = ["driver_only", "emt", "paramedic", "assist"]

QUALIFICATION_LABELS = {
    "driver_only": "Driver-only",
    "emt": "EMT",
    "paramedic": "Paramedic",
    "assist": "Assist",
}

# Role an employee works on a specific shift — derived from the DailyCrewUnit
# slot they occupy, never from their qualification.
SHIFT_ROLES = ["driver", "medical", "assist"]

SHIFT_ROLE_LABELS = {"driver": "Driver", "medical": "Medical", "assist": "Assist"}

# DailyCrewUnit crew slot → shift role.
SLOT_TO_SHIFT_ROLE = {
    "driver_id": "driver",
    "medical_id": "medical",
    "assist1_id": "assist",
    "assist2_id": "assist",
}

# `emergency` is a call type / priority, never a level of care. It is listed here
# so the normalizer can reject it deliberately rather than by accident.
NOT_SERVICE_LEVELS = {"emergency", "none"}


# ── Employee leave / absence (roadmap Phase 4d) ─────────────────────────────

LEAVE_TYPES = [
    "vacation", "sick", "unpaid", "personal", "medical",
    "bereavement", "training", "administrative", "other",
]

LEAVE_TYPE_LABELS = {
    "vacation": "Vacation / PTO",
    "sick": "Sick",
    "unpaid": "Unpaid",
    "personal": "Personal",
    "medical": "Medical",
    "bereavement": "Bereavement",
    "training": "Training",
    "administrative": "Administrative",
    "other": "Other",
}

# Types that reveal something about a person's health or a death in the family.
# Scheduling only ever needs to know that someone is unavailable, so for roles
# without HR permission these are reported as plain "Unavailable" — the
# distinction is enforced when the payload is built, not left to the UI.
SENSITIVE_LEAVE_TYPES = {"sick", "medical", "bereavement"}

LEAVE_STATUSES = ["draft", "pending", "approved", "denied", "cancelled"]

LEAVE_STATUS_LABELS = {
    "draft": "Draft",
    "pending": "Pending",
    "approved": "Approved",
    "denied": "Denied",
    "cancelled": "Cancelled",
}

# Statuses that actually make someone unavailable. Denied and cancelled leave has
# no effect on staffing; a draft is not a request yet.
BLOCKING_LEAVE_STATUSES = {"approved"}
WARNING_LEAVE_STATUSES = {"pending"}


# ── Confirmation calls (roadmap Phase 4) ────────────────────────────────────
#
# Dispatchers ring patients the day before to confirm tomorrow's trips. Four
# states rather than a yes/no flag: "nobody answered" and "not called yet" look
# identical on a board but mean opposite things to the person working the list.

CONFIRMATION_STATUSES = ["not_called", "no_answer", "confirmed", "declined"]

CONFIRMATION_STATUS_LABELS = {
    "not_called": "Not called",
    "no_answer": "No answer",
    "confirmed": "Confirmed",
    "declined": "Declined",
}

# A declined trip is not happening, so it cancels the call outright rather than
# sitting on the board as a confirmed-looking job nobody will run.
CANCELLING_CONFIRMATION_STATUSES = {"declined"}


def _alias_key(value):
    """Lowercase, trimmed, separators stripped: 'BLS-4' / 'bls 4' / 'BLS4' all match."""
    return "".join(ch for ch in str(value or "").strip().lower() if ch.isalnum())


def _build_alias_map(canonical_values, extra_aliases=None):
    """Map every canonical value to itself by its alias key, plus extra aliases."""
    mapping = {_alias_key(v): v for v in canonical_values}
    mapping.update(extra_aliases or {})
    return mapping


_SERVICE_LEVEL_ALIASES = _build_alias_map(SERVICE_LEVELS, {
    "bari": "Bariatric",
    "bariatric": "Bariatric",
    "wc": "Wheelchair",
    "wheel": "Wheelchair",
    "strecher": "Stretcher",  # observed misspelling
})

_UNIT_TYPE_ALIASES = _build_alias_map(UNIT_TYPES, {
    "bari": "Bariatric",
    "assist": "Assist",
    "support": "Assist",
})

_VEHICLE_CAPABILITY_ALIASES = _build_alias_map(VEHICLE_CAPABILITIES, {
    "bari": "Bariatric",
    "wc": "Wheelchair",
    "support": "Assist",
})

_LEAVE_TYPE_ALIASES = _build_alias_map(LEAVE_TYPES, {
    "pto": "vacation",
    "holiday": "vacation",
    "annualleave": "vacation",
    "sickleave": "sick",
    "fmla": "medical",
    "funeral": "bereavement",
    "admin": "administrative",
})

_LEAVE_STATUS_ALIASES = _build_alias_map(LEAVE_STATUSES, {
    "rejected": "denied",
    "declined": "denied",
    "canceled": "cancelled",   # US spelling
    "submitted": "pending",
})

_CONFIRMATION_ALIASES = _build_alias_map(CONFIRMATION_STATUSES, {
    "notcalled": "not_called",
    "pending": "not_called",
    "noanswer": "no_answer",
    "unreachable": "no_answer",
    "voicemail": "no_answer",
    "ok": "confirmed",
    "refused": "declined",
    "cancelledbypatient": "declined",
})

_QUALIFICATION_ALIASES = {
    "driver": "driver_only",
    "driveronly": "driver_only",
    "emt": "emt",
    "emtb": "emt",
    "paramedic": "paramedic",
    "medic": "paramedic",
    "assist": "assist",
    "support": "assist",
}

# Administrative/organisational roles. These are NOT clinical qualifications —
# they render as a separate administrative badge.
ADMINISTRATIVE_ROLES = {"supervisor", "manager", "admin", "dispatcher", "hr"}


# ── Normalizers ─────────────────────────────────────────────────────────────

def normalize_service_level(value):
    """Canonical service level, or None if unrecognised.

    Case- and separator-insensitive ('bls' → 'BLS', 'BLS4' → 'BLS-4'). Returns
    None for `emergency` — that is a call type, not a level of care.
    """
    key = _alias_key(value)
    if not key or key in NOT_SERVICE_LEVELS:
        return None
    return _SERVICE_LEVEL_ALIASES.get(key)


def normalize_unit_type(value):
    """Canonical daily operational unit type, or None if unrecognised."""
    key = _alias_key(value)
    return _UNIT_TYPE_ALIASES.get(key) if key else None


def normalize_vehicle_capability(value):
    """Canonical vehicle capability, or None if unrecognised ('BARI' → 'Bariatric')."""
    key = _alias_key(value)
    return _VEHICLE_CAPABILITY_ALIASES.get(key) if key else None


def normalize_qualification(value):
    """Canonical employee qualification, or None.

    Administrative roles (Supervisor/Manager/Admin/…) are not qualifications and
    return None — use `is_administrative_role` for those.
    """
    key = _alias_key(value)
    if not key or key in ADMINISTRATIVE_ROLES:
        return None
    return _QUALIFICATION_ALIASES.get(key)


def normalize_leave_type(value):
    """Canonical leave type, or None if unrecognised ('PTO' → 'vacation')."""
    key = _alias_key(value)
    return _LEAVE_TYPE_ALIASES.get(key) if key else None


def normalize_leave_status(value):
    """Canonical leave status, or None if unrecognised ('rejected' → 'denied')."""
    key = _alias_key(value)
    return _LEAVE_STATUS_ALIASES.get(key) if key else None


def is_sensitive_leave_type(value):
    """True for leave types that disclose health or bereavement.

    Used to decide whether a payload may name the type at all — scheduling roles
    get "Unavailable" instead.
    """
    return normalize_leave_type(value) in SENSITIVE_LEAVE_TYPES


def normalize_confirmation_status(value):
    """Canonical confirmation status, or None if unrecognised."""
    key = _alias_key(value)
    return _CONFIRMATION_ALIASES.get(key) if key else None


def is_administrative_role(value):
    """True for organisational roles that are not clinical qualifications."""
    return _alias_key(value) in ADMINISTRATIVE_ROLES


def normalize_admin_role(value):
    """Canonical administrative role (supervisor/manager/admin/dispatcher/hr),
    or None if the value is not an administrative role."""
    key = _alias_key(value)
    return key if key in ADMINISTRATIVE_ROLES else None


# Human labels for the derived legacy `role` mirror and UI.
ADMIN_ROLE_LABELS = {
    "supervisor": "Supervisor", "manager": "Manager", "admin": "Admin",
    "dispatcher": "Dispatcher", "hr": "HR",
}


def shift_role_for_slot(slot):
    """DailyCrewUnit crew slot name → shift role ('driver_id' → 'driver')."""
    return SLOT_TO_SHIFT_ROLE.get(slot)


def canonicalize_or_keep(value, normalizer):
    """Canonical value when recognised, otherwise the original, untouched.

    New writes are cleaned up ('bls' → 'BLS'), while an unrecognised legacy value
    is preserved rather than silently rewritten or blanked — it stays visible as
    "unknown" in the UI so bad data can be found and decided on, not laundered.
    """
    if value is None:
        return None
    normalized = normalizer(value)
    return normalized if normalized is not None else value


def as_contract():
    """The published taxonomy contract (GET /api/taxonomy)."""
    return {
        "serviceLevels": SERVICE_LEVELS,
        "unitTypes": UNIT_TYPES,
        "vehicleCapabilities": VEHICLE_CAPABILITIES,
        "qualifications": [{"value": q, "label": QUALIFICATION_LABELS[q]} for q in QUALIFICATIONS],
        "shiftRoles": [{"value": r, "label": SHIFT_ROLE_LABELS[r]} for r in SHIFT_ROLES],
        "notServiceLevels": sorted(NOT_SERVICE_LEVELS),
        "leaveTypes": [
            # `sensitive` is published so the frontend can label the privacy rule
            # it is already subject to, never so it can apply the rule itself.
            {"value": t, "label": LEAVE_TYPE_LABELS[t], "sensitive": t in SENSITIVE_LEAVE_TYPES}
            for t in LEAVE_TYPES
        ],
        "leaveStatuses": [
            {"value": s, "label": LEAVE_STATUS_LABELS[s]} for s in LEAVE_STATUSES
        ],
        "confirmationStatuses": [
            {"value": c, "label": CONFIRMATION_STATUS_LABELS[c]}
            for c in CONFIRMATION_STATUSES
        ],
    }
