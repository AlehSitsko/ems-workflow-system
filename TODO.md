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
- [x] Conflict checks are now reliable: double-booking (crew **and** vehicle) is
  measured by **overlapping time** instead of a shared date, so a day shift
  followed by a night shift is no longer a false conflict; a shift on a
  retired/inactive/out-of-service truck is critical and one in maintenance is a
  warning. Shifts are queried one day wider than the range so a night shift
  starting the evening before is still checked. Every conflict is reported on
  both shifts (`metadata.conflicts`) and named in the day drawer, so a readiness
  count is always explainable. `tests/test_calendar_conflicts.py` (18).
- [x] Performance: the patient-birthday source no longer reads every non-archived
  patient per load. A birthday can only fall in the requested range if its dob
  ends with one of the range's ≤93 MM-DD values, so the database filters on that
  and returns only the four columns the label needs. Measured on a 51,000-patient
  copy: a month range went 858 ms → 41 ms, a 92-day range 834 ms → 123 ms, with
  identical output. (Limiting to recently-active patients was the original idea
  and is not needed — it would also have silently dropped real birthdays.)

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
- [x] Scheduling Inbox for calls without a trip date — `GET /api/calls/unscheduled`
  and `PATCH /api/calls/<id>/schedule`, plus the `/scheduling-inbox` page
  (Operations → Scheduling Inbox). Such calls were previously invisible: the
  calendar filters by date and the board loads one day at a time, so they existed
  in the database and nowhere in the product. Oldest intake first; scheduling into
  the past or onto a finished call is refused. `tests/test_scheduling_inbox.py` (20)
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
  - [x] Follow-up: dedicated `EmployeeFormPage` (`/employees/new`, `/employees/:id/edit`) mirroring `VehicleFormPage`; the edit drawer is retired
  - [x] Follow-up: `GET /api/employees/<id>/shifts` (worked-shift history from `DailyCrewUnit` crew slots) — the Schedule tab is real
- [x] Patient Workspace `/patients/:patientId` (Overview, Transport Profile, Contacts, Alerts, Calls/Trips, Activity) + `PatientFormPage`
- [ ] Consider `/tasks/:taskId`, `/calls/:callId`, `/operations/days/:date`
- [x] **Migrated to a react-router data router** (`createHashRouter`); `useUnsavedGuard`
  wraps `useBlocker`, so sidebar navigation away from a dirty form is now blocked.

## Tech debt / follow-ups (discovered during Calendar integration)

- [x] **Migration drift** — reconciled. `flask db check` on a database built from
  the migration chain now reports no operations. What it took: 25 indexes existed
  in the database but were not declared on the models, so autogenerate wanted to
  *drop* them — they are now declared (`index=True`), keeping the indexes.
  Three foreign keys were the reverse (declared on the models, missing in the
  database) and are created by `c9e4a7b21d38`, which refuses to run if any orphan
  rows exist rather than failing mid-rebuild.

  The root cause of the leftover `_alembic_tmp_*` tables was found: `extensions.py`
  enables `PRAGMA foreign_keys` on every connection, including migrations, so a
  SQLite batch rebuild could not drop the table it was replacing and aborted
  half-way. `migrations/env.py` now disables enforcement for the duration of a
  migration (issued on the raw DBAPI connection — through SQLAlchemy it opens a
  transaction, where SQLite ignores the pragma and the migration then rolls back
  reporting success). Those aborted rebuilds had also silently dropped six
  performance indexes, which `d1f5b8c47e29` restores idempotently.

- [ ] The **dev database** carries its own historical drift beyond the above
  (TEXT vs String(50) on the call lifecycle timestamps, `org_id` foreign keys,
  a `call.patient_order` column no longer on the model). Harmless in SQLite,
  which ignores declared string lengths, but it means the dev DB is not
  byte-identical to a freshly migrated one. Decide before release: rebuild the
  dev DB from migrations and re-import data, or accept it as dev-only.
- [x] `getShiftAlertSeverity` (`dispatchBoardUtils`) now derives "today" from
  `todayStr()` (local). `setIsoTime` was also writing timestamps back through
  `toISOString()`, shifting every saved call time by the UTC offset — fixed with
  `toLocalIsoString()` / `localDatePart()`.
- [x] Calendar readiness: shift time-overlap double-booking and vehicle
  availability checks — done, see P1. The `DailyCrewUnit`→`Vehicle` link they
  needed now exists: shift creation picks a fleet vehicle and `truck_number` is
  a snapshot of it.
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
- [x] HR no longer gets Calendar links into `/dispatch` it cannot open: the page
  withholds the open handlers for roles without Dispatch access, so rows and the
  drawer footer render as a read-only day summary instead of a dead link.

- [x] `DELETE /api/crew-units/<id>` no longer returns a raw `IntegrityError` 500 when
  the shift still holds calls: it refuses with `409` and says how many to unassign
  first (cascading silently would drop trips back into the open queue untraceably).
  Inactive assignment history is deleted with the shift it describes, which the FK
  used to block even after a clean unassign. Calls themselves are never touched.

## P4d — Employee leave / absence (done)

Full spec in [docs/ROADMAP.md](docs/ROADMAP.md) → Phase 4d.

- [x] `EmployeeLeaveRequest` model + migration `e7c2a94f16bd` — one row per
  request holding an inclusive date range, never one row per day
- [x] Canonical `LEAVE_TYPES` / `LEAVE_STATUSES` in `utils/taxonomy.py` (with
  aliases: PTO → vacation, rejected → denied) and published via `GET /api/taxonomy`
- [x] `/api/leave-requests` — list (filter by employee/status/overlapping range),
  read, create, edit, approve/deny, cancel, delete
- [x] **Structural privacy**: sick / medical / bereavement report as
  `unavailable` to supervisor and dispatcher, and the HR-only fields (reason,
  private notes, review trail) are omitted from the payload rather than blanked
- [x] Permissions: HR + admin manage and decide; supervisor may file a request
  (lands in `pending`) but cannot approve or edit; dispatcher is read-only;
  hard delete is admin-only (cancelling is the normal path)
- [x] Overlapping requests for one employee refused with `409`; denied/cancelled
  leave frees the dates; partial day allowed on single-day requests only
- [x] Approving reports the shifts the employee is already rostered on, instead
  of leaving the staffing hole to be found on the day
- [x] `tests/test_leave.py` (35), including tests that fail if the sensitive type
  leaks or an HR-only field is blanked instead of omitted
- [x] Calendar integration: leave is stored as one range and derived into one
  event per covered day so it lands in the month grid; approved leave warns,
  pending reads "(requested)", denied/cancelled produce nothing. The privacy rule
  holds here too — sensitive types render as "Unavailable" for non-HR roles
- [x] Crew planning conflict: saving a shift whose crew is on leave returns
  `leaveConflicts` (critical for approved, warning for pending) and the Dispatch
  Board raises it as a toast. `GET /api/leave-requests/unavailable?date=` answers
  "who is away today" for a shift form without disclosing the type or reason
- [x] UI: the Employee Workspace "Leave" tab is real — file a request
  (HR/admin/supervisor), approve, deny or cancel (HR/admin). It renders only the
  fields the API sent, so it cannot widen what the server narrowed
  (`EmployeeLeaveTab.test.jsx`, 6 tests)
- [x] Dedicated review screen at `/leave` (Staff → Leave): pending requests across
  every employee, status filter, approve / deny / cancel with confirmation, and a
  jump into the employee's own workspace. Approving surfaces the shifts it just
  left short-handed. Supervisors get the same screen read-only — the API already
  withholds the detail, so the page simply has nothing to hide
- [ ] Leave balances / PTO accrual / holiday policy — still deferred until the
  business rules are agreed

## P4c — Confirmation calls + call detail page (done)

The day-before ring-round that checks tomorrow's trips are still on.

- [x] `Call.confirmation_status` (not_called / no_answer / confirmed / declined)
  plus note and who/when trail — migration `f3a81c05d7e2`, FK created in the same
  migration so it does not add to the drift that `c9e4a7b21d38` had to clean up
- [x] Four states, not a yes/no flag: "no answer" and "not called yet" look the
  same on a board and mean opposite things to whoever is working the list
- [x] `PATCH /api/calls/<id>/confirmation` — a **declined** outcome cancels the
  call outright and keeps it in history with the reason, rather than leaving a
  confirmed-looking trip nobody will run
- [x] `GET /api/calls/<id>` + `/calls/:callId` page: full trip detail, inline
  correction of what the patient changes on the phone, and the confirmation
  buttons. Reachable from the scheduling inbox and the board
- [x] CONF / NO ANS badge on the Dispatch Board call card
- [x] `tests/test_call_confirmation.py` (15) + frontend `confirmation.test.js` (5)
- [x] `/confirmation-round` — a whole day as a call list in pickup order, with a
  running tally of what is left. Trips with no time sort last (establishing the
  time is often the point of ringing). Confirmed / No answer / Declined are
  recorded inline; a no-answer deliberately stays in the "still to ring" count.
  `GET /api/calls/confirmation-round?date=`

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
