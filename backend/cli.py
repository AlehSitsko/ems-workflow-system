"""Custom Flask CLI commands.

`seed-demo` replaces the old import-time `create_default_users()` call. Demo
users are created explicitly, never on normal app startup, so importing or
serving the app has no side effects on the database.
"""

import click
from flask.cli import with_appcontext
from werkzeug.security import generate_password_hash

from models import db, User, Call, Patient, DailyCrewUnit, Vehicle
from utils.taxonomy import (
    normalize_service_level, normalize_unit_type, normalize_vehicle_capability,
)


# Demo credentials — for local/demo environments only. Never seed these in a
# production deployment (see docs/PRODUCTION_READINESS.md).
DEMO_USERS = [
    {"username": "admin",      "password": "admin",      "display_name": "Admin User",      "role": "admin"},
    {"username": "supervisor", "password": "supervisor", "display_name": "Supervisor User", "role": "supervisor"},
    {"username": "dispatcher", "password": "dispatcher", "display_name": "Dispatcher User", "role": "dispatcher"},
    {"username": "hr",         "password": "hr",         "display_name": "HR User",         "role": "hr"},
]


@click.command("seed-demo")
@with_appcontext
def seed_demo_command():
    """Create demo users (idempotent). Requires migrations to be applied first.

    Safe to re-run: existing usernames are skipped, not duplicated or updated.
    Errors are not swallowed — if the schema is missing, run `flask db upgrade`.
    """
    # Seeding has no request, so bind it to the default org — the write-stamp then
    # gives every seeded user an org_id (without one they would see every tenant).
    from tenant import ensure_default_org, set_current_org
    set_current_org(ensure_default_org())

    created, skipped = [], []
    for user_data in DEMO_USERS:
        if User.query.filter_by(username=user_data["username"]).first():
            skipped.append(user_data["username"])
            continue
        db.session.add(User(
            username=user_data["username"],
            password_hash=generate_password_hash(user_data["password"]),
            display_name=user_data["display_name"],
            role=user_data["role"],
            is_active=True,
        ))
        created.append(user_data["username"])

    db.session.commit()
    click.echo(f"seed-demo: created={created or 'none'} | skipped_existing={skipped or 'none'}")


# Columns holding taxonomy values, with the normalizer that canonicalizes each.
_TAXONOMY_TARGETS = [
    ("Call.service_level", Call, "service_level", normalize_service_level),
    ("Patient.default_service_level", Patient, "default_service_level", normalize_service_level),
    ("DailyCrewUnit.unit_type", DailyCrewUnit, "unit_type", normalize_unit_type),
    ("Vehicle.unit_type", Vehicle, "unit_type", normalize_vehicle_capability),
]


@click.command("normalize-taxonomy")
@click.option("--apply", "apply_changes", is_flag=True,
              help="Write the canonical values. Without this flag the command is a dry run.")
@with_appcontext
def normalize_taxonomy_command(apply_changes):
    """Canonicalize legacy taxonomy values ('bls' to 'BLS', 'BARI' to 'Bariatric').

    Dry run by default. Values that cannot be resolved to the canonical taxonomy
    (for example `emergency` stored as a service level, when it is a call type
    rather than a level of care) are reported and left untouched, never rewritten
    or deleted: they need a human decision, not a silent guess.
    """
    total_changed = 0
    unresolved_total = 0

    for label, model, column, normalizer in _TAXONOMY_TARGETS:
        rows = model.query.filter(getattr(model, column).isnot(None)).all()
        changes = {}
        unresolved = {}

        for row in rows:
            raw = getattr(row, column)
            if raw is None or str(raw).strip() == "":
                continue
            canonical = normalizer(raw)
            if canonical is None:
                unresolved[raw] = unresolved.get(raw, 0) + 1
            elif canonical != raw:
                changes[(raw, canonical)] = changes.get((raw, canonical), 0) + 1
                if apply_changes:
                    setattr(row, column, canonical)

        click.echo(f"\n{label}:")
        if changes:
            for (raw, canonical), count in sorted(changes.items(), key=lambda kv: -kv[1]):
                verb = "updated" if apply_changes else "would update"
                click.echo(f"  {verb} {count:>4}x  {raw!r} -> {canonical!r}")
                total_changed += count
        else:
            click.echo("  already canonical")
        for raw, count in sorted(unresolved.items(), key=lambda kv: -kv[1]):
            click.echo(f"  UNRESOLVED {count:>4}x  {raw!r}  (left untouched, needs a decision)")
            unresolved_total += count

    if apply_changes:
        db.session.commit()
        click.echo(f"\nnormalize-taxonomy: applied {total_changed} change(s); "
                   f"{unresolved_total} unresolved value(s) left untouched.")
    else:
        click.echo(f"\nnormalize-taxonomy (dry run): {total_changed} change(s) pending; "
                   f"{unresolved_total} unresolved. Re-run with --apply to write.")


# Placeholder call_type values that carry no meaning and are safe to replace.
_EMPTY_CALL_TYPES = {None, "", "none", "None"}


@click.command("migrate-emergency-service-level")
@click.option("--apply", "apply_changes", is_flag=True,
              help="Write the changes. Without this flag the command is a dry run.")
@with_appcontext
def migrate_emergency_service_level_command(apply_changes):
    """Move `emergency` out of service_level, where it never belonged.

    `emergency` describes the *type* of a call, not the level of care, but the
    old call forms offered it as a service level. This moves it to
    `Call.call_type` and clears the bogus service_level.

    Two cases are handled explicitly rather than by force:

      * A call that already has a real call_type (e.g. 'return') is NOT
        overwritten - that would destroy the existing type to save a value we
        know is invalid. It is reported for a human decision.
      * Patients have no call_type at all, so `emergency` cannot be moved. It is
        cleared: it is not a valid default transport requirement, and the level
        of care that matters operationally lives on each call.
    """
    moved, conflicts, patients_cleared = [], [], []

    for call in Call.query.filter(Call.service_level == "emergency").all():
        if call.call_type in _EMPTY_CALL_TYPES:
            moved.append((call.id, call.call_type))
            if apply_changes:
                call.call_type = "emergency"
                call.service_level = None
        else:
            conflicts.append((call.id, call.call_type))

    for patient in Patient.query.filter(Patient.default_service_level == "emergency").all():
        patients_cleared.append(patient.id)
        if apply_changes:
            patient.default_service_level = None

    verb = "moved" if apply_changes else "would move"
    click.echo("\nCall.service_level 'emergency' -> Call.call_type:")
    for call_id, old_type in moved:
        click.echo(f"  {verb} call #{call_id} (call_type {old_type!r} -> 'emergency', service_level -> None)")
    if not moved:
        click.echo("  nothing to move")

    for call_id, existing in conflicts:
        click.echo(f"  CONFLICT call #{call_id} already has call_type={existing!r} - "
                   f"left untouched, needs a decision")

    verb = "cleared" if apply_changes else "would clear"
    click.echo("\nPatient.default_service_level 'emergency' (no call_type to move it to):")
    for pid in patients_cleared:
        click.echo(f"  {verb} patient #{pid}")
    if not patients_cleared:
        click.echo("  nothing to clear")

    if apply_changes:
        db.session.commit()
        click.echo(f"\nmigrate-emergency-service-level: {len(moved)} call(s) moved, "
                   f"{len(patients_cleared)} patient(s) cleared, {len(conflicts)} conflict(s) left.")
    else:
        click.echo(f"\nmigrate-emergency-service-level (dry run): {len(moved)} call(s), "
                   f"{len(patients_cleared)} patient(s), {len(conflicts)} conflict(s). "
                   f"Re-run with --apply to write.")


@click.command("link-crew-units-to-vehicles")
@click.option("--apply", "apply_changes", is_flag=True,
              help="Write the links. Without this flag the command is a dry run.")
@with_appcontext
def link_crew_units_to_vehicles_command(apply_changes):
    """Link legacy daily crew units to fleet vehicles by matching truck_number.

    Only an unambiguous, exact match on `Vehicle.unit_number` is linked. A
    truck_number that matches nothing, or matches more than one vehicle, is
    reported and left unlinked — guessing here would attach a shift's history to
    the wrong physical vehicle, which is worse than leaving it null.

    `DailyCrewUnit.vehicle_id` is nullable precisely so legacy shifts can stay
    honest about being unlinked.
    """
    vehicles = Vehicle.query.all()
    by_number = {}
    for vehicle in vehicles:
        key = (vehicle.unit_number or "").strip().lower()
        if key:
            by_number.setdefault(key, []).append(vehicle)

    linked, unmatched, ambiguous, already = 0, {}, {}, 0

    for unit in DailyCrewUnit.query.filter(DailyCrewUnit.vehicle_id.is_(None)).all():
        key = (unit.truck_number or "").strip().lower()
        matches = by_number.get(key, [])
        if len(matches) == 1:
            linked += 1
            if apply_changes:
                unit.vehicle_id = matches[0].id
        elif len(matches) > 1:
            ambiguous[unit.truck_number] = ambiguous.get(unit.truck_number, 0) + 1
        else:
            unmatched[unit.truck_number] = unmatched.get(unit.truck_number, 0) + 1

    already = DailyCrewUnit.query.filter(DailyCrewUnit.vehicle_id.isnot(None)).count()

    verb = "linked" if apply_changes else "would link"
    click.echo(f"\n{verb} {linked} crew unit(s) by exact truck_number match")
    if already:
        click.echo(f"  ({already} unit(s) already linked, skipped)")

    if unmatched:
        click.echo("\nUNRESOLVED - truck_number matches no vehicle (left unlinked):")
        for number, count in sorted(unmatched.items(), key=lambda kv: -kv[1]):
            click.echo(f"  {number!r:14} x{count}")
    if ambiguous:
        click.echo("\nAMBIGUOUS - truck_number matches several vehicles (left unlinked):")
        for number, count in sorted(ambiguous.items(), key=lambda kv: -kv[1]):
            click.echo(f"  {number!r:14} x{count}")

    total_unresolved = sum(unmatched.values()) + sum(ambiguous.values())
    if apply_changes:
        db.session.commit()
        click.echo(f"\nlink-crew-units-to-vehicles: linked {linked}; "
                   f"{total_unresolved} left unlinked for a human decision.")
    else:
        click.echo(f"\nlink-crew-units-to-vehicles (dry run): {linked} link(s) pending; "
                   f"{total_unresolved} unresolved. Re-run with --apply to write.")


@click.command("seed-demo-data")
@click.option("--force", is_flag=True, help="Seed even if operational rows already exist.")
@with_appcontext
def seed_demo_data_command(force):
    """Seed a coherent operational demo dataset (employees, patients, fleet,
    today's crews, calls, tasks). For local/demo and screenshots only.

    Ensures the demo users exist first, then builds the dataset. Refuses to run on
    a database that already has records unless --force, so it never doubles up or
    pollutes real data.
    """
    from demo_data import build_demo_dataset, has_demo_data

    for user_data in DEMO_USERS:
        if not User.query.filter_by(username=user_data["username"]).first():
            db.session.add(User(
                username=user_data["username"],
                password_hash=generate_password_hash(user_data["password"]),
                display_name=user_data["display_name"],
                role=user_data["role"], is_active=True,
            ))
    db.session.commit()

    if has_demo_data() and not force:
        click.echo("seed-demo-data: operational data already present — nothing to do "
                   "(use --force to seed anyway).")
        return

    summary = build_demo_dataset()
    parts = ", ".join(f"{k}={v}" for k, v in summary.items())
    click.echo(f"seed-demo-data: created {parts}")


def register_cli_commands(app):
    """Attach custom CLI commands to the given app instance."""
    app.cli.add_command(seed_demo_command)
    app.cli.add_command(seed_demo_data_command)
    app.cli.add_command(normalize_taxonomy_command)
    app.cli.add_command(migrate_emergency_service_level_command)
    app.cli.add_command(link_crew_units_to_vehicles_command)
