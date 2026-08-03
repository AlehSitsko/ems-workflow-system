"""Capability-aware suitability (utils/capability_match.py).

Pure logic — exercised with lightweight stand-ins for a unit (its vehicle's
capabilities) and a call (its service level), so no DB or app context is needed.
"""

import pytest

from utils.capability_match import (
    unit_capabilities, required_capability, unit_can_serve, assignment_mismatch,
)


class FakeVehicle:
    def __init__(self, caps):
        self._caps = caps

    def parsed_capabilities(self):
        return self._caps


class FakeUnit:
    def __init__(self, caps=None, unit_type=None):
        self.vehicle = FakeVehicle(caps) if caps is not None else None
        self.unit_type = unit_type


class FakeCall:
    def __init__(self, service_level):
        self.service_level = service_level


# ── unit_capabilities: vehicle first, unit_type fallback, canonicalised ───────

def test_capabilities_come_from_the_vehicle():
    assert unit_capabilities(FakeUnit(caps=["ALS", "BLS"])) == ["ALS", "BLS"]


def test_capabilities_fall_back_to_unit_type_without_a_vehicle():
    assert unit_capabilities(FakeUnit(unit_type="BLS")) == ["BLS"]


def test_capabilities_are_canonicalised():
    assert unit_capabilities(FakeUnit(caps=["bls", "bari"])) == ["BLS", "Bariatric"]


# ── required_capability ──────────────────────────────────────────────────────

@pytest.mark.parametrize("level, expected", [
    ("ALS", "ALS"), ("bls", "BLS"), ("Bariatric", "Bariatric"),
    ("emergency", None), ("", None), (None, None),
])
def test_required_capability(level, expected):
    assert required_capability(FakeCall(level)) == expected


# ── Tiered care ──────────────────────────────────────────────────────────────

def test_higher_tier_serves_a_lower_call():
    assert unit_can_serve(["ALS"], "BLS") is True        # ALS covers BLS
    assert unit_can_serve(["CCT"], "ALS") is True        # CCT covers ALS
    assert unit_can_serve(["CCT"], "BLS") is True


def test_lower_tier_cannot_serve_a_higher_call():
    assert unit_can_serve(["BLS"], "ALS") is False
    assert unit_can_serve(["ALS"], "CCT") is False


def test_bls_variants_count_as_bls():
    assert unit_can_serve(["ALS"], "BLS-6") is True       # BLS-6 is a BLS tier
    assert unit_can_serve(["BLS-4"], "BLS") is True


# ── Exact specials ───────────────────────────────────────────────────────────

def test_special_requires_that_exact_capability():
    assert unit_can_serve(["ALS", "BLS"], "Bariatric") is False   # care level ≠ special
    assert unit_can_serve(["ALS", "Bariatric"], "Bariatric") is True


def test_no_requirement_always_serves():
    assert unit_can_serve([], None) is True


# ── assignment_mismatch (the reason strings) ─────────────────────────────────

def test_mismatch_reports_a_care_tier_shortfall():
    msg = assignment_mismatch(FakeUnit(caps=["BLS"]), FakeCall("ALS"))
    assert msg and "ALS call" in msg


def test_mismatch_reports_a_missing_special():
    msg = assignment_mismatch(FakeUnit(caps=["ALS", "BLS"]), FakeCall("Bariatric"))
    assert msg == "vehicle is not Bariatric-capable"


def test_no_mismatch_when_suitable():
    assert assignment_mismatch(FakeUnit(caps=["ALS", "BLS"]), FakeCall("BLS")) is None
    assert assignment_mismatch(FakeUnit(caps=["BLS"]), FakeCall("emergency")) is None


def test_legacy_unit_without_a_vehicle_uses_its_type():
    assert assignment_mismatch(FakeUnit(unit_type="ALS"), FakeCall("BLS")) is None
    assert assignment_mismatch(FakeUnit(unit_type="BLS"), FakeCall("ALS")) is not None
