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

## P2 — Docker development environment (done)

Reproducible local dev/demo via containers. **Development only — this does not
make the project production-ready** (no PostgreSQL, real auth, or hardening; see
P4). Detailed notes in [docs/DOCKER.md](docs/DOCKER.md).

- [x] `backend/Dockerfile` (Python 3.13 slim, `flask db upgrade` on start)
- [x] `frontend/Dockerfile` (Node 22, Vite dev server with hot reload)
- [x] `docker-compose.yml` — both services, published ports, `depends_on` gated
  on the backend's healthcheck so the UI never loads against a migrating server
- [x] `.dockerignore` for both (keeps the host venv, node_modules, any developer
  database and the VAPID private key out of image layers) + `.env.example`
- [x] Named volume for the SQLite file — survives rebuilds, and is separate from
  the host's `backend/instance/database.db` so Docker cannot damage local data
- [x] Demo seed stays an explicit command, never automatic
- [x] Healthcheck reuses the existing `/api/health` — no route added for Docker
- [x] `docs/DOCKER.md` + a `docker` CI job that builds both images and validates
  the compose file
- [x] Both images build in CI (run #101 on `main`) — the Dockerfiles and the
  compose file are known-good
- [x] The stack was run end to end on Docker Desktop (WSL2): images build, migrations reach head on a fresh volume, the healthcheck gate holds (frontend waits for backend healthy), /api/health is 200, seed-demo + login work, the app is served under its base path, and the named volume survives a down/up cycle.
- Out of scope, deliberately: PostgreSQL, Redis, Celery, Nginx, Kubernetes,
  production secrets, cloud deployment.

## P3 — Calendar operations & extensions (planned)

Later Calendar phases (see [docs/ROADMAP.md](docs/ROADMAP.md) → Phase 4). Not to
be implemented before the current Calendar slice is complete:

- [x] Recurring patient transportation + linked outbound/return trips —
  `RecurringTrip` (migration `b8e17d3c94af`), `/api/recurring-trips`, and the
  `/recurring-trips` page. A standing order materialises ordinary Call rows a few
  weeks ahead, so the board, calendar, inbox and confirmation round need no
  knowledge of recurrence. Regeneration is idempotent; a trip a human has touched
  (confirmed, assigned, cancelled or hand-edited) is never rewritten or withdrawn
  unless the editor explicitly asks to re-sync. `tests/test_recurring_trips.py` (25)
- [x] Scheduling Inbox for calls without a trip date — `GET /api/calls/unscheduled`
  and `PATCH /api/calls/<id>/schedule`, plus the `/scheduling-inbox` page
  (Operations → Scheduling Inbox). Such calls were previously invisible: the
  calendar filters by date and the board loads one day at a time, so they existed
  in the database and nowhere in the product. Oldest intake first; scheduling into
  the past or onto a finished call is refused. `tests/test_scheduling_inbox.py` (20)
- [x] Estimated trip duration + planned end time — optional
  `Call.estimated_duration_minutes` (migration `b8f2d3e64a17`); the API derives
  `planned_end_time` (pickup + duration) and a `planned_end_next_day` flag on
  every call. Editable in the call intake form and the Call workspace, both with
  a live client-side end-time preview (`utils/tripTiming.js`, mirrors the backend
  maths). `test_call_duration.py` (11) + `tripTiming.test.js` (4). Verified end
  to end (set 90 min on a 09:00 pickup → planned end 10:30)
- [x] Day / Agenda operational timeline; planned-vs-actual time comparison —
  `GET /api/operations/days/<day>/timeline` returns the day's trips as an agenda
  (ordered by planned pickup, unscheduled last) with planned times, the actual
  lifecycle milestones (dispatched → at-pickup → loaded → at-dest → completed, as
  local HH:MM), and the pickup variance (actual arrival − planned). `DayTimelinePage`
  at `/operations/days/:date` (dispatch-access) with summary tiles and on-time/
  late/early chips; linked from the calendar Day Operations Drawer. `test_day_timeline.py`
  (10) + `DayTimelinePage.test.jsx` (3). Verified end to end on a seeded day
- [x] Day handoff summary + "Close Operational Day" — `/day-closeout` and
  `/api/operations/days/<day>`. Past dates were already read-only, so closing is
  not a lock: it is the review of what the day ended up as, the loose ends nobody
  tidied (a call left assigned, a shift with no actual end time — neither visible
  on a board that only shows today), and a name against the sign-off. Closing
  over loose ends requires explicit acknowledgement; the stored snapshot keeps
  saying what was true at sign-off even if a call is edited later. Supervisor and
  admin close, dispatcher reads, admin alone reopens. `tests/test_day_closure.py` (20)
- [x] `CalendarEvent` model for manual events (visibility scopes: personal /
  role / company) — a user creates meetings, reminders, training days and
  time-off markers by hand. Migration `c9a4e7b21f38`; CRUD at
  `/api/calendar-events` (create/edit/delete gated to owner-or-admin, and only
  admin/supervisor may broadcast role- or company-wide). Surfaces through the
  calendar aggregator via a shared `visible_events_filter`, with a "+ New event"
  drawer on the Calendar page and a `calendar_event` source toggle. Full CRUD in
  the UI: the owner (or an admin) edits or deletes an event inline from the day
  drawer, reusing the same drawer in edit mode. `test_calendar_events.py` (16),
  `NewCalendarEventModal.test.jsx` (6), `DayOperationsDrawer.test.jsx` manage
  cases (3). Verified end to end (create → edit → delete on the running app)
- [x] Participants, reminders, notification integration, saved views —
  **saved views** ship as named display presets (see "named saved views" below).
  **Participants** are employees invited to a manual event (mirroring task
  participants): they see the event on their calendar and, through their linked
  user, receive an invite when added — `CalendarEventParticipant` (migration
  `f1a9c3e57b02`), synced through the event's create/update payload, and the
  aggregator/CRUD `visible_events_filter` gains a participant clause so a personal
  event still reaches them. **Reminders** are a per-event lead time
  (`CalendarEvent.reminder_minutes`, 0–1 day); the temporal scan
  (`run_temporal_checks`) fires an `event_reminder` to the owner + participants
  when the lead crosses, occurrence-aware for recurring events. **Notification
  integration**: `event_invite` / `event_reminder` types + labels, a `notify_users`
  fan-out helper (one event, many directed recipients, so the recency dedup does
  not swallow the second). Modal gains a Remind select + participant picker; the
  day drawer shows ⏰ / 👥 tags. `test_calendar_participants.py` (10),
  `NewCalendarEventModal.test.jsx` (+2). Verified end to end on the running app
  (participant sees a personal event; reminder delivered from the scan)
- [x] **ICS export** — the caller's visible manual events in a range as an
  RFC 5545 `.ics` file (`GET /api/calendar-events/export.ics`), for import into
  Google/Outlook. One-way snapshot, same visibility rule as the calendar, and
  **manual events only** — no calls, shifts or patient data cross the boundary.
  All-day → `VALUE=DATE` with an exclusive end; timed → floating datetimes; text
  escaped per spec. "Export .ics" button on the calendar (current view's range).
  `test_calendar_ics.py` (8), `calendarEventsApi.test.js` (1). Verified end to end
  on the running app
- [x] **Recurrence** — manual events repeat daily / weekly / monthly with an
  optional until-date. The event stays one row; the calendar aggregator expands
  it into occurrences within the window it renders (`utils/event_recurrence.py`),
  and editing or deleting the row moves the whole series — no per-occurrence
  edits. Weekly keeps the weekday; monthly keeps the day-of-month, clamped to a
  short month without drifting. ICS exports a recurring event as an `RRULE`, not
  expanded, so a calendar app keeps it as one repeating entry. Recurrence picker
  in the event drawer; a ↻ indicator on recurring days. `test_event_recurrence.py`
  (11), `test_calendar_recurrence.py` (10), modal tests (3). Verified end to end
  on the running app (weekly event expanded across the month, RRULE in the .ics)
- [ ] **Deferred (external dependency).** External (Google/Outlook) two-way sync —
  needs an OAuth integration and a separate privacy/security policy before any
  patient data could cross the boundary. Out of scope for the self-contained app;
  parked deliberately, not an oversight.
- [ ] **Deferred (research).** Route optimization — a research problem (routing
  engine, constraints), not a near-term build. Parked deliberately.
- [ ] **Deferred (feature).** Configurable **rate engine** for trip pricing. The
  Call Intake Price Calculator is currently a client-side *estimate helper* only
  (base price + mileage×rate, ±return ride, one-time waiting fee) and is not
  persisted to a call. A hardcoded "$25 per extra crew member" placeholder was
  **removed** (it was never a real, configured rate); crew size is now shown as
  operational information without affecting the estimate. A real rate engine —
  per-organization rate tables, service-level pricing, mileage tiers, and (if the
  business confirms it) a staffing charge — would live in the backend and be the
  source of truth for a persisted, billable amount. Not started.

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
- [x] Entity deep-link routes — `/calls/:callId` (Call workspace) and
  `/operations/days/:date` (Day timeline) already shipped; `/tasks/:taskId` now
  opens the task drawer (shareable/bookmarkable), fetching the task directly so the
  link works outside the current filter and returning to `/tasks` on close. A task
  is a simple entity, so it stays a drawer (per UI_STANDARD) rather than a full
  workspace. `routeMetadata` + guardrail test updated; verified live (open + close)
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

- [x] The **dev database** carries its own historical drift beyond the above
  (TEXT vs String(50) on the call lifecycle timestamps, `org_id` foreign keys,
  a `call.patient_order` column no longer on the model). Harmless in SQLite,
  which ignores declared string lengths, but it means the dev DB is not
  byte-identical to a freshly migrated one. **Decided (project owner): accept as
  dev-only.** Production builds from the migration chain on a fresh volume, the
  test suite uses in-memory SQLite created from the models, and CI never touches
  the dev file — so the drift is confined to one developer's local database and
  needs no rebuild. (If a rebuild is ever wanted, `scripts/copy_sqlite_to_postgres.py`
  copies data into a freshly migrated database of either dialect.)
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
- [x] **Call #27** resolved: `service_level='emergency'` (the last orphaned emergency-as-service-level) set to NULL, matching its outbound pair #26. The emergency nature stays on #26 (`call_type='emergency'`) and in the note.
- [x] Empty-string service levels normalized to NULL — 3 calls (ids 1, 7, 8) and 3 patients (1, 5, 12). The column now has one 'empty' form (NULL), matching the 62 patients already on NULL. Dev-DB only (not in the repo); backup taken.
- [x] **Vehicle multi-capability drives assignment suitability.** Vehicles already
  stored multiple `capabilities` (model + a picker in `VehicleFormPage`), but nothing
  used them — suitability was a single hardcoded ALS-vs-BLS check on the shift's
  `unit_type`. New `utils/capability_match.py` is the one source of truth: a unit's
  effective capabilities come from its linked **vehicle** (`DailyCrewUnit.vehicle`,
  relationship added; falls back to `unit_type` for legacy shifts), and
  `assignment_mismatch(unit, call)` decides "can this unit serve this call?" —
  **tiered care** (CCT⊇ALS⊇BLS; BLS-4/6 = BLS) plus **exact specials** (Bariatric /
  Stretcher / Wheelchair). Used in dispatch (assign → `call_als_on_bls` warning,
  generalized; the board stamps `mismatch` per assigned call) and the calendar
  (mismatch → critical severity + `mismatchReason`). Warn-only — never blocks.
  `AssignedCallCard` shows a warning badge with the reason. `test_capability_match`
  (18), `test_capability_dispatch` (4), calendar (+1); `AssignedCallCard.test.jsx`
  (2). Backend 844, frontend 426. Verified live (a BLS-only vehicle on an ALS call
  shows `mismatch: "BLS unit for an ALS call"` on the board).
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
- [x] **Leave balances / PTO accrual / holiday policy.** A real PTO system behind
  the leave module. The balance is a **ledger** (`PtoLedgerEntry` — sum of deltas,
  never a stored number, so accruals/spends/carryover/corrections are all auditable
  and reversible), plus a per-org **`Holiday`** calendar and a per-employee annual
  allotment (`Employee.pto_annual_days`, else the org default). Engine `utils/pto.py`:
  **monthly accrual** (annual/12, idempotent `accrue_through` with a year-end
  **carryover cap**), holiday+weekend-aware `business_days`, and PTO-type-gated
  deduction/reversal (vacation + personal draw; a partial day = 0.5). Approving such
  a leave spends days (**over-draw is advisory, never blocked** — the balance may go
  negative with a warning); denying/cancelling/deleting an approved one gives them
  back. APIs: `/api/pto` (balance/ledger, run-accrual, adjust — HR), `/api/holidays`
  (HR write / staff read), portal `/me/pto`; org PTO defaults via `/api/tenant/org`.
  UI: an HR **PTO tab** in the employee workspace (balance, ledger, run-accrual,
  adjust), a review-time over-draw warning, the employee's balance in the portal,
  a **Holidays** admin and **PTO defaults** in Settings. Migration `e8a6c2f419d7`.
  `test_pto.py` (12), `test_pto_routes.py` (9), `test_holidays.py` (6), portal (+1);
  `EmployeePtoTab`/`HolidaySettings` frontend tests. Backend 871 / frontend 432.
  Verified live: accrual → balance; a holiday inside a vacation is free; over-budget
  approval warns; cancel restores.

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

## Navigation / IA follow-ups (planned)

The two-level navigation, the Calls & Scheduling / Fleet & Crews / Employees hubs
and the role-aware dashboard shipped. These are the deliberately-deferred parts:

- [x] **Employee profile — Employment tab.** An append-only employment timeline
  per employee — hires, position/status/pay changes, terminations, rehires and
  notes, each with an effective date and recorder attribution. The Employee row
  still holds the *current* position/status; this records how it got there, so a
  correction is a delete, not an edit. `EmploymentEvent` model + migration
  `c4d9f2a17b60`; `GET/POST /api/employees/<id>/employment` +
  `DELETE /employment/<id>` (admin/supervisor/HR, audited). `EmployeeEmploymentTab`
  slots in after Overview. `test_employment.py` (13) + `EmployeeEmploymentTab.test.jsx`
  (5). Verified end to end on the running app (create, newest-first order, delete)
- [x] **Employee profile — Warnings/disciplinary tab.** An append-only HR record
  of verbal/written/final warnings, suspensions, corrective actions and notes,
  each with a date, optional severity and subject, and an acknowledgement flag
  (the one field that flips after issuance). Narrower than the rest of the
  employee surface — **admin/HR only**, so a supervisor who can open the
  workspace still cannot read or write it, and the tab is hidden from them.
  `DisciplinaryAction` model + migration `a7e3f1c92d48`;
  `GET/POST /api/employees/<id>/disciplinary`, `PATCH/DELETE /disciplinary/<id>`
  (audited, details kept out of the audit trail). `EmployeeDisciplinaryTab`.
  `test_disciplinary.py` (15) + `EmployeeDisciplinaryTab.test.jsx` (5). Verified
  end to end (create, severity, acknowledge toggle, delete; tab hidden for a
  supervisor). Follow-up if wanted: whether supervisors should see it
- [x] **Reports / Analytics section.** Operational reports over a date range —
  call volume, outcome mix (completion/cancellation rates) and service-level
  split, a per-day bar chart, and a CSV export for billing/insurance/audit
  (covers ROADMAP 5.3). `GET /api/reports/calls` + `/calls/export`, admin/
  supervisor only. Lives under Management → Analytics alongside the Supervisor
  Dashboard. `test_reports.py` (17) + `reportsApi.test.js`. Verified end to end
  on the running app.
  - [x] Follow-up: **fleet-utilisation** and **staff-hours** reports, as tabs on
    the same page sharing the date range. `GET /api/reports/utilization` (crew
    units on duty per day against the calls they carried — unit-days, calls/unit,
    assigned rate; admin/supervisor) and `GET /api/reports/hours` + `/hours/export`
    (worked hours per employee from approved time entries, reusing payroll's
    net-minutes maths; admin/supervisor/**hr**, since it is payroll-shaped). The
    page guards each view on which report its loaded data belongs to, so a tab
    switch never renders one report's shape against another's payload (fixed a
    crash caught in live testing). `test_reports.py` (+7), `reportsApi.test.js`
    (+2), `ReportsPage.test.jsx` (4). Verified end to end on the running app
    (utilisation 15 unit-days/690 calls; hours 66.85h across 2 staff)
- [x] **Dashboard customization** — per-user `settings.dashboard`: hide dashboard
  cards (Today's board, My tasks, Shortcuts — "Needs attention" always shows) and
  pick/reorder the shortcut tiles (`quickLinks` null = role default, else an
  ordered path list, capped at 8). `QUICK_LINKS_BY_ROLE` moved to
  `config/dashboardDefaults.js` so HomePage and the editor share one source;
  editor lives in the Settings page (`DashboardSettings`). Backend validates the
  `dashboard` section on PATCH. `test_settings.py` (8), `dashboardDefaults.test.js`
  (5), `DashboardSettings.test.jsx` (7). Verified end to end (hid two cards,
  removed + reordered shortcuts, confirmed on the dashboard)
- [x] **Badges beyond the four queues.** `/api/operations/attention` now also
  returns `tasks` (the caller's own overdue / due-today open tasks, scoped like
  the Tasks "mine" filter) and `compliance` (active employees with a certification
  expired or within 14 days — admin/supervisor/HR only). Wired via `badgeKey` on
  the `/tasks` and `/compliance` routes, so they flow through the existing
  sidebar badge mechanism. `test_attention_badges.py` (5). Verified live — both
  badges render in the sidebar
- [x] **Employee portal (v1).** New `employee` login role with an isolated,
  self-scoped area: My Schedule (shifts), My Tasks (view + mark In Progress /
  Waiting / Done), My Leave (list + request), My Profile (certs, read-only).
  Built to fail closed — `require_role` denies the role everywhere by default, so
  all self-service flows through one `/api/portal` blueprint that resolves "me"
  from the session and never takes an id from the client. Employees are redirected
  out of the ops app (`PortalLayout`, no ops sidebar); admins create/link a portal
  login in User management. Demo login `jcarter` / `employee`. `routes/portal_routes.py`,
  `utils/employee_shifts.py` (shared with the HR schedule tab), `pages/portal/`.
  `test_portal.py` + `PortalPage.test.jsx`. Verified end to end on the running app.
- [x] **Employee portal — phase 2.** My Hours (recent time entries + total) with
  session-based clock in / out, and My Documents (own licenses/certs, read-only,
  download own file only). Clock logic extracted to `utils/time_clock.py` and
  shared with the PIN kiosk so both open/close a `TimeEntry` the same way; the
  document file route is scoped to the caller's own docs (another's is a 404).
  Demo data gives `jcarter` closed shifts + a license. `test_portal.py` (+5),
  `PortalPage.test.jsx` (+2). Verified end to end (clocked in/out, viewed hours
  and a document on the running app).
  - [x] Follow-up: **the review decision surfaced back to the employee.** My Leave
    gains a Decision column — who approved/denied it, when, and the reviewer's note
    to the employee — via a new `to_dict("self")` visibility that adds the review
    trail and the employee's own real leave type + reason, but never HR's
    `private_notes` (nor the raw reviewer/submitter user ids). Pending reads as
    "Awaiting review". `test_portal.py` (+2, pinning that `privateNotes` never
    reaches the portal), `PortalPage.test.jsx` (+1)
- [x] **Collapsed-rail flyout submenus — decided: not building.** Clicking a hub
  on the collapsed rail already expands the sidebar and opens it, so the capability
  is not lost. A hover/focus flyout would need its own touch, keyboard and
  screen-reader handling for little gain — the project owner chose to leave it out.
- [x] **Day Closeout permission — decided.** Closing the operational day stays
  open to dispatchers (`hasDispatchAccess`: admin/supervisor/dispatcher). The
  dispatcher runs the day, so signing it off is part of that job; restricting it
  to supervisors would have removed a capability they already use and left the
  handoff waiting on someone who was not there. Decided by the project owner,
  2026-07-23 — no code change needed, the guard already matched.

## P4 — Production hardening (authentication done; rest planned)

**Done — session authentication, CORS, secrets:**

- [x] Server-side session cookies replace the `X-User-*` headers the server used
  to believe. Signed with `SECRET_KEY`, `HttpOnly`, `SameSite=Lax`, `Secure`
  under `EMS_ENV=production`. Headers are inert and a test pins that
- [x] `/api/auth/login` starts a session, `/logout` ends it, `/me` restores it
  after a reload. Session id is regenerated on login (session fixation)
- [x] **Default-deny for `/api/`** — a route requires a session unless named in
  `PUBLIC_ENDPOINTS`, so a new route is protected by omission
- [x] **Closed: user administration was entirely ungated** — an anonymous POST
  could create an admin account
- [x] **Closed: 74 routes had no gate**, leaking ~22KB of patient records and
  ~22KB of call records (PHI) to anonymous callers, plus employees and payroll
- [x] CORS narrowed from "any origin" to an explicit allowlist with credentials
- [x] `SECRET_KEY` from the environment; refuses to start under
  `EMS_ENV=production` without one, and generates a per-process key in dev
- [x] All 505 backend tests converted to sign in for real, so the auth path is
  exercised rather than bypassed

**Still open:**

- [x] CSRF protection — per-session token echoed in an X-CSRF-Token header on every mutation, delivered via the login/me response (in-memory) with a same-origin cookie fallback, attached by a fetch interceptor. Forged cross-site POST -> 403. Verified end to end on the running app; test_security.py + csrf.test.js
- [x] Password **complexity** on account create/edit (≥10 chars, letter, number,
  not the username); login already rate-limited (10/min). 11 tests in
  `test_auth.py`.
  - [x] **Password expiry / rotation.** `User.password_changed_at` (migration
    `a4d8b1f0c273`, existing rows backfilled to now so the clock starts, not
    instantly expired) plus `Config.PASSWORD_MAX_AGE_DAYS` — **0 disables it**, the
    default, so dev/CI and existing deployments are unchanged; set e.g. 90 in prod.
    When enabled, the auth guard locks an expired session to just change-password /
    `/me` / logout (403 `code: password_expired` everywhere else), the login/`/me`
    payload carries `passwordExpired`, and the SPA renders a forced change screen
    until it clears. Self-service `POST /api/auth/change-password` verifies the
    current password, enforces the strength policy, and rejects reuse of the
    current one; `password_changed_at` is stamped on every password set (create,
    admin edit, self-change). `test_password_rotation.py` (7),
    `ChangePasswordPage.test.jsx` (4). Verified live (login carries the flag; wrong
    current → 403, weak new → 400).
  - [x] **Password history (no reuse of the last N).** `PasswordHistory` (migration
    `b7c2e94f10a8`, existing users backfilled with their current hash) records every
    password set — create, admin edit, self-change — pruned to a 24-entry bound.
    `Config.PASSWORD_HISTORY_DEPTH` (0 = off, the default; a change still refuses the
    *current* password regardless) makes change-password reject a new password
    matching any of the last N stored hashes. Recording is always on, so raising the
    depth later works against the history already kept. `test_password_rotation.py`
    (+3). Still open: a breach-corpus (HaveIBeenPwned) check — needs an external
    lookup, so out of scope for the self-contained app
- [x] Server-side revocation for the common case: the user is re-validated
  against the DB every request, so disable/delete/role-change takes effect on the
  next request (not at cookie expiry).
  - [x] Follow-up: **global 401-interceptor** — a second `window.fetch` wrapper
    (`api/sessionExpiry.js`, layered over the CSRF one) watches every API response
    and, on a 401 from a revoked session, drops the local session so the router
    sends the tab to `/login` at once instead of on the next navigation/reload.
    Exempts login / `/me` / logout (a 401 there is expected, not a revocation),
    fires once across a burst of concurrent 401s, and re-arms on the next login.
    `sessionExpiry.test.js` (7). Verified live (killed the session server-side →
    the next API call bounced the tab straight to the login form)
  - [x] **Per-device session revocation.** A `UserSession` registry (migration
    `c5e1a83d6b47`) gives each login a random `sid` (also in the cookie) with its
    device's user-agent and a throttled last-seen; the auth guard checks the sid is
    present and not revoked every request, so revoking one row signs that device out
    on its next call without disturbing the others. `GET /api/auth/sessions` lists
    the caller's own devices (current flagged), `DELETE /api/auth/sessions/<id>`
    revokes one (scoped to the caller — another user's id is a 404), and
    `POST /api/auth/sessions/revoke-others` is the "sign out everywhere else" button;
    logout revokes the current row. Settings gains an **Active sessions** panel.
    `test_sessions.py` (7), `ActiveSessions.test.jsx` (4). Verified live (two devices
    → revoke one → its next request 401, the other keeps working). Pre-existing
    cookie sessions carry no sid and are asked to sign in once after the upgrade.
- [x] **Audit role correctness per route.** All 142 routes enumerated against
  their guard; the "any signed-in" ones checked against the documented policy.
  Tightened patients (HR out), payroll + pay-config (dispatcher out), employee
  detail/mutations (dispatcher out; list stays open for crew dropdowns),
  employee-document list, and analytics; and stopped the kiosk PIN travelling in
  roster payloads. 17 new boundary tests in `tests/test_security.py`. See
  `docs/PRODUCTION_READINESS.md` → Authentication for the table and the two
  residual findings below.
- [x] **Resolved: calls exclude HR.** The blueprint constant had included `hr`,
  contradicting the policy and the `/calls` guard. Removed; the three routes that
  relied only on the global guard are now gated too. HR gets 403 on all call
  routes; no HR flow used them.
- [x] **Resolved: time-entry management excludes dispatcher** (admin/supervisor/
  hr, matching payroll). Only the Employee Workspace Time & Pay tab reaches them;
  kiosk clock-in stays public. 9 new tests in `test_security.py`.
- [x] **Secrets management.** `config.py._secret(name)` reads `{NAME}_FILE` (a
  mounted Docker/Kubernetes secret) before the `{NAME}` env var, so `SECRET_KEY`
  and the `DATABASE_URL` (which carries the DB password) can stay out of the
  process environment. Postgres's own `POSTGRES_PASSWORD_FILE` is supported by its
  image. `test_config.py` (5) pins file-over-env precedence; verified the app boots
  in production mode from a `SECRET_KEY_FILE`.
  - [x] **Key rotation.** `SECRET_KEY_FALLBACKS` (Flask ≥3.1) — old keys still verify
    a cookie but never sign a new one — from `SECRET_KEY_FALLBACKS_FILE` (one per
    line) or the comma-separated env var. Rotate by moving the outgoing key into the
    fallbacks, then dropping it after the session lifetime; no forced sign-out.
    `test_secret_rotation.py` (3); runbook in PRODUCTION_READINESS → Secrets.
- [~] **Security review — dependency audit done.** `pip-audit` + `npm audit`:
  fixed `postcss` (→8.5.25, build-time path traversal) and `pytest` (→9.0.3,
  test-only; suite re-verified). Assessed and accepted with rationale (see
  PRODUCTION_READINESS → Security review): `react-router` (RSC-mode CSRF — not
  exploitable in a client-only SPA, only a breaking downgrade offered) and
  `brace-expansion` (no patch published; dev-toolchain only). **File uploads
  hardened:** document files now download-only + `nosniff` (was inline → stored
  XSS, since the type check trusts the spoofable client Content-Type while the
  file kept its original extension), plus a framework `MAX_CONTENT_LENGTH` (413
  before buffering). `test_upload_security.py` (3). **Rate limiting extended:** the
  PIN-gated kiosk endpoints (4-digit PIN, no session → brute-forceable) are now
  capped 10/min keyed by employee+IP, so one person's PIN can't be brute-forced
  while a shared kiosk still serves many employees. `test_rate_limit.py` (2).
  **Authorization pass done:** mapped all 169 routes to their gates and audited the
  38 session-only ones + id routes for IDOR. Fixed three gaps — notification
  endpoints trusted a client `user_id` (read/modify anyone's notifications & prefs
  → now session-scoped), `/api/crew-presets` had no role gate (→ crew roles), and
  `GET /api/employees` leaked the roster to the new `employee` role (→ staff roles
  only). `test_authz_review.py` (8) + portal lockout.
  - [x] **Tenant-isolation review** (done now that isolation is active). Enumerated
    every route that loads a child row without its own `org_id` by a client id, and
    found six route families that reached the child directly instead of through its
    org-owning parent — a cross-org IDOR since the global filter cannot scope an
    org-less row: employment-event delete, disciplinary PATCH/DELETE, vehicle
    maintenance PATCH, the three call-assignment lifecycle routes, and patient
    alert/contact PUT/DELETE/resolve. Each now resolves through an org-filtered
    parent (employee / vehicle / call / patient) and returns 404 cross-org.
    `test_tenant_isolation.py` (+5, red before the fix). Org-scoped `.get(pk)` was
    confirmed correctly filtered (the leaks were only the org-less children)

- [x] **PostgreSQL.** The app runs on Postgres via a `postgresql+psycopg://`
  `DATABASE_URL` (psycopg 3, in `requirements-prod.txt`); no code change — the URI
  already drives `SQLALCHEMY_DATABASE_URI`. `docker-compose.prod.yml` now includes
  a `postgres:16` service (health-gated) and points the backend at it; the prod
  image's migrations run against it on startup. Verified end to end: all 26
  migrations apply on Postgres, seed + ORM read-back work, and a login through the
  full prod stack (Postgres → Gunicorn → Nginx) succeeds with the data confirmed in
  Postgres. Dev/CI stay on SQLite.
  - [x] Follow-up: **SQLite→Postgres data-copy script**
    (`scripts/copy_sqlite_to_postgres.py`) for carrying an existing SQLite
    deployment's data over. Schema-driven and Core-level (so the ORM tenant events
    never fire and rows land verbatim, org_id and all): copies every declared table
    in `db.metadata.sorted_tables` FK order, refuses a non-empty target unless
    `--force` (which does a clean reload, since copied rows keep their primary
    keys), and fast-forwards Postgres sequences past the copied max id. The target
    must already have the schema (`DATABASE_URL=<target> flask db upgrade`).
    `test_copy_db.py` (4, SQLite→SQLite with FK enforcement on the target). Verified
    on the real dev DB → a throwaway SQLite target: 6,280 rows across 32 tables, the
    non-empty guard and `--force` reload both confirmed
- [x] **Production Docker images.** `backend/Dockerfile.prod` (Gunicorn via
  `wsgi:app`, non-root user, gthread workers, migrations-then-serve) and
  `frontend/Dockerfile.prod` (multi-stage Node build → unprivileged Nginx serving
  the SPA and proxying `/api` same-origin). `docker-compose.prod.yml` wires them
  with `EMS_ENV=production` (real `SECRET_KEY` + Secure cookies required); the
  frontend resolves its API base to same-origin in a prod build
  (`src/api/config.js`), and a `SESSION_COOKIE_SECURE` override allows local HTTP
  smoke tests. CI builds both prod images and validates the prod compose. Still
  open: TLS termination, pinned base digests, Postgres in place of the volume
- [x] **Runtime tenant isolation.** Enforced globally at the ORM layer
  (`tenant.py`): a `do_orm_execute` hook filters every SELECT of an org-owned model
  by the caller's `org_id`, and a `before_flush` hook stamps it on new rows — so no
  route or query change is needed and a missed filter can't leak. The current org
  is set by the auth guard from the session; with no org context (CLI, seeding,
  existing tests) it's inert. `Task` gained `org_id` (the last top-level tenant
  entity without it); the 14 org-owned models live in `models.ORG_SCOPED_MODELS`;
  the `EmployeeDocument` child-by-id path resolves through a filtered employee
  lookup. Migration seeds a default org + backfills all rows. `test_tenant_isolation.py`
  (5); backend 737; migration + live cross-org isolation verified on the real DB.
  - [x] **Multi-tenancy v2 — subdomain login, per-org users, platform super-admin.**
    Each org is reached at its own subdomain (`acme.<BASE_DOMAIN>`); `utils/tenant_host.py`
    turns the Host into an org, and a bare host (localhost/apex) resolves to *no* org —
    the single-tenant, back-compatible path that keeps every existing test green.
    Usernames are now unique **per org** (migration `d9f4a2c81e60`: `uq_user_org_username`),
    and login is scoped to the subdomain's org. A `User.is_platform_admin` (NULL org)
    runs the cross-org **platform console** (`/api/platform`, `routes/platform_routes.py`):
    create an org + its first admin, rename/suspend it, reset an org admin; the auth
    guard confines a platform admin to that console on the platform host so their
    unfiltered reach never touches a tenant. The guard also **binds a session to its
    org's subdomain** and **locks out a suspended workspace**. `cli.py` gains
    `create-org` / `create-platform-admin`; the login screen greets the workspace
    (`GET /api/tenant/current`, public); an org admin edits their org in Settings
    (`GET/PATCH /api/tenant/org`); CORS reflects any `*.BASE_DOMAIN` origin. Tests:
    `test_tenant_host`/`test_multitenancy_login`/`test_multitenancy_session`/`test_platform`/`test_tenant_routes`
    (backend 820); `PlatformConsolePage`/`OrgSettings` frontend tests (frontend 424).
    Verified live: same username in two orgs resolves by subdomain; platform admin
    lists/creates/suspends orgs and cannot read a tenant endpoint; a suspended org's
    login is refused. Still open: org-scoped subdomain in prod needs DNS + a wildcard
    TLS cert (infra, not code); platform-admin impersonation was deliberately excluded
- [x] Structured logging — JSON in production / human-readable in dev, plus a PHI-safe request access log (method, path, status, duration, actor). `logging_config.py`, `test_logging.py` (7 tests)
- [x] **Backup strategy.** `scripts/backup-db.sh` (pg_dump → timestamped
  `backups/*.sql.gz`) and `scripts/restore-db.sh`. Both talk to the running `db`
  container directly by its Compose labels, so they need no app secrets and no DB
  password (pg_dump over the container's local socket). Dumps use `--clean
  --if-exists` so a restore lands on a non-empty DB. Verified the full cycle:
  seed → backup → delete all calls → restore → data back (51/51). Schedule from
  cron/systemd for real use.
- [x] **Metrics.** `GET /metrics` in Prometheus format (`metrics.py`): a request
  counter and latency histogram labelled by method, Flask endpoint (view name, not
  the raw path — no id cardinality, no id in a metric) and status; scrape + health
  excluded. `prometheus-client`. `test_metrics.py` (3); verified live. Still open:
  distributed tracing, alerting rules, log shipping (deployment concerns)

---

## Portfolio polish (P3-ish, independent)

- [x] **Seeded demo dataset for screenshots/walkthroughs** — `flask --app app
  seed-demo-data` builds a coherent world (`backend/demo_data.py`): 8 crew, 6
  patients, 4 vehicles, today's 3 crewed units, ~51 calls across the last week +
  today + upcoming (completed with lifecycle times, some assigned, some undated),
  4 tasks and a recurring huddle — all dated relative to today so it always reads
  current. Guarded against double-seeding; refuses a non-empty DB without
  `--force`. `test_demo_data.py` (3). Verified live: Dashboard, Dispatch Board and
  Reports all render cleanly on the seeded data
- [x] **Screenshots in README** — five flagship screens (Dashboard, Dispatch
  Board, Reports, Calendar, Compliance) captured from the seeded demo and embedded
  in the README. Reproducible: `frontend/scripts/capture-screenshots.mjs`
  (Playwright) logs in and shoots each route; `npm run screenshots`. Images in
  `docs/screenshots/`.
- [x] **Workflow GIF in README** — a recorded dispatcher walkthrough (dashboard →
  Dispatch Board → calendar) at `docs/workflow.gif`. Reproducible:
  `frontend/scripts/record-workflow-gif.mjs` (Playwright video → ffmpeg two-pass
  palette GIF); `npm run record-gif` (needs `ffmpeg` on PATH or `FFMPEG=…`).
- [x] Architecture diagram — two mermaid diagrams in the README (system layers + the auth/request flow), rendered and verified under mermaid 11 (GitHub's engine)
