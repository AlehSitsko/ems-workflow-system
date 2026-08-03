"""Can a crew unit serve a call? — capability-aware assignment suitability.

The Vehicle records what it can actually do (`Vehicle.capabilities`); this decides
whether a unit's vehicle meets what a call needs, so dispatch and the calendar can
flag a mismatch instead of relying on the shift's single headline `unit_type`.

The model (agreed):
  * Care levels are tiered — CCT covers ALS covers BLS. A higher-tier vehicle can
    serve a lower-tier call. `BLS-4` / `BLS-6` are BLS crews for tiering.
  * Bariatric / Stretcher / Wheelchair are *exact* requirements — a call that needs
    one needs a vehicle that has it, whatever the care tier.

Advisory only: nothing here blocks an assignment; a mismatch is a warning.
"""

from utils.taxonomy import normalize_service_level, normalize_vehicle_capability


# Care tiers — a vehicle serves a call when it has some capability at or above the
# call's required tier.
CARE_TIER = {"BLS": 1, "BLS-4": 1, "BLS-6": 1, "ALS": 2, "CCT": 3}

# Exact-match requirements — no substitution across these.
SPECIALS = {"Bariatric", "Stretcher", "Wheelchair"}


def unit_capabilities(unit):
    """The capabilities a unit can actually offer: its linked vehicle's, or — for a
    legacy shift with no vehicle — its headline `unit_type`. Canonicalised, so a
    stray casing/alias never reads as a mismatch."""
    vehicle = getattr(unit, "vehicle", None)
    raw = vehicle.parsed_capabilities() if vehicle else [getattr(unit, "unit_type", None)]
    out = []
    for value in raw:
        canonical = normalize_vehicle_capability(value)
        if canonical:
            out.append(canonical)
    return out


def required_capability(call):
    """What the call demands, from its service level — or None when it asks for
    nothing specific (unspecified, or a non-level like `emergency`)."""
    return normalize_service_level(getattr(call, "service_level", None))


def unit_can_serve(caps, required):
    """True when a unit offering `caps` can serve a call requiring `required`."""
    if not required:
        return True
    if required in SPECIALS:
        return required in caps
    need = CARE_TIER.get(required)
    if need is None:
        # A required capability outside the tiered set and not a known special:
        # treat as an exact requirement rather than silently passing it.
        return required in caps
    return any(CARE_TIER.get(cap, 0) >= need for cap in caps)


def assignment_mismatch(unit, call):
    """None when the unit's vehicle can serve the call, else a short reason for the
    warning ('BLS unit for an ALS call', 'vehicle is not Bariatric-capable')."""
    required = required_capability(call)
    if not required:
        return None
    caps = unit_capabilities(unit)
    if unit_can_serve(caps, required):
        return None
    if required in SPECIALS:
        return f"vehicle is not {required}-capable"
    have = "/".join(caps) if caps else "unspecified"
    return f"{have} unit for a{'n' if required[0] in 'AEIOU' else ''} {required} call"
