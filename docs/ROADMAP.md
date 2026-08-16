# Roadmap

Honest status of the long-range plan. Historical detail of shipped work lives in
[COMPLETED_BLOCKS.md](COMPLETED_BLOCKS.md) and
[INFRASTRUCTURE_REPORT.md](INFRASTRUCTURE_REPORT.md); the active near-term slice is
in [../TODO.md](../TODO.md). Statuses: **Shipped** · **In progress** · **Deferred**
(intentionally not now) · **Planned** · **Out of scope**.

---

## Shipped

These earlier roadmap phases are implemented (see COMPLETED_BLOCKS / INFRASTRUCTURE_REPORT
for detail):

- **Stabilization foundation** — app factory, idempotent `seed-demo`, CI (now four
  jobs: backend, frontend, E2E, Docker prod-stack smoke), backend pytest + frontend
  Vitest + Playwright E2E.
- **Operational Calendar** — aggregated `GET /api/calendar/events` (all derived
  sources: calls, crew shifts, employee/patient birthdays, certifications, task
  dates, vehicle dates) with server-side role filtering; **Month / Week / Agenda**
  views; per-user display settings; **conflict detection** (shift time-overlap +
  double-booking, `test_calendar_conflicts.py`); manual `CalendarEvent` entries with
  visibility scopes, recurrence and ICS export.
- **Calendar operations** — recurring transport trips, Scheduling Inbox, confirmation
  round, estimated trip duration, day timeline, and a Close-Operational-Day workflow.
- **Operational taxonomy** — shared vocabulary + badges (qualification vs shift role,
  vehicle capabilities, service level).
- **Fleet management** — `Vehicle` identity/capabilities/compliance,
  `VehicleOdometerEntry`, `VehicleMaintenanceRecord`, shared document storage,
  `DailyCrewUnit.vehicle_id`, derived vehicle calendar events.
- **Leave, PTO & holidays** — `EmployeeLeaveRequest` with structural privacy, a PTO
  ledger + accrual engine, and org holidays (the earlier "deferred until business
  rules" balances/accrual are now built).
- **Reports & analytics** — `/api/reports/*` (calls, utilization, hours + CSV) and
  `/api/analytics/dispatchers`, computed with backend SQL aggregation.
- **Entity Workspaces** — `EntityWorkspace` with unsaved-changes guarding
  (`createHashRouter` data router + `useBlocker`); workspaces for Vehicles,
  Employees, Patients and Calls; PatientsPage decomposed into tabs/sections.
- **Reproducible Docker** — dev compose and a production stack (Postgres + Redis +
  Gunicorn + Nginx), both exercised in CI.
- **Production hardening** — session-cookie auth (replacing the old `X-User-*`
  headers), CSRF, password policy/history/expiry, per-device session revocation,
  invite-only onboarding, runtime multi-tenant isolation + subdomain multi-tenancy +
  platform console, organization recovery, field-level encryption at rest
  (fail-closed in production), a Local/S3 storage abstraction, a Redis realtime
  broker, structured logging and Prometheus metrics.

## In progress / partial

- **Analytics at scale** — reporting uses range-filtered SQL aggregation, but the
  Supervisor Dashboard still groups a bounded window in Python; a full move to
  indexed aggregation + operational-day rollups is only warranted at real volume.

## Planned

- **Wider field encryption** — hash `Employee.kiosk_pin`, then encrypt employee /
  patient contact PII, staged per [DATA_CLASSIFICATION.md](DATA_CLASSIFICATION.md).
- **Deployment hardening** — TLS termination in front of Nginx, a documented backup /
  disaster-recovery runbook, and live S3/MinIO verification + a local→S3 migration.

## Deferred (intentionally not now)

- **External calendar sync** — Google / Outlook two-way sync needs OAuth and a
  written privacy/security policy; patient information must never be exported without
  it. ICS **export** of manual events already ships.
- **Route optimization** — separate research effort.

## Out of scope

Full clinical ePCR, NEMSIS / state submission, insurance-claims processing,
HIPAA-grade production deployment, and live GPS / routing — see the README's
"Current Scope".
