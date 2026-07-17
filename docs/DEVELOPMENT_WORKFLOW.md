# Development Workflow

## Branch strategy

```text
main = stable branch
dev  = development branch
```

```text
1. Work in dev
2. Test backend and frontend
3. Smoke test core workflows (see checklist below)
4. Commit and push dev
5. Merge into main only after stable testing
```

Keep changes PR-sized where possible — a focused diff that does one thing is easier to review and easier to revert if something's wrong. This applies even without a formal PR process: small, single-purpose commits are the goal on `dev` too.

## Before committing a change

Run whichever of these apply to what you touched:

```powershell
# Backend syntax check (always cheap, always worth running)
python -m compileall backend qa_test.py stress_test.py

# Backend tests (there's no pytest yet — see docs/TESTING.md — so this means qa_test.py)
cd backend
.\venv\Scripts\Activate.ps1
flask --app app db upgrade      # if you added/changed a migration
python app.py                    # in one terminal
```

```powershell
cd ..                            # repo root, second terminal
python qa_test.py
```

```powershell
cd frontend
npm run lint
npm run build
```

If `qa_test.py` or `npm run lint`/`npm run build` fail, fix before committing — don't push a broken `dev`.

## Manual verification checklist

Automated coverage is thin (see [TESTING.md](TESTING.md)), so a manual pass through the core flows is still the real regression check for anything touching them. Not every change needs every item — use judgment about what your change could plausibly affect — but for anything touching auth, dispatch, tasks, or settings, run the full list:

- [ ] Login and demo role switch (admin/supervisor/dispatcher/hr — see README Demo Users)
- [ ] Create a patient (and verify duplicate-prevention triggers on an exact repeat)
- [ ] Create a call (Classic and Guided intake)
- [ ] Assign a call to a unit on the Dispatch Board (drag-and-drop)
- [ ] Change unit/call status through the lifecycle (en route → on scene → transporting → at destination)
- [ ] Complete a call, then reopen it
- [ ] Create a task, assign it, change its status, close it (verify the creator/assigner-only close restriction)
- [ ] Clock in / clock out via Kiosk
- [ ] View a payroll period summary and run a CSV export
- [ ] Change the time format in Settings and confirm it applies across pages without a reload

## Database changes

Any model change needs a migration — `db.create_all()` is intentionally disabled (see [ARCHITECTURE.md](ARCHITECTURE.md#database--migrations)).

```powershell
cd backend
.\venv\Scripts\Activate.ps1
flask --app app db migrate -m "describe what changed"
flask --app app db upgrade
```

Review the generated migration file before committing — Alembic's autogenerate is good but not infallible, especially for column type changes or renames.

### Known autogenerate drift — do not blindly accept it

`flask db check` (and `db migrate`) reports drift on SQLite that is **expected and
must not be committed as a migration**. A database built purely from the
migrations has the correct tables and columns (verified), so this drift is
cosmetic/platform noise, not a schema defect:

- **`remove_index` for `ix_<table>_<column>`** — the performance-index migration
  created these indexes but the model columns don't declare `index=True`, so
  autogenerate wants to *drop* them. Dropping them would be a performance
  regression. Never accept these operations.
- **`add_fk` (e.g. `daily_crew_unit.vehicle_id`, `call.cancelled_by`)** — the
  models declare these foreign keys; SQLite's batch migrations don't store them
  as named constraints, and SQLite doesn't enforce FKs by default anyway. This
  cannot be reconciled away on SQLite and is harmless (the ORM relationships
  work). A future Postgres deployment would carry the constraints natively.
- **`modify_type` TEXT ↔ VARCHAR / `_alembic_tmp_*` tables** — only appear
  against a *polluted dev database* (leftover batch temp tables, stale dropped
  columns). A fresh migrated database shows none of these. Rebuild the dev DB
  from migrations rather than "fixing" it with a migration.

If you add a genuine model change, generate the migration, then **delete every
one of the above spurious operations** from the file, leaving only your real
change.

## Refactor discipline

When working through the refactor plan in [ROADMAP.md](ROADMAP.md) Priority 1:

- Do not change behavior unless the refactor requires it — a refactor that also changes behavior is two changes pretending to be one, and doubles the blast radius if something's wrong
- Move code in small steps (one component/hook extraction at a time), not one giant rewrite
- Keep existing API contracts stable — the frontend and backend evolve independently; don't couple a frontend refactor to a backend endpoint change unless the refactor specifically requires it
- Run the build/lint/`qa_test.py` after each meaningful group of changes, not just once at the end
- Avoid unrelated formatting churn in the same diff as a behavioral refactor — it makes the real change harder to review
- Prefer existing project patterns (EntityDrawer, ConfirmDialog/useConfirm, the header-based auth helpers, the per-file API module convention) over introducing new ones, unless the existing pattern is specifically what's being fixed
