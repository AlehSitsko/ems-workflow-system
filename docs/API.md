# Backend API Reference

All endpoints are JSON in / JSON out under the `/api/` prefix. This reference is
generated from the actual Flask routes; regenerate the counts and the route table
from the code rather than trusting a hand-typed number:

```powershell
# From backend/, with the venv active — list every /api route, method and rule:
python -c "from app import create_app; a=create_app({'TESTING':True,'SQLALCHEMY_DATABASE_URI':'sqlite:///:memory:'}); [print(sorted(m for m in r.methods if m not in ('HEAD','OPTIONS')), r.rule) for r in sorted(a.url_map.iter_rules(), key=lambda r:r.rule) if r.rule.startswith('/api/')]"
```

As of this document there are **31 Flask blueprints** and **203 `/api/` routes**
(plus `/` and `/metrics`).

## Authentication & authorization

Authentication is a **signed, server-side session cookie** — there is **no**
header-based identity. The old `X-User-Id` / `X-User-Role` / `X-User-Name` request
headers were removed; the server ignores them entirely and never trusts a
client-supplied identity.

- **Sign in:** `POST /api/auth/login` `{username, password}` starts a session and
  sets the cookie. The cookie is signed with `SECRET_KEY`, `HttpOnly`,
  `SameSite=Lax`, and `Secure` in production (`SESSION_COOKIE_SECURE`).
- **Who am I:** `GET /api/auth/me` returns the current user (or `401`).
- **Sign out:** `POST /api/auth/logout` ends the session.
- **Session registry:** each sign-in records a per-device `UserSession`.
  `GET /api/auth/sessions` lists them; `DELETE /api/auth/sessions/<id>` and
  `POST /api/auth/sessions/revoke-others` revoke them. Every request re-validates
  the user against the database, so disabling a user or changing their role takes
  effect on their **next request** (server-side revocation), not when the cookie
  expires.
- **CSRF:** a JS-readable `csrf_token` cookie is issued alongside the session. Every
  **mutating** request (`POST`/`PUT`/`PATCH`/`DELETE`) must echo it in the
  `X-CSRF-Token` header (the frontend fetch wrapper does this automatically). A
  missing/invalid token is rejected.
- **Global guard:** a `before_request` hook requires a valid session for **every**
  `/api/` route except a small allow-list of public endpoints (below). So a route
  with no explicit role decorator is still *session-guarded*, not open.
- **Roles:** `@require_role(...)` narrows a route to specific roles; the staff roles
  are `admin`, `supervisor`, `dispatcher`, `hr`, plus `employee` for the self-service
  portal. The platform console requires a **platform super-admin**
  (`@require_platform_admin`), an operator with no org of their own.
- **Tenancy:** the organisation is derived from the session (and subdomain), never
  from the client. Runtime tenant isolation (`tenant.py`) filters every org-scoped
  query, so cross-org access resolves to `404`, not another tenant's data.

### Status codes

| Code | Meaning |
|---|---|
| `400` | Validation error (bad/missing fields) |
| `401` | Not signed in / session invalid or revoked |
| `403` | Signed in but the role is not permitted |
| `404` | Not found — **including** a resource in another organisation |
| `409` | Conflict (e.g. optimistic-concurrency clash, already-exists, day closed) |
| `413` | Upload exceeds the size cap |
| `429` | Rate limited (e.g. login, kiosk PIN) |

### Guard legend for the tables below

- **public** — no session required (in the auth allow-list).
- **session** — any signed-in user (no role restriction).
- **role: …** — restricted to the listed roles.
- **platform** — platform super-admin only.

### Public endpoints (no session)

`POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/needs-setup`,
`POST /api/auth/setup` (desktop first-run only), `GET /api/health`,
`GET /api/tenant/current`, `GET /api/notifications/vapid-public-key`, the kiosk
endpoints (`/api/kiosk/*`, PIN-authenticated per action), invitation validate/accept
(`GET /api/invitations/accept/<token>`, `POST /api/invitations/accept`), and
emergency org recovery (`POST /api/org/recovery/redeem`). Everything else needs a
session.

---

## Authentication & sessions

| Method | Path | Guard | Purpose |
|---|---|---|---|
| POST | `/api/auth/login` | public | Sign in; set session + CSRF cookie |
| POST | `/api/auth/logout` | public | End the session |
| GET | `/api/auth/me` | session | Current user identity |
| GET | `/api/auth/needs-setup` | public | Desktop first-run: is the DB empty? |
| POST | `/api/auth/setup` | public | Desktop first-run: create the first admin (inert once any user exists) |
| POST | `/api/auth/change-password` | session | Change own password (policy + no-reuse history) |
| GET | `/api/auth/sessions` | session | List this user's device sessions |
| DELETE | `/api/auth/sessions/<id>` | session | Revoke one session |
| POST | `/api/auth/sessions/revoke-others` | session | Revoke all other sessions |

## Users (admin)

| Method | Path | Guard | Purpose |
|---|---|---|---|
| GET | `/api/auth/users` | role: admin | List org users |
| POST | `/api/auth/users` | role: admin | Create a user |
| PUT | `/api/auth/users/<id>` | role: admin | Update a user |
| PATCH | `/api/auth/users/<id>/toggle-active` | role: admin | Enable/disable a user |

## Invitations (invite-only onboarding)

| Method | Path | Guard | Purpose |
|---|---|---|---|
| GET | `/api/invitations` | role: admin | List invitations |
| POST | `/api/invitations` | role: admin | Create an invitation (org + role fixed server-side) |
| POST | `/api/invitations/<id>/revoke` | role: admin | Revoke an invitation |
| GET | `/api/invitations/accept/<token>` | public | Validate a token (hashed; one-time) |
| POST | `/api/invitations/accept` | public | Accept and create the account |

## Organizations & tenant

| Method | Path | Guard | Purpose |
|---|---|---|---|
| GET | `/api/tenant/current` | public | Resolve the workspace from the subdomain (login greeting) |
| GET | `/api/tenant/org` | role: admin | Read org settings |
| PATCH | `/api/tenant/org` | role: admin | Update org settings |

## Organization security & recovery

| Method | Path | Guard | Purpose |
|---|---|---|---|
| GET | `/api/org/security` | role: admin | Owner/admin counts, recovery-code status |
| POST | `/api/org/recovery-codes` | role: admin | Generate one-time recovery codes (shown once) |
| POST | `/api/org/owners` | role: admin | Grant ownership |
| POST | `/api/org/recovery/redeem` | public | Emergency: redeem a code, restore an admin/owner, revoke all org sessions |

## Platform console (super-admin)

| Method | Path | Guard | Purpose |
|---|---|---|---|
| GET | `/api/platform/orgs` | platform | List all organisations |
| POST | `/api/platform/orgs` | platform | Create an organisation |
| PATCH | `/api/platform/orgs/<id>` | platform | Update / suspend an organisation |
| POST | `/api/platform/orgs/<id>/reset-admin` | platform | Reset an org's admin |

## Employees & HR

| Method | Path | Guard | Purpose |
|---|---|---|---|
| GET | `/api/employees` | role: all staff | List employees |
| POST | `/api/employees` | role: admin, hr, supervisor | Create employee |
| GET/PUT/DELETE | `/api/employees/<id>` | role: admin, hr, supervisor | Read/update/delete employee |
| GET | `/api/employees/<id>/shifts` | role: admin, hr, supervisor | Employee's crew shifts |
| GET/POST | `/api/employees/<id>/employment` | role: admin, hr, supervisor | Employment-history timeline |
| DELETE | `/api/employees/employment/<event_id>` | role: admin, hr, supervisor | Remove an employment event |
| GET/POST | `/api/employees/<id>/disciplinary` | role: admin, hr | Disciplinary records |
| PATCH/DELETE | `/api/employees/disciplinary/<action_id>` | role: admin, hr | Update/remove a disciplinary action |

## Employee documents

| Method | Path | Guard | Purpose |
|---|---|---|---|
| GET/POST | `/api/employees/<id>/documents` | role: admin, hr, supervisor | List / upload documents (content-validated, size-capped) |
| GET/PATCH/DELETE | `/api/documents/<doc_id>` | role: admin, hr, supervisor | Read/update/delete a document |
| GET | `/api/documents/<doc_id>/file` | role: admin, hr, supervisor | Download the file (attachment, `nosniff`; audited) |
| GET | `/api/documents/compliance` | role: admin, hr, supervisor | Compliance matrix across employees × doc types |

## Time entries, kiosk & pay config

| Method | Path | Guard | Purpose |
|---|---|---|---|
| GET/POST | `/api/employees/<id>/time-entries` | role: admin, hr, supervisor | List / add time entries |
| PATCH/DELETE | `/api/time-entries/<entry_id>` | role: admin, hr, supervisor | Edit / remove a time entry |
| GET/PUT | `/api/employees/<id>/pay-config` | role: admin, hr, supervisor | Read / set pay configuration |
| GET | `/api/kiosk/employees` | public | Kiosk: list clock-in candidates |
| POST | `/api/kiosk/verify-pin` | public | Kiosk: verify an employee PIN (rate-limited) |
| POST | `/api/kiosk/clock-in` · `/api/kiosk/clock-out` | public | Kiosk: clock in/out (PIN per action) |
| GET | `/api/kiosk/status/<employee_id>` | public | Kiosk: current clock state |

## Payroll

| Method | Path | Guard | Purpose |
|---|---|---|---|
| GET/POST | `/api/payroll/periods` | role: admin, hr, supervisor | List / create pay periods |
| GET/PATCH/DELETE | `/api/payroll/periods/<id>` | role: admin, hr, supervisor | Read/update/delete a period |
| PATCH | `/api/payroll/periods/<id>/status` | role: admin, hr, supervisor | Advance period status |
| GET | `/api/payroll/periods/<id>/summary` | role: admin, hr, supervisor | Period totals |
| GET | `/api/payroll/export` | role: admin, hr, supervisor | CSV / Gusto / ADP export |

## PTO, holidays & leave

| Method | Path | Guard | Purpose |
|---|---|---|---|
| GET | `/api/pto/employees/<id>` | role: admin, hr | Balance + ledger |
| POST | `/api/pto/employees/<id>/adjust` | role: admin, hr | Manual balance adjustment (audited) |
| POST | `/api/pto/run-accrual` | role: admin, hr | Accrue PTO through today (idempotent) |
| GET | `/api/holidays` | role: all staff | List org holidays |
| POST/DELETE | `/api/holidays` · `/api/holidays/<id>` | role: admin, hr | Create / delete a holiday |
| GET/POST | `/api/leave-requests` | role: (read) all except employee / (create) admin, hr, supervisor | List / create leave requests |
| GET | `/api/leave-requests/<id>` | role: admin, dispatcher, hr, supervisor | Read a request |
| PUT | `/api/leave-requests/<id>` | role: admin, hr | Edit a request |
| PATCH | `/api/leave-requests/<id>/decision` | role: admin, hr | Approve/deny (spends/returns PTO) |
| PATCH | `/api/leave-requests/<id>/cancel` | role: admin, hr | Cancel |
| DELETE | `/api/leave-requests/<id>` | role: admin | Delete |
| GET | `/api/leave-requests/unavailable` | role: admin, dispatcher, hr, supervisor | Unavailability calendar feed |

## Patients, contacts & alerts

| Method | Path | Guard | Purpose |
|---|---|---|---|
| GET/POST | `/api/patients` | role: admin, dispatcher, supervisor | List (search, incl. blind-index member-id) / create |
| GET/PUT/DELETE | `/api/patient/<id>` | role: admin, dispatcher, supervisor | Read/update/archive a patient (PHI fields decrypted on read) |
| POST | `/api/patient/<id>/restore` | role: admin, dispatcher, supervisor | Un-archive |
| GET | `/api/patient/<id>/calls` | role: admin, dispatcher, supervisor | Trip history |
| GET | `/api/patient/<id>/last-trip-template` | role: admin, dispatcher, supervisor | Prefill from the last trip |
| GET/POST | `/api/patient/<id>/contacts` | role: admin, dispatcher, supervisor | List / add contacts |
| PUT/DELETE | `/api/patient/<id>/contacts/<contact_id>` | role: admin, dispatcher, supervisor | Edit / remove a contact |
| GET/POST | `/api/patient/<id>/alerts` | role: admin, dispatcher, supervisor | List / add alerts |
| PUT | `/api/patient/<id>/alerts/<alert_id>` | role: admin, dispatcher, supervisor | Edit an alert |
| POST | `/api/patient/<id>/alerts/<alert_id>/resolve` | role: admin, dispatcher, supervisor | Resolve an alert |

## Calls, scheduling, confirmations & recurring trips

| Method | Path | Guard | Purpose |
|---|---|---|---|
| GET/POST | `/api/calls` | role: admin, dispatcher, supervisor | List / create calls |
| GET/PUT | `/api/calls/<id>` | role: admin, dispatcher, supervisor | Read / update a call |
| PATCH | `/api/calls/<id>/schedule` · `/pickup-time` | role: admin, dispatcher, supervisor | Set trip date / pickup time |
| PATCH | `/api/calls/<id>/cancel` · `/uncancel` | role: admin, dispatcher, supervisor | Cancel / restore |
| PATCH | `/api/calls/<id>/confirmation` | role: admin, dispatcher, supervisor | Set confirmation state |
| GET | `/api/calls/unscheduled` | role: admin, dispatcher, supervisor | Scheduling inbox feed |
| GET | `/api/calls/confirmation-round` | role: admin, dispatcher, supervisor | Confirmation-round feed |
| GET/POST | `/api/recurring-trips` | role: admin, dispatcher, supervisor | List / create recurring trips |
| GET/PUT/DELETE | `/api/recurring-trips/<id>` | role: admin, dispatcher, supervisor | Read/update/delete |
| POST | `/api/recurring-trips/<id>/generate` | role: admin, dispatcher, supervisor | Materialise upcoming trips |

## Dispatch, crew units & presets

| Method | Path | Guard | Purpose |
|---|---|---|---|
| GET | `/api/dispatch/board` | role: admin, dispatcher, supervisor | The board (units + calls) for a date |
| POST | `/api/dispatch/assign` | role: admin, dispatcher, supervisor | Assign a call to a unit (optimistic concurrency) |
| DELETE | `/api/dispatch/assign/<id>` | role: admin, dispatcher, supervisor | Unassign |
| PATCH | `/api/dispatch/assign/<id>/complete` · `/reopen` | role: admin, dispatcher, supervisor | Complete / reopen an assignment |
| PATCH | `/api/dispatch/units/<id>/status` | role: admin, dispatcher, supervisor | Advance unit status (today only) |
| PATCH | `/api/dispatch/units/<id>/call-order` | role: admin, dispatcher, supervisor | Reorder a unit's calls |
| GET/POST | `/api/crew-units` | role: admin, dispatcher, supervisor | List / create crew units |
| PUT/DELETE | `/api/crew-units/<id>` | role: admin, dispatcher, supervisor | Edit / delete a unit |
| POST | `/api/crew-units/<id>/make-night` | role: admin, dispatcher, supervisor | Split off a night shift |
| GET | `/api/crew-units/alerts` | role: admin, dispatcher, supervisor | Staffing/capability alerts |
| GET/POST/PUT/DELETE | `/api/crew-presets` `…/<id>` | role: admin, dispatcher, supervisor | Reusable crew presets |

## Fleet & maintenance

| Method | Path | Guard | Purpose |
|---|---|---|---|
| GET | `/api/vehicles` | role: admin, dispatcher, supervisor | List vehicles |
| POST | `/api/vehicles` | role: admin, supervisor | Create a vehicle |
| GET | `/api/vehicles/<id>` | role: admin, dispatcher, supervisor | Read a vehicle |
| PUT/DELETE | `/api/vehicles/<id>` | role: admin, supervisor | Update / delete |
| POST | `/api/vehicles/<id>/retire` · `/unretire` | role: admin, supervisor | Retire / restore |
| PATCH | `/api/vehicles/<id>/toggle-active` | role: admin, supervisor | Toggle active |
| GET | `/api/vehicles/<id>/shifts` | role: admin, dispatcher, supervisor | Assignments history |
| GET/POST | `/api/vehicles/<id>/maintenance` | role: (read) admin, dispatcher, supervisor / (write) admin, supervisor | Maintenance records |
| PATCH | `/api/vehicles/maintenance/<record_id>` | role: admin, supervisor | Update a maintenance record |
| GET/POST | `/api/vehicles/<id>/odometer` | role: (read) admin, dispatcher, supervisor / (write) admin, supervisor | Odometer ledger |

## Calendar & operations

| Method | Path | Guard | Purpose |
|---|---|---|---|
| GET | `/api/calendar/events` | session | Aggregated calendar (calls, shifts, birthdays, certs, tasks, vehicle dates, manual events) |
| GET/POST | `/api/calendar-events` | role: all staff | Manual calendar entries (broadcast scopes limited to admin/supervisor) |
| PATCH/DELETE | `/api/calendar-events/<id>` | role: all staff | Edit / delete a manual event |
| GET | `/api/calendar-events/export.ics` | role: all staff | ICS export |
| GET | `/api/operations/attention` | role: admin, dispatcher, hr, supervisor | Cross-module "needs attention" counts |
| GET | `/api/operations/days` · `/days/<day>` | role: admin, dispatcher, supervisor | Operational-day summaries |
| GET | `/api/operations/days/<day>/timeline` | role: admin, dispatcher, supervisor | Day timeline |
| POST/DELETE | `/api/operations/days/<day>/close` | role: (close) admin, supervisor / (reopen) admin | Close / reopen an operational day |

## Tasks

| Method | Path | Guard | Purpose |
|---|---|---|---|
| GET/POST | `/api/tasks` | session | List / create tasks (visibility + participants enforced server-side) |
| GET/PUT/DELETE | `/api/tasks/<id>` | session | Read/update/delete a task |
| PATCH | `/api/tasks/<id>/status` · `/assign` | session | Change status / assignee |
| GET/POST | `/api/tasks/<id>/comments` | session | Comments |
| GET | `/api/tasks/<id>/activity` | session | Activity log |
| GET | `/api/tasks/my` · `/tasks/summary` | session | My tasks / summary counts |

## Employee self-service portal

| Method | Path | Guard | Purpose |
|---|---|---|---|
| GET | `/api/portal/me` | role: employee | Own profile |
| GET/POST | `/api/portal/me/clock` `…/in` `…/out` | role: employee | Own clock state + clock in/out |
| GET | `/api/portal/me/hours` · `/schedule` | role: employee | Own hours / schedule |
| GET/POST | `/api/portal/me/leave` | role: employee | Own leave (view / request) |
| GET | `/api/portal/me/pto` | role: employee | Own PTO balance |
| GET | `/api/portal/me/documents` · `/documents/<id>/file` | role: employee | Own documents + download |
| GET/PATCH | `/api/portal/me/tasks` `…/<id>` | role: employee | Own tasks |

## Notifications, settings, taxonomy

| Method | Path | Guard | Purpose |
|---|---|---|---|
| GET | `/api/notifications` | session | Persistent notification list |
| POST | `/api/notifications/read` · `/read-all` | session | Mark read |
| GET/PUT | `/api/notifications/prefs` | session | Per-user notification prefs (persisted) |
| POST | `/api/notifications/push-subscribe` · `/push-unsubscribe` · `/test-push` | session | Web-push subscription |
| GET | `/api/notifications/vapid-public-key` | public | VAPID public key |
| GET/PATCH | `/api/settings` | session | Per-user settings (deep-merged JSON) |
| GET | `/api/taxonomy` | session | Shared enums/taxonomy for the UI |

## Realtime (SSE)

| Method | Path | Guard | Purpose |
|---|---|---|---|
| GET | `/api/events/stream` | session | Server-Sent Events, tenant-scoped from the session (see PRODUCTION_READINESS.md → Real-time updates) |

## Reports, analytics & audit

| Method | Path | Guard | Purpose |
|---|---|---|---|
| GET | `/api/reports/calls` · `/calls/export` | role: admin, supervisor | Call volume report + CSV |
| GET | `/api/reports/utilization` | role: admin, supervisor | Unit utilization |
| GET | `/api/reports/hours` · `/hours/export` | role: admin, hr, supervisor | Hours report + CSV |
| GET | `/api/analytics/dispatchers` | role: admin, supervisor | Dispatcher analytics |
| GET | `/api/audit` | role: admin, dispatcher, hr, supervisor | Tenant-scoped audit log |

## Health & metrics

| Method | Path | Guard | Purpose |
|---|---|---|---|
| GET | `/api/health` | public | Liveness (`{status, service, qa_mode}`) |
| GET | `/metrics` | public | Prometheus metrics (outside `/api/`) |

---

*Request/response bodies are not reproduced here; consult the route handlers in
`backend/routes/` and their tests in `backend/tests/` for exact field contracts.*
