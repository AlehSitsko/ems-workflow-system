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
range validation, backend role filtering, and per-day operational summaries; the
first two event sources (`scheduled_call` from Call, `crew_shift` from
DailyCrewUnit); month-cell readiness + a Day Operations drawer; and the Dispatch
Board Planning/Live/History date modes with linked call/unit selection.
**Remaining:** the additional derived sources below, Week/Agenda views, and saved
filters.

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
