# TODO

Active and near-term backlog, in sequential blocks (P0 → P4). Completed work is
**not** kept here — it lives in [docs/COMPLETED_BLOCKS.md](docs/COMPLETED_BLOCKS.md).
For the phased long-range picture see [docs/ROADMAP.md](docs/ROADMAP.md).

Format for active tasks: **Why / Scope / Acceptance / Validate**.

---

## P0 — Current stabilization sprint

Most of this sprint is **done** (see COMPLETED_BLOCKS.md → "Stabilization sprint"):
documentation sync, the Flask application factory, removal of import-time demo
seeding, the `seed-demo` CLI, GitHub Actions CI, isolated Patients pytest,
isolated Payroll pytest, and the Vitest frontend test foundation.

- [x] Documentation synchronization (README / TODO / ROADMAP / TESTING / COMPLETED_BLOCKS)
- [x] Flask application factory (`create_app`, `config.py`, `extensions.py`, `cli.py`)
- [x] Remove import-time demo seeding + `except Exception: pass`
- [x] `flask --app app seed-demo` CLI command (idempotent, local/demo only)
- [x] GitHub Actions CI (`.github/workflows/ci.yml`)
- [x] Patients pytest (`backend/tests/test_patients.py`, 30 tests)
- [x] Payroll pytest (`backend/tests/test_payroll.py`, 22 tests)
- [x] Vitest foundation (`vitest`, RTL, jsdom; 32 tests) + CI `npm test`
- [x] PatientsPage decomposition — **phase 1** (constants + `DetailItem` + `PatientFormSection` → `components/patients/`)
- [x] PatientsPage decomposition — **phase 2** (`usePatients`, `usePatientForm`, `usePatientAlerts`, `usePatientContacts` hooks)
- [x] PatientsPage decomposition — **phase 3** (drawer tab components + `PatientToolbar` + `PatientList`; page ~1,496 → ~437 lines)

PatientsPage decomposition is complete — see COMPLETED_BLOCKS.md.

---

## P1 — Calendar MVP + Dispatch integration

Read-only, role-aware operational calendar aggregating existing data. Foundation
and the first Calendar ↔ Dispatch integration slice are **done** (see
COMPLETED_BLOCKS.md → "Calendar"). Full spec in
[docs/ROADMAP.md](docs/ROADMAP.md) → Phase 2.

**Done:**
- [x] Calendar page scaffold — month grid, weekend + US federal holiday highlighting, navigation, legend
- [x] Unified event contract + `GET /api/calendar/events?start=&end=` (range-validated ≤93 days, backend role filtering, `{events, days}` with per-day readiness)
- [x] Event sources (MVP): `scheduled_call` (from `Call`) and `crew_shift` (from `DailyCrewUnit`) — derived, not copied
- [x] Month cells show call/unit/unassigned counts + readiness (icon + aria-label, not color-only); Day Operations Drawer (calls / units / issues) with "Open Day in Dispatch Board"
- [x] Dispatch Board reads `?date=&call=&unit=`; Planning / Live / History modes; live status transitions gated to today (frontend disabled + backend `409`); linked call/unit selection
- [x] HR receives crew-only, non-PHI calendar data

**Also done (event sources + settings slice):**
- [x] Event sources added: patient & employee birthdays, certification expirations, task due dates, vehicle inspection/registration/insurance/maintenance dates
- [x] Schema for those sources: `Employee.dob`, `Vehicle.{inspection,registration,insurance}_expiry` + `next_maintenance_date` (migration `e5a9c7d1b2f3`)
- [x] Task participants + "assign to everyone" (`TaskParticipant`, `Task.visible_to_all`) with matching backend visibility + Tasks UI
- [x] Per-user calendar display settings (`settings.calendar`): source toggles, week start, density, weekends/holidays
- [x] Backend role access for every source (HR crew-only/no-PHI; dispatcher sees certs without employee name; patient/vehicle ops-only)

**Also done (P0 date-mode enforcement):**
- [x] `utils/operational_dates.py` — single source of truth for local operational dates, mode derivation (Planning/Live/History) and the guards
- [x] Backend enforcement on every mutating route: assign, unassign, complete, reopen, call-order, unit status, crew create/update/delete, make-night, pickup-time
- [x] Cross-date assignment rejected (`trip_date` must equal `shift_date`); past assignment rejected; completed/cancelled call not assignable
- [x] Real-calendar-date validation (`400` for 2026-99-99 / 2026-02-30, leap day accepted) on the board date and every guard; frontend `isIsoDate` uses the same meaning
- [x] Dispatch API helpers surface the backend's specific rejection message
- [x] `tests/test_date_modes.py` (22) incl. a full Live workflow regression

**Remaining (next Calendar slice):**
- [x] Week and Agenda views — one anchor date drives all three views; Week is
  seven day columns with time-ordered events, Agenda a rolling four-week list
  grouped by day. Both link calls/units into Dispatch like the month drawer.
- [ ] Reliable conflict checks currently deferred (see Tech-debt / follow-ups): shift **time-overlap** double-booking (MVP flags same-day double-booking regardless of overlap), vehicle **out-of-service** readiness (no reliable `DailyCrewUnit`→`Vehicle` link yet)
- [ ] Performance: patient-birthday source scans all non-archived patients per load — consider limiting to recently-active patients on large datasets

## P2 — Docker development environment (planned, not started)

Reproducible local dev/demo via containers. **Development only — this does not
make the project production-ready** (no PostgreSQL, real auth, or hardening; see
P4). Detailed phase notes in [docs/ROADMAP.md](docs/ROADMAP.md) → Phase 3.

- [ ] `backend/Dockerfile` (Python slim, Flask dev server, `flask db upgrade` on start)
- [ ] `frontend/Dockerfile` (Node, Vite dev server with hot reload; API URL via env)
- [ ] `docker-compose.yml` (backend + frontend, ports, depends_on)
- [ ] `.dockerignore` + `.env.example` (document `DATABASE_URL`, `VITE_API_BASE_URL`, VAPID)
- [ ] Named volume for the SQLite database file (persist across rebuilds)
- [ ] Optional explicit demo seed step (`flask --app app seed-demo`) — never automatic
- [ ] Reuse existing `/api/health` for a compose healthcheck
- [ ] Docker setup guide (`docs/`), and a CI job that builds both images
- Out of scope for P1: PostgreSQL, Redis, Celery, Nginx, Kubernetes, production
  secrets, cloud deployment.

## P3 — Calendar operations & extensions (planned)

Later Calendar phases (see [docs/ROADMAP.md](docs/ROADMAP.md) → Phase 4). Not to
be implemented before the current Calendar slice is complete:

- [ ] Recurring patient transportation; linked outbound/return trips
- [ ] Scheduling Inbox for calls without a date/time
- [ ] Estimated trip duration + planned end time
- [ ] Day / Agenda operational timeline; planned-vs-actual time comparison
- [ ] Day handoff summary; "Close Operational Day" workflow
- [ ] `CalendarEvent` model for manual events (visibility scopes: company /
  operations / management / HR / patient-operations / private)
- [ ] Participants, reminders, notification integration, saved views
- [ ] Recurrence, ICS export, external (Google/Outlook) sync — much later; must
  not export patient data without a separate privacy/security policy
- [ ] Route optimization — separate future research only

## P1b — Entity Workspace migration (in progress)

The drawer-first rule is retired: complex entities move to full-page workspaces
(see [docs/UI_STANDARD.md](docs/UI_STANDARD.md)). Vehicles is the reference
implementation — migrate the rest **incrementally**, not in one rewrite.

- [x] `EntityWorkspace` shell (URL-synced tabs, back-to-list with restored filters, loading/error/not-found/permission, unsaved-changes)
- [x] Vehicle Workspace `/fleet/vehicles/:vehicleId` + Fleet vehicles list + Fleet nav group
- [x] Employee Workspace `/employees/:employeeId` (Overview, Qualifications, Documents, Time & Pay, Tasks, Activity — all real; Schedule + Leave honestly disabled). Backed by new `GET /api/employees/<id>`. List row + command palette deep-link here; edit still bridges to the drawer via `location.state.editEmployeeId`.
  - [ ] Follow-up: dedicated `EmployeeFormPage` (`/employees/new`, `/employees/:id/edit`) mirroring `VehicleFormPage`, to retire the edit drawer
  - [ ] Follow-up: `GET /api/employees/<id>/shifts` (worked-shift history from `DailyCrewUnit` crew slots) to make the Schedule tab real
- [ ] Patient Workspace `/patients/:patientId` (Overview, Transport Profile, Contacts, Alerts, Calls/Trips, Activity)
- [ ] Consider `/tasks/:taskId`, `/calls/:callId`, `/operations/days/:date`
- [ ] **Migrate to a react-router data router** (`createHashRouter`) so `useBlocker`
  can guard sidebar navigation. Today `dirty` only guards the workspace's own back
  link, tab switches and page unload — sidebar navigation is not blocked.

## Tech debt / follow-ups (discovered during Calendar integration)

- [ ] **Migration drift** — `flask --app app db check` reports pre-existing drift
  independent of the Calendar work (no models changed): dropped performance
  indexes, `org_id` foreign keys present in models but not the migration head,
  and a leftover `_alembic_tmp_patient` table from an interrupted batch
  migration in the dev DB. Needs a deliberate, analyzed reconciliation (do **not**
  blind-accept autogenerated `remove_index`; keep the performance indexes). Track
  separately from feature work.
- [ ] `getShiftAlertSeverity` (`dispatchBoardUtils`) still derives "today" from
  `toISOString()` (UTC); `todayStr` and the new date-mode logic are now local.
  Align it to local for midnight-boundary correctness.
- [ ] Calendar readiness: reliable **shift time-overlap** double-booking and
  **vehicle out-of-service** checks (see P1 remaining) once a
  `DailyCrewUnit`→`Vehicle` link and shift-overlap logic exist.
- [x] **Split `Employee.role`** into `qualification` + `admin_role` (migration
  `b7d3f8c1a2e4`, backfilled from the legacy value). `role` stays as a derived
  legacy mirror for backward compatibility; the form has two selects, crew
  eligibility reads `qualification`, and the workspace shows both axes.
- [ ] **Call #27** still has `service_level='emergency'` with `call_type='return'` —
  the cleanup deliberately refused to overwrite a real call_type. Needs a decision.
- [ ] 3 calls / 3 patients hold an empty-string service level (`''`) — decide
  whether to normalize to NULL.
- [ ] `Vehicle.unit_type` is a single value; real multi-capability support lands
  with Fleet Management.
- [ ] HR opens a Calendar `crew_shift` link into `/dispatch`, but HR has no
  Dispatch access (redirects to home). Decide: hide the link for HR, or give HR a
  read-only crew view.

## P4 — Later production hardening (planned)

- [ ] Production authentication (replace header-based `X-User-*` with JWT/session)
- [ ] PostgreSQL migration
- [ ] Production Docker images (Gunicorn, Nginx, multi-stage frontend, non-root)
- [ ] Restrict CORS to known origins; secrets management
- [ ] Runtime tenant isolation (the `organization` schema exists but is inactive)
- [ ] Backup strategy, structured logging, monitoring
- [ ] Security review

---

## Portfolio polish (P3-ish, independent)

- [ ] Screenshots + a short workflow GIF in README
- [ ] Seeded demo dataset for screenshots/walkthroughs
- [ ] Simple architecture diagram
