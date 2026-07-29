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
- [ ] Participants, reminders, notification integration, saved views
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
- [ ] External (Google/Outlook) two-way sync — much later; must not export
  patient data without a separate privacy/security policy
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
- [x] **Call #27** resolved: `service_level='emergency'` (the last orphaned emergency-as-service-level) set to NULL, matching its outbound pair #26. The emergency nature stays on #26 (`call_type='emergency'`) and in the note.
- [x] Empty-string service levels normalized to NULL — 3 calls (ids 1, 7, 8) and 3 patients (1, 5, 12). The column now has one 'empty' form (NULL), matching the 62 patients already on NULL. Dev-DB only (not in the repo); backup taken.
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
  on the running app. Still open: time/payroll and dispatch-utilization reports
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
- [ ] **Employee portal.** No `employee` role exists in the app — the roles are
  admin / supervisor / dispatcher / hr. Self-service shifts, tasks and hours are
  a separate module, so no menu entry pretends otherwise
- [ ] **Collapsed-rail flyout submenus.** Clicking a hub on the collapsed rail
  expands the sidebar and opens it. A hover/focus flyout would need its own
  touch, keyboard and screen-reader handling for little gain
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
  `test_auth.py`. Still open: password expiry/rotation and a breach-corpus check
- [x] Server-side revocation for the common case: the user is re-validated
  against the DB every request, so disable/delete/role-change takes effect on the
  next request (not at cookie expiry). Still open: revoking one specific device's
  session (needs a session store with per-session ids), and a global frontend
  401-interceptor to redirect a mid-session-revoked tab to login instantly
  (today it redirects on the next navigation/reload via /me)
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
- [ ] Secrets management
- [ ] Full security review

- [ ] PostgreSQL migration
- [ ] Production Docker images (Gunicorn, Nginx, multi-stage frontend, non-root)
- [ ] Runtime tenant isolation (the `organization` schema exists but is inactive)
- [x] Structured logging — JSON in production / human-readable in dev, plus a PHI-safe request access log (method, path, status, duration, actor). `logging_config.py`, `test_logging.py` (7 tests)
- [ ] Backup strategy, monitoring (metrics/tracing/alerting), log shipping

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
- [ ] Screenshots + a short workflow GIF in README (seed with `seed-demo-data`
  first; flagship screens listed in the README "Screenshots" section)
- [x] Architecture diagram — two mermaid diagrams in the README (system layers + the auth/request flow), rendered and verified under mermaid 11 (GitHub's engine)
