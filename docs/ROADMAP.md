# Roadmap

Phased long-range plan. Each phase is a coherent stage, not a loose feature list.
Shipped work lives in [COMPLETED_BLOCKS.md](COMPLETED_BLOCKS.md); the active
near-term slice is in [../TODO.md](../TODO.md). Phases are sequential — the
Calendar MVP (Phase 2) does not start until stabilization (Phase 1) lands, and
the reproducible Docker environment (Phase 3) follows the Calendar MVP.

---

## Phase 1 — Stabilization foundation (in progress)

Make the codebase testable, reproducible, and honestly documented before adding
features.

- Documentation cleanup (README / TODO / ROADMAP / TESTING / COMPLETED_BLOCKS in
  sync with the code) — **done**
- Flask application factory (`create_app`, `config.py`, `extensions.py`,
  `cli.py`); no import-time side effects — **done**
- Remove import-time demo seeding; explicit idempotent `seed-demo` CLI — **done**
- GitHub Actions CI (backend compile+pytest, frontend lint+test+build) — **done**
- Backend tests: auth, tasks, **patients**, **payroll** (isolated pytest) — **done**
- Frontend test foundation: Vitest + RTL + jsdom, utility + component tests — **done**
- PatientsPage decomposition into components/hooks — **in progress** (phase 1 of 4
  done; see TODO.md P0)

## Phase 2 — Functional Calendar MVP (in progress)

A single read-only, role-aware operational calendar that aggregates data the
system already holds. Automatic events are **derived**, not copied into a new
table.

**Shipped so far:** the page scaffold (month grid, weekend/US-holiday
highlighting, navigation, legend); `GET /api/calendar/events?start=&end=` with
range validation, backend role filtering, and per-day operational summaries;
month-cell readiness + a Day Operations drawer; the Dispatch Board
Planning/Live/History date modes with linked call/unit selection; **all seven
event sources** (scheduled_call, crew_shift, patient/employee birthdays,
certification expirations, task due dates, vehicle dates) with per-source role
access; **Task participants + assign-to-all**; and **per-user calendar display
settings** (source toggles, week start, density, weekend/holiday toggles).
**Remaining:** Week/Agenda views and the deferred conflict checks (shift
time-overlap, vehicle out-of-service).

**Event sources (derived):** employee birthdays (Employee), patient birthdays
(Patient), certification expirations (CPR/EVOC/EMT/Paramedic/document fields),
task due/start dates (Task), crew shifts (DailyCrewUnit), scheduled calls (Call),
vehicle expiration/maintenance (Vehicle — existing fields only).

**Backend:** `GET /api/calendar/events?start=&end=` that (1) resolves the actor,
(2) determines allowed event types, (3) queries only the requested range,
(4) applies role filtering, (5) strips inaccessible fields, (6) returns a unified
event contract. Filtering is server-side — never load everything and hide on the
client.

**Access matrix:**

| Source | Admin | Supervisor | Dispatcher | HR |
|---|---|---|---|---|
| Employee birthdays | yes | yes | yes | yes |
| Patient birthdays | yes | yes | yes | no |
| Certifications | yes | yes | as permitted | yes |
| Tasks | yes | yes | permitted only | HR tasks |
| Crew shifts | yes | yes | yes | no |
| Scheduled calls | yes | yes | yes | no |
| Vehicle events | yes | yes | yes | no |
| Payroll / HR-private | yes | no | no | yes |

Dispatcher never sees payroll/salary/HR-private data; HR never sees patient data
or calls. A future Worker role sees only their own shifts/tasks/certs.

**Per-source rules (MVP):**
- Patient birthday cards show only a minimized name (e.g. `John D. — Birthday`) —
  never insurance, full address, diagnoses, medical notes, or sensitive alerts.
  Consider limiting to active / recently-active patients so the calendar isn't
  flooded with stale records.
- Employee birthdays show name + birthday indicator; no age/birth year by default
  (future privacy setting).
- Certification severity tiers: >60d informational, 31–60d upcoming, 15–30d
  warning, 1–14d urgent, expired critical. Never rely on color alone.
- Tasks reuse the existing Task permission matrix; due date (and start date if
  present) by default, other dates behind filters.
- Calls (admin/supervisor/dispatcher only): pickup time, minimized patient name,
  service level, assigned unit, status, unassigned/delay warnings. The calendar
  does not replace the Dispatch Board.
- Vehicles: inspection/registration/insurance expiration, maintenance,
  out-of-service, equipment inspection — only fields that already exist (add
  migrations before surfacing new ones).

**Frontend:** month / week / agenda views, event-type badges, source links,
filters, loading/empty/error states, saved user filter preferences. The page
scaffold (month grid, weekend/holiday highlighting, US federal holidays,
navigation, legend) lands first as a static shell; the derived event API and
role filtering follow.

## Phase 3 — Reproducible development environment (planned)

Containerize the dev/demo setup. **Development convenience only — not a
production deployment.**

- `backend/Dockerfile` (Flask dev server, migrations on startup)
- `frontend/Dockerfile` (Vite dev server, hot reload, API URL via env)
- `docker-compose.yml`, `.dockerignore`, `.env.example`
- Named SQLite volume; optional explicit `seed-demo` step (never automatic)
- Compose healthcheck against the existing `/api/health`
- Docker setup guide + a CI job that builds both images
- Explicitly **not** in this phase: PostgreSQL, Redis, Celery, Nginx, Kubernetes,
  production secrets, cloud deploy.

## Phase 4 — Calendar operations (planned)

Deferred deliberately — **not** part of the current Calendar slice:

- Recurring patient transportation; linked outbound/return trips
- Scheduling Inbox for calls without a date/time yet
- Estimated trip duration + planned end time
- Day / Agenda operational timeline; planned-vs-actual time comparison
- Day handoff summary; a "Close Operational Day" workflow
- Manual events via a new `CalendarEvent` model (title, description, type,
  start/end, all-day, visibility_scope, created_by, optional
  employee/patient/task/vehicle/crew links, location, priority, status,
  recurrence_rule, reminder_minutes, archive flags)
- Visibility scopes (company / operations / management / HR / patient-operations
  / private / custom-later), participants
- Reminders, notification integration, saved views, conflict detection
- Route optimization — separate future research only

## Phase 4b — Operational taxonomy & visual classification (planned, next)

One canonical vocabulary before more colour/fleet work — today unit and
service-level strings are duplicated as ad-hoc arrays across components.

- Central constants + normalizers shared by backend and frontend under one
  documented contract (no independently maintained string lists)
- Distinguish **employee qualification** (Driver-only / EMT / Paramedic / future
  clinical) from **assigned shift role** (Driver / Medical / Assist) — a
  paramedic may work a shift as Driver; qualification colour must not imply the
  shift role
- **Physical vehicle capabilities** (BLS/ALS/bariatric/wheelchair/stretcher/CCT/
  support) modelled as capabilities, not a single `unit_type` string
- **Daily operational unit type** (BLS, ALS, BLS-4, BLS-6, Assist, CCT, Bariatric)
- **Patient default transport requirement** vs **call service level**:
  `Patient.default_service_level` is only a default/preference; `Call.service_level`
  is the actual requirement for that trip, inherited at creation and editable.
  Changing a patient default must **never** rewrite existing calls
- Legacy value migration plan (`bls` vs `BLS`, `BLS-4` vs `BLS4`, `BARI` vs
  `Bariatric`, `emergency` as call type/priority — not a service level,
  `stretcher` classification). Unknown legacy values are reported, never silently
  dropped
- Visual system: semantic theme tokens + reusable `EmployeeAvatar`,
  `QualificationBadge`, `AssignedRoleBadge`, `ServiceLevelBadge`,
  `VehicleTypeBadge`, plus a legend. Colour is never the only signal (icon +
  text + tooltip/aria); ALS-on-BLS stays an explicit warning, not a hue

## Phase 4c — Fleet Management (planned)

Split **physical assets** from **daily operational deployment**.

- `Vehicle` grows identity (VIN, plate + state, year/make/model/colour,
  ownership), capabilities, active + operational status, compliance dates
- `VehicleOdometerEntry` (history — never a single mutable mileage number) and
  `VehicleMaintenanceRecord` (type, status, scheduled/completed, odometer,
  vendor, cost)
- Vehicle documents via a **shared storage/service layer** with employee
  documents — shared storage, separate permissions (do not clone EmployeeDocument)
- `DailyCrewUnit.vehicle_id → Vehicle.id`; `truck_number` kept for backward
  compatibility, becoming a snapshot/display field. Legacy match by unit_number
  with an unresolved-records migration report — ambiguous values are never
  auto-linked
- Shift creation picks a Vehicle; unit type validated against vehicle
  capabilities; inactive/out-of-service/expired vehicles need an explicit
  override workflow
- Access: create/edit/delete admin+supervisor; dispatcher gets availability +
  warnings only; HR none by default. Retire/archive instead of hard delete when
  history exists
- Calendar gets derived vehicle events (inspection/registration/insurance,
  scheduled + completed maintenance, out-of-service ranges). Odometer readings
  are **not** calendar events. Readiness: out-of-service/expired ⇒ critical,
  upcoming maintenance ⇒ warning

## Phase 4d — Employee leave / time-off (planned)

- Dedicated `EmployeeLeaveRequest` model (not a free-text calendar event):
  employee, type, start/end, partial-day, status, reason, private notes,
  submitted/reviewed metadata, org_id foundation
- Types: Vacation/PTO, Sick, Unpaid, Personal, Medical, Bereavement, Training,
  Administrative, Other. Statuses: Draft, Pending, Approved, Denied, Cancelled
- **Privacy is structural:** dispatchers see only *unavailable*; medical/private
  reasons and private notes never enter the shared calendar payload; HR/admin see
  detail per permission; supervisor sees scheduling-relevant fields only
- Approved leave ⇒ derived range calendar event + strong staffing conflict in the
  planner; pending ⇒ soft warning for permitted roles only; denied/cancelled ⇒ no
  effect. Multi-day ranges stored as one row, not per-day
- Overlap validation now; leave balances / PTO accrual / holiday policy
  explicitly deferred until business rules are agreed

## Phase 4e — Calendar operational analytics (planned)

Distinguish **intake calls** from **trips** — never use "calls" for both.

- Metrics: Intake Calls Received (by `date_of_call`/`received_at`, never
  `trip_date`), Trips Scheduled, Trips Assigned, Trips Completed (decide and
  document scheduled-for-day vs actually-completed-on-day — both are useful),
  Trips Cancelled, Trips Remaining, missing-information count, average quality
  score, intake by dispatcher
- Later: late pickup, assignment delay, on-scene/transport time, unit
  utilization, overtime, ALS/BLS mismatch, reassignment count
- Computed **on the backend** with SQL aggregates over the range (no per-day
  query, no shipping all calls to the client). Month cell stays compact
  (scheduled / completed / unassigned / readiness); full analytics lives on the
  Day Operations workspace. Split events from metrics if the payload grows
- Per-user display settings for each metric; backend access control is
  independent of display settings

## Phase 4f — Entity Workspaces & UI levels (planned)

- Three UI levels: **Quick Peek** (drawer), **Quick Create/Edit** (drawer, short
  forms only), **Entity Workspace** (own route, tabs, documents, history,
  analytics, audit). No separate browser windows as primary UX
- Routes: `/fleet/vehicles/:vehicleId` (first reference implementation), then
  `/employees/:employeeId`, `/patients/:patientId`, later `/tasks/:taskId`,
  `/calls/:callId`, `/operations/days/:date`
- Workspaces support back-to-list with preserved filters/search/page, deep links,
  browser history, loading/error/not-found, permissions, tabs, unsaved-changes
  protection
- Drawer remains for calendar day quick view, dispatch quick intake, compact
  previews, filters/settings; confirmations stay modal
- Migrate gradually: Vehicles → Employees → Patients → Tasks/Calls

## Phase 4g — Analytics architecture (planned)

Supervisor Dashboard currently pulls up to ~2000 calls and groups them in Python
— acceptable for demo, poor at scale. Move to range-filtered SQL aggregation with
proper indexes, dispatcher IDs (not display names), and operational-day
summaries. No separate analytics DB; daily rollups only if real volumes demand it.

## Phase 5 — Operational improvements (planned)

- Call timeline improvements, assignment conflict warnings, shift coverage view,
  vehicle late-return alerts, reporting, worker portal, further Tasks features

## Phase 6 — Production hardening (planned)

- Secure backend auth (JWT/session replacing header-based `X-User-*`)
- PostgreSQL, production containers (Gunicorn/Nginx), deployment
- Object storage, backups, structured logging, monitoring
- Runtime tenant isolation (the `organization` schema exists but is inactive)
- Security review, secrets management, CORS restriction

---

## Recurrence & external sync (much later)

Advanced recurrence rules and ICS / Google / Outlook export are deliberately
deferred well beyond Phase 4. External calendar sync must never export patient
information without a separate, explicit privacy/security policy.
