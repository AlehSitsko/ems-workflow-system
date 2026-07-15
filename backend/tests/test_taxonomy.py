"""Canonical operational taxonomy — normalization and the published contract.

The legacy values asserted here are the ones actually present in the dev
database (audited before writing this module), not hypothetical ones.
"""

import pytest

from utils.taxonomy import (
    SERVICE_LEVELS, UNIT_TYPES,
    normalize_service_level, normalize_unit_type, normalize_vehicle_capability,
    normalize_qualification, is_administrative_role, shift_role_for_slot,
    as_contract,
)


# ── Service level ───────────────────────────────────────────────────────────

@pytest.mark.parametrize("raw,expected", [
    ("BLS", "BLS"),
    ("bls", "BLS"),          # legacy lowercase written by the old call forms
    ("  ALS  ", "ALS"),
    ("als", "ALS"),
    ("Stretcher", "Stretcher"),
    ("stretcher", "Stretcher"),
    ("Wheelchair", "Wheelchair"),
    ("wc", "Wheelchair"),
    ("BLS-4", "BLS-4"),
    ("BLS4", "BLS-4"),       # separator-insensitive
    ("bls 4", "BLS-4"),
    ("BARI", "Bariatric"),   # legacy vehicle spelling
    ("Bariatric", "Bariatric"),
    ("cct", "CCT"),
])
def test_normalize_service_level_canonicalizes(raw, expected):
    assert normalize_service_level(raw) == expected


def test_emergency_is_not_a_service_level():
    # `emergency` is a call type/priority. The old CallDrawer offered it as a
    # service level, which is how it reached Call.service_level.
    assert normalize_service_level("emergency") is None
    assert normalize_service_level("Emergency") is None


def test_unknown_and_empty_service_levels_return_none():
    for raw in ("", "   ", None, "none", "banana"):
        assert normalize_service_level(raw) is None


def test_every_canonical_service_level_normalizes_to_itself():
    for value in SERVICE_LEVELS:
        assert normalize_service_level(value) == value


# ── Unit type ───────────────────────────────────────────────────────────────

@pytest.mark.parametrize("raw,expected", [
    ("BLS", "BLS"), ("bls", "BLS"), ("ALS", "ALS"),
    ("BLS-4", "BLS-4"), ("BLS6", "BLS-6"),
    ("ASSIST", "Assist"), ("support", "Assist"),
    ("BARI", "Bariatric"), ("cct", "CCT"),
])
def test_normalize_unit_type(raw, expected):
    assert normalize_unit_type(raw) == expected


def test_every_canonical_unit_type_normalizes_to_itself():
    for value in UNIT_TYPES:
        assert normalize_unit_type(value) == value


def test_unknown_unit_type_returns_none():
    assert normalize_unit_type("spaceship") is None
    assert normalize_unit_type("") is None


# ── Vehicle capability ──────────────────────────────────────────────────────

def test_normalize_vehicle_capability_handles_legacy_bari():
    assert normalize_vehicle_capability("BARI") == "Bariatric"
    assert normalize_vehicle_capability("ALS") == "ALS"
    assert normalize_vehicle_capability("wc") == "Wheelchair"
    assert normalize_vehicle_capability("nope") is None


# ── Qualification vs shift role (deliberately different things) ─────────────

@pytest.mark.parametrize("raw,expected", [
    ("Driver", "driver_only"),
    ("driver", "driver_only"),
    ("EMT", "emt"),
    ("Paramedic", "paramedic"),
    ("medic", "paramedic"),
    ("Assist", "assist"),
])
def test_normalize_qualification(raw, expected):
    assert normalize_qualification(raw) == expected


def test_administrative_roles_are_not_clinical_qualifications():
    # Supervisor is an administrative badge, not a qualification.
    assert normalize_qualification("Supervisor") is None
    assert is_administrative_role("Supervisor") is True
    assert is_administrative_role("admin") is True
    assert is_administrative_role("Paramedic") is False


def test_shift_role_comes_from_the_crew_slot_not_the_qualification():
    # A Paramedic rostered in the driver slot works the shift as Driver.
    assert shift_role_for_slot("driver_id") == "driver"
    assert shift_role_for_slot("medical_id") == "medical"
    assert shift_role_for_slot("assist1_id") == "assist"
    assert shift_role_for_slot("assist2_id") == "assist"
    assert shift_role_for_slot("nonsense") is None


# ── Published contract ──────────────────────────────────────────────────────

def test_contract_exposes_all_vocabularies():
    contract = as_contract()
    assert contract["serviceLevels"] == SERVICE_LEVELS
    assert contract["unitTypes"] == UNIT_TYPES
    assert "emergency" in contract["notServiceLevels"]
    assert {"value": "paramedic", "label": "Paramedic"} in contract["qualifications"]
    assert {"value": "driver", "label": "Driver"} in contract["shiftRoles"]


def test_taxonomy_endpoint_matches_the_module(client):
    resp = client.get("/api/taxonomy")
    assert resp.status_code == 200
    assert resp.get_json() == as_contract()


# ── Legacy normalization CLI ────────────────────────────────────────────────

def test_normalize_taxonomy_cli_canonicalizes_and_never_rewrites_unknown(app):
    """The cleanup canonicalizes known legacy spellings and leaves anything it
    cannot resolve exactly as-is, reporting it instead."""
    from models import db, Call, Patient, Vehicle
    from cli import normalize_taxonomy_command

    legacy_call = Call(trip_date="2026-07-20", service_level="bls", status="new")
    emergency_call = Call(trip_date="2026-07-20", service_level="emergency", status="new")
    patient = Patient(first_name="Norm", last_name="Alize", default_service_level="als")
    vehicle = Vehicle(unit_name="Bari-1", unit_number="B1", unit_type="BARI")
    db.session.add_all([legacy_call, emergency_call, patient, vehicle])
    db.session.commit()

    result = app.test_cli_runner().invoke(normalize_taxonomy_command, ["--apply"])
    assert result.exit_code == 0

    assert db.session.get(Call, legacy_call.id).service_level == "BLS"
    assert db.session.get(Patient, patient.id).default_service_level == "ALS"
    assert db.session.get(Vehicle, vehicle.id).unit_type == "Bariatric"
    # Unresolved values are preserved verbatim and surfaced in the report.
    assert db.session.get(Call, emergency_call.id).service_level == "emergency"
    assert "UNRESOLVED" in result.output
    assert "emergency" in result.output


def test_normalize_taxonomy_cli_dry_run_writes_nothing(app):
    from models import db, Call
    from cli import normalize_taxonomy_command

    call = Call(trip_date="2026-07-20", service_level="bls", status="new")
    db.session.add(call)
    db.session.commit()

    result = app.test_cli_runner().invoke(normalize_taxonomy_command)  # no --apply
    assert result.exit_code == 0
    assert "dry run" in result.output
    assert db.session.get(Call, call.id).service_level == "bls"  # untouched


# ── emergency service_level migration ───────────────────────────────────────

def test_emergency_moves_to_call_type_only_when_the_slot_is_free(app):
    """`emergency` moves into call_type where nothing meaningful is there, and a
    real existing call_type is never overwritten to save an invalid value."""
    from models import db, Call, Patient
    from cli import migrate_emergency_service_level_command

    free = Call(trip_date="2026-06-16", service_level="emergency", call_type="none", status="new")
    taken = Call(trip_date="2026-06-20", service_level="emergency", call_type="return", status="completed")
    patient = Patient(first_name="Emer", last_name="Gency", default_service_level="emergency")
    db.session.add_all([free, taken, patient])
    db.session.commit()

    result = app.test_cli_runner().invoke(migrate_emergency_service_level_command, ["--apply"])
    assert result.exit_code == 0

    # Moved: placeholder call_type replaced, bogus service_level cleared.
    assert db.session.get(Call, free.id).call_type == "emergency"
    assert db.session.get(Call, free.id).service_level is None

    # Conflict: 'return' is preserved, the row is left alone and reported.
    conflicted = db.session.get(Call, taken.id)
    assert conflicted.call_type == "return"
    assert conflicted.service_level == "emergency"
    assert "CONFLICT" in result.output

    # Patients have no call_type, so the invalid default is cleared.
    assert db.session.get(Patient, patient.id).default_service_level is None


def test_emergency_migration_dry_run_writes_nothing(app):
    from models import db, Call
    from cli import migrate_emergency_service_level_command

    call = Call(trip_date="2026-06-16", service_level="emergency", call_type="none", status="new")
    db.session.add(call)
    db.session.commit()

    result = app.test_cli_runner().invoke(migrate_emergency_service_level_command)
    assert result.exit_code == 0
    assert "dry run" in result.output
    assert db.session.get(Call, call.id).service_level == "emergency"
    assert db.session.get(Call, call.id).call_type == "none"
