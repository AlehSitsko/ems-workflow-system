# Roadmap

Organized by priority, not by chronological "block" number — the old numbering scheme mixed shipped and planned work in a way that made the README self-contradictory. Anything marked complete has moved to [COMPLETED_BLOCKS.md](COMPLETED_BLOCKS.md).

Priority order reflects what should be picked up next, not urgency of harm — this is a stabilization/portfolio project, not an incident queue.

---

## Priority 0 — Documentation & Stabilization

- [x] README cleanup — trim to a portfolio-facing front door, move deep detail into `docs/`
- [x] Split README into `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/ROADMAP.md`, `docs/TESTING.md`, `docs/PRODUCTION_READINESS.md`, `docs/DEVELOPMENT_WORKFLOW.md`, `docs/COMPLETED_BLOCKS.md`
- [x] Remove outdated roadmap contradictions (see "Corrections made" below)
- [x] Add Known Limitations and Security Note to README
- [ ] Add screenshots and a workflow GIF (placeholders currently in README — see Priority 5)

### Corrections made during this pass

The previous README described some already-shipped work as "planned" and had duplicate entries for the same task. For anyone who read the old roadmap:

- **Vehicle Registry, shift duration/status, delay & near-end alerts, and Dispatch Board shift-timing sync were already fully implemented** (`Vehicle` model, `DailyCrewUnit.shift_duration_hours`/`shift_status`, `_compute_shift_alerts()`, `ShiftAlertsBlock.jsx`, `VehicleRegistrySection.jsx`, `unit_shift_near_end`/`unit_shift_overdue` notifications) but were listed under "Block 5.8 — Planned." Only two pieces of that block were actually unbuilt: **soft overlap warning** and **auto-fill crew** — both moved to Priority 4 below, correctly labeled as not yet built.
- The old Block 5.8 also described a "12h/24h toggle stored in localStorage, one shared `ems-time-format` CustomEvent" UI — that mechanism was replaced by the server-side per-user `settings.ui.time_format` setting during a later, separate piece of work. The localStorage/CustomEvent approach no longer exists in the codebase.
- **"PostgreSQL Migration" was documented twice** (once under a "Production Readiness Tasks" section, once under "Tier 3 — Before Production") with near-duplicate content. Consolidated into one entry — see Priority 6.
- The claim that `window.alert`/`window.confirm` were "removed across all modules" was true when written but had since regressed: `CallDrawer.jsx:102` used `window.confirm` for its unsaved-changes check. **This has since been fixed** — `CallDrawer.jsx` now uses `useConfirm()` like every other drawer, and `grep -Rni "window.confirm|window.alert" frontend/src backend` returns nothing.

---

## Priority 1 — Codebase Maintainability

- [x] Refactor `DispatchBoardPage.jsx` into components/hooks — Phase 1 (complete)
  Priority: P1
  Area: frontend
  Done: Extracted the code that was already self-contained (no closure over page state) — pure helpers/constants to `frontend/src/utils/dispatchBoardUtils.js` (`todayStr`, `minCrewForType`, `isAlsUnit`, `isAlsCall`, `isEmergencyCall`, `isWillCall`, `hasReturnRide`, `parseReturnInfo`, `timeToMinutes`, `expandAndSort`, `getShiftAlertSeverity`, `isoToLocalTime`, `isoToLocalDate`, `setIsoTime`, plus the `STATUS_*`/`SHIFT_SEVERITY_STYLE`/`ALERT_SEVERITY_COLOR`/`TS_FIELDS` constants), and 7 presentational components to `frontend/src/components/dispatch/`: `StatusPill`, `UnitTypeBadge`, `CallCard`, `AssignedCallCard`, `CompletedCallCard`, `CallDetailModal` (kept this name — matches the modal pattern already documented in `docs/UI_STANDARD.md`, not the `CallDetailDrawer` name below), `WarningModal`. File went from 2,439 → ~1,480 lines. Verified: `npm run lint`/`npm run build` clean, `qa_test.py` 104/104, manual browser pass (unit selection, status advance, call detail modal incl. timestamp editor and cancel form) with zero console errors.
- [x] Refactor `DispatchBoardPage.jsx` into components/hooks — Phase 2a (complete)
  Priority: P1
  Area: frontend
  Done: Extracted the two hooks with zero coupling to calls/units/employees data — `usePanelResize` (`frontend/src/hooks/usePanelResize.js`: left/bottom panel resize state, drag handlers, persistence to `ui.panels.dispatch`, and a new `resetLayout()` helper that replaced the old inline "Reset layout" button logic) and `useOverdueDetection` (`frontend/src/hooks/useOverdueDetection.js`: the `now` clock tick plus `getCallOverdueMinutes`/`getUnitStuckMinutes`/`isCallOverdue`/`isUnitStuck`). File went from 1,474 → 1,363 lines. Verified: `npm run lint`/`npm run build` clean (132 modules), `qa_test.py` 104/104, manual browser pass — resized both panels, confirmed persistence across a reload, confirmed "Reset layout" returns to defaults, and confirmed the stuck-unit indicator computes correctly (verified both the not-yet-stuck case and, by temporarily lowering `dispatch.stuck_after` to 1 minute, the positive stuck case) — zero console errors throughout.
- [x] Refactor `DispatchBoardPage.jsx` into components/hooks — Phase 2b (complete)
  Priority: P1
  Area: frontend
  Done: Extracted the two remaining moderate-coupling hooks — `useCallPriority` (`frontend/src/hooks/useCallPriority.js`: `sortCallsByPriority`/`handleSetHighPriority`/`handleMoveCall`/`handleResetPriority`, taking `loadBoard`/`date`/`toast` as params) and `useUnitFormValidation` (`frontend/src/hooks/useUnitFormValidation.js`: the `unitValidationErrors`/`unitWarningMessages` memos, taking `unitForm`/`getEmployeeById`/`getEmployeeAssignmentsInOtherUnits` as params). File went from 1,363 → 1,297 lines. Verified: `npm run lint`/`npm run build` clean (134 modules), `qa_test.py` 104/104, manual browser pass — assigned 2 real calls to a unit and confirmed default time-order sort, `handleSetHighPriority`, `handleMoveCall`, and `handleResetPriority` all reorder correctly with the "Manual priority active" banner toggling appropriately, and confirmed all 5 unit-form validation error messages appear on an empty-form save attempt — zero console errors throughout.
- [x] Refactor `DispatchBoardPage.jsx` into components/hooks — Phase 2c (complete)
  Priority: P1
  Area: frontend
  Done: Extracted the two components with the least risk — `BoardToolbar` (`frontend/src/components/dispatch/BoardToolbar.jsx`: date picker, refresh, Day/Night Unit buttons, stats/reset-layout line; zero drag/drop involvement) and `OpenCallsPanel` (`frontend/src/components/dispatch/OpenCallsPanel.jsx`: Calls/Staff toggle, call filter tabs, staff list, call list; only touches drag as a source via passthrough to the already-extracted `CallCard`, never a drop target). File went from 1,297 → 1,103 lines. Verified: `npm run lint`/`npm run build` clean (136 modules), `qa_test.py` 104/104, manual browser pass — date change triggers board reload, refresh/Day Unit/Night Unit buttons work, Calls/Staff tab toggle and all 4 call filter tabs render correctly with real data — zero console errors throughout.
- [ ] Refactor `DispatchBoardPage.jsx` into components/hooks — Phase 2d (not started)
  Priority: P1
  Area: frontend
  Why: The remaining ~1,103 lines are the last and highest-risk slice — the unit table (every `onDragOver`/`onDragLeave`/`onDrop` drop-target handler, double-click status-advance, shift-severity styling, patient-queue sub-rows) and the selected-unit bottom panel (status buttons, priority queue, assigned/completed call lists), plus the Unit Create/Edit `EntityDrawer` form and unit-CRUD handlers which stay in the page.
  Acceptance criteria:
  - Board behavior is unchanged: drag-and-drop assignment, unit status advance, priority queue, overdue/stuck alerts all still work
  - Presentational pieces split into components: `UnitTable`/`UnitCard` and `UnitDetailPanel` (renamed from the earlier aspirational `UnitDetailDrawer` — it's an inline panel, not an overlay, same kind of accurate-naming correction already made for `CallDetailModal` in Phase 1)
  - `npm run build` and `npm run lint` pass after each extraction step
  Notes: This is the last piece of the DispatchBoardPage refactor and the highest-risk one in the whole series. Do this in small steps. Re-test drag/drop and status transitions after every step.

- [ ] Collapse the `pages/PatientsPage.jsx` wrapper into `components/PatientsPage.jsx`
  Priority: P2
  Area: frontend
  Why: Every other route renders its page component directly from `frontend/src/pages/`. Patients is the one exception: `pages/PatientsPage.jsx` is a 10-line wrapper that just re-exports the real 1,747-line component from `components/PatientsPage.jsx`. Harmless today, but it's an inconsistency that will confuse anyone looking for "the Patients page" in the obvious place.
  Acceptance criteria:
  - The real component moves into (or is renamed to) `pages/PatientsPage.jsx`; the `components/` copy and the wrapper both go away
  - `App.jsx`'s lazy import path updated accordingly
  - No behavior change; `npm run build` and `npm run lint` pass
  Notes: Do this alongside (before, ideally) the larger PatientsPage component-split refactor below, so there's only one move instead of two.

- [ ] Refactor `TasksPage.jsx` into components/hook
  Priority: P2
  Area: frontend
  Why: 667 lines covering list/filter/create/edit/comments/activity/archive in one file. Not urgent (smaller than the board or patients pages) but a good second refactor target once the pattern is proven on the Dispatch Board.
  Acceptance criteria:
  - Split into `TaskList`, `TaskDrawer`, `TaskComments`, `TaskActivity`, `TaskFilters`, and a `useTasks` hook
  - All existing role-permission behavior (create/status/close restrictions) unchanged
  - `qa_test.py` Task Management section still passes 100%

- [ ] Refactor `PatientsPage.jsx` (post-relocation) into components
  Priority: P2
  Area: frontend
  Why: 1,747 lines, second-largest frontend file.
  Acceptance criteria:
  - Split into `PatientList`, `PatientDrawer`, `PatientAlerts`, `PatientContacts`, `PatientTransportNotes`
  - Duplicate-prevention flow, archive/restore, alerts, and contacts all still work
  - `qa_test.py` Patient module section still passes 100%

- [ ] Refactor `CrewPlannerPage.jsx` into components
  Priority: P2
  Area: frontend
  Why: 1,576 lines; the CPR-warning/assignment-conflict logic in this file was already touched once during the post-QA fix-pass (wrapped in `useCallback`), which makes it a natural next target while that logic is fresh.
  Acceptance criteria:
  - Split into `UnitForm`, `CrewSlotSelector`, `ShiftWarnings`, `VehicleSelector`, and extracted `crewValidation.js` helpers
  - Day/night unit creation, Make Night flow, crew validation, and shift alerts unchanged
  - `qa_test.py` crew unit section still passes 100%

- [ ] Extract shared API-layer conventions into a common helper
  Priority: P2
  Area: frontend
  Why: Each `frontend/src/api/*.js` file duplicates its own fetch/error-handling boilerplate. A thin shared helper (base URL, JSON parsing, error normalization) would reduce repetition without hiding each API module's specific shape.
  Acceptance criteria:
  - No change to any function signature consumed by pages
  - All API modules use the shared helper for the request/response boilerplate
  - `npm run build` passes

- [ ] Standardize backend error handling across route files
  Priority: P2
  Area: backend
  Why: Some routes use `get_or_404()` (which returns Werkzeug's HTML error page for API endpoints — already fixed for Task/Employee lookups in `task_routes.py`/`auth_routes.py` during the post-QA fix-pass, but the same pattern still exists in `call_routes.py`, `crew_routes.py`, `document_routes.py`, `patient_routes.py`, `payroll_routes.py`, `time_routes.py`).
  Acceptance criteria:
  - Every 404 case from a user-facing API call returns JSON, not an HTML error page
  - No endpoint behavior changes for valid ids
  Notes: This is a wide, low-risk, mechanical change (same pattern already proven safe in `task_routes.py`) — good candidate to do incrementally, one route file at a time, with `qa_test.py` run after each file.

- [ ] Reduce duplicated status/time/formatting logic between `CrewPlannerPage.jsx` and `DispatchBoardPage.jsx`
  Priority: P2
  Area: frontend
  Why: `getCprWarning`, `getEmployeeAssignmentsInOtherUnits`, `getEmployeeById`, `normalizeLicense`, `getLicenseStatus` are implemented nearly identically in both files (confirmed while fixing their `useCallback` dependency warnings in the post-QA fix-pass).
  Acceptance criteria:
  - Shared logic extracted to `frontend/src/utils/crewAssignmentUtils.js` (or similar) and imported by both pages
  - No behavior change in either page's warning logic

---

## Priority 2 — UI Consistency

- [ ] Audit and remove hardcoded hex colors in favor of `--ems-*` design tokens
  Priority: P3
  Area: frontend
  Why: `docs/UI_STANDARD.md` mandates CSS custom properties for all colors; a repo-wide grep still finds hardcoded hex values across several components (CallForm, PatientOrderSection, PlannedUnitsList, CallDrawer, DocumentsTab, NotificationBell, PushNotificationBanner, Topbar, PatientsPage, BrowserNotificationSettings). Some of these may be legitimate (SVG data URIs, one-off brand colors) — needs a file-by-file pass, not a blind find/replace.
  Acceptance criteria:
  - Every color used for UI chrome (backgrounds, borders, text, badges) references a `--ems-*` token or a Bootstrap utility class
  - SVG/data-URI colors reviewed case-by-case (not necessarily changed)
  - Dark/light theme still renders correctly after changes

- [ ] Standardize table/card/empty/loading/error states across modules
  Priority: P3
  Area: frontend
  Why: Each page currently implements its own loading spinner, empty-state message, and error banner. `docs/UI_STANDARD.md` documents drawer/toast/confirm patterns but not these.
  Acceptance criteria:
  - Shared `EmptyState`, `LoadingState`, `ErrorState` components (or equivalent convention) documented in `docs/UI_STANDARD.md`
  - At least the newest modules (Tasks, Audit Log) adopt them as a proof of concept

- [ ] Verify responsive layouts on mobile/tablet breakpoints
  Priority: P3
  Area: frontend
  Why: The project has never been explicitly tested at narrow viewports; Dispatch Board's three-panel layout in particular is unlikely to work below tablet width.
  Acceptance criteria:
  - Documented list of which pages are usable at 768px and 375px widths (per `preview_resize` presets) and which are desktop-only by design
  - Any genuinely broken (not just "not optimized") layouts fixed

---

## Priority 3 — Testing

See [TESTING.md](TESTING.md) for the current state (there is no unit test framework yet — `qa_test.py`/`stress_test.py` are integration/load scripts run against a live server).

- [ ] Introduce a backend unit test framework (pytest)
  Priority: P1
  Area: tests, backend
  Why: There are currently zero isolated unit tests — every check requires a running server and a live SQLite database via `qa_test.py`. This makes fast, isolated regression testing impossible and slows down every future change.
  Acceptance criteria:
  - `pytest` added to `backend/requirements.txt`
  - At least one real test module (e.g. `test_task_permissions.py`) using an in-memory/test SQLite DB, not the dev database
  - Documented in `docs/TESTING.md` how to run it

- [ ] Role permission tests (backend)
  Priority: P1
  Area: tests, backend
  Why: The Task Management permission matrix (admin/supervisor/hr/dispatcher × create/close/assign) is the most complex authorization logic in the app and is currently only covered by `qa_test.py`'s live-server assertions.
  Acceptance criteria: pytest coverage for every role × action combination already exercised in `qa_test.py`'s Task Management section, runnable without a live server

- [ ] Tenant isolation tests before enabling multi-tenancy
  Priority: P2
  Area: tests, backend
  Why: `org_id` exists on tenant-scoped tables but no query currently filters by it (see [ARCHITECTURE.md](ARCHITECTURE.md)). Before Priority 6's subdomain activation work begins, there should be a test proving cross-tenant data leakage is impossible once filtering is added — written test-first, ideally.
  Acceptance criteria: a failing test today that will pass once tenant-scoped queries are implemented

- [ ] Dispatch assignment conflict tests
  Priority: P2
  Area: tests, backend
  Depends on: Priority 4's "Assignment Conflict Validation" feature
  Acceptance criteria: covers same-unit time overlap detection, override behavior, and the existing ALS-on-BLS warning pattern it's meant to be consistent with

- [ ] Payroll / overtime edge-case tests
  Priority: P2
  Area: tests, backend
  Why: FLSA weekly overtime calculation (40h/week, ISO week boundaries) is exactly the kind of logic that silently breaks on edge cases (week boundaries, partial weeks, multiple pay periods).
  Acceptance criteria: tests for calculation at week boundaries, employees spanning multiple periods, and zero-hours edge cases

- [ ] Patient duplicate-prevention tests
  Priority: P2
  Area: tests, backend
  Why: Currently only covered by `qa_test.py`'s live assertions (exact match + archived-patient match).
  Acceptance criteria: pytest coverage for exact match, near-match (should NOT dedupe), and archived-patient match scenarios

- [ ] Frontend smoke tests for critical user flows
  Priority: P2
  Area: tests, frontend
  Why: No frontend test runner exists at all (no vitest/jest in `package.json`).
  Acceptance criteria:
  - A frontend test runner is chosen and added (vitest is the natural fit for a Vite project)
  - At least one smoke test per critical flow: login, create call, assign to unit, complete call

---

## Priority 4 — Operations Features

These are the genuinely-not-yet-built operational features (the old README's "Block 5.x" series, corrected):

- [ ] Assignment Conflict Validation
  Priority: P3
  Area: backend, frontend
  Why: Two calls assigned to overlapping time windows on the same unit currently isn't flagged.
  Acceptance criteria:
  - On assign, check for time overlap on the same unit
  - Returns a warning modal (not a hard block) — dispatcher can override
  - Consistent with the existing ALS-on-BLS warning pattern

- [ ] Call Timeline & Daily Operations View
  Priority: P3
  Area: backend, frontend
  Acceptance criteria:
  - New `CallEvent` model (call_id, unit_id, event_type, actor, timestamp, meta_json)
  - Event written on every dispatch action (assign, status change, complete, unassign)
  - Daily Operations page: select date → list all calls → click call → full event timeline
  - Foundation for future reporting (response times, on-scene duration, unit utilization)

- [ ] Call Export CSV
  Priority: P3
  Area: backend, frontend
  Acceptance criteria:
  - `GET /api/calls/export?date_from=&date_to=&status=&service_level=`
  - Fields: date, patient, addresses, call type, service level, unit, dispatcher, status, quality score
  - Export button in Calls list or Supervisor Dashboard

- [ ] Repeat Call
  Priority: P4
  Area: backend, frontend
  Acceptance criteria:
  - Repeat button in Call Detail Modal
  - Creates new call with same data, date = today
  - Opens pre-filled intake form for review before saving

- [ ] Call Notes (Communication Log)
  Priority: P4
  Area: backend, frontend
  Acceptance criteria:
  - `CallNote` model: call_id, user_id, content, created_at (append-only)
  - Visible in Call Detail Modal
  - Accessible to all roles with call access

- [ ] Soft overlap warning for crew unit scheduling
  Priority: P3
  Area: backend, frontend
  Why: The only unbuilt piece of what the old README called "Block 5.8" related to scheduling conflicts (Vehicle Registry, shift timing, and delay alerts are already shipped — see [COMPLETED_BLOCKS.md](COMPLETED_BLOCKS.md)).
  Acceptance criteria:
  - Creating/editing a unit with a time range overlapping another active unit on the same vehicle returns a warning, not a hard block
  - Consistent with the existing ALS-on-BLS override pattern

- [ ] Auto-fill crew
  Priority: P4
  Area: backend, frontend
  Why: The other unbuilt piece of the old "Block 5.8."
  Acceptance criteria:
  - Button in the unit form proposes Driver/Medical/Assist assignments from available employees for the date
  - Two-pass algorithm: fill Medical on ALS units first (Paramedic required), then distribute remaining staff to BLS/Bariatric units
  - Bariatric units prioritize filling Assist1/Assist2 before Driver/Medical
  - Driver slot prefers EVOC + medical-capable staff when paired with a Paramedic medical assignment
  - If no qualified candidate exists for a slot, it's left empty (not filled with an unqualified person) and visually flagged

- [ ] Clock-in / shift-start sync ("Approve Rules")
  Priority: P4
  Area: backend, frontend
  Acceptance criteria:
  - Sync clock-in with Crew Planner shift start time
  - Configurable tolerance thresholds (±15 / ±30 min)
  - Auto-flag entries exceeding shift duration rules (8h / 12h / 24h)
  - Manual override per employee or role

- [ ] Reports (built on Call Timeline data)
  Priority: P4
  Area: backend, frontend
  Depends on: Call Timeline & Daily Operations View above
  Acceptance criteria:
  - Average response time (dispatch → on scene), average transport time (on scene → at destination)
  - Unit utilization per day / week / period
  - Call volume by service level, date range, dispatcher
  - Export to PDF and CSV

---

## Priority 5 — Portfolio Polish

- [ ] Seeded demo dataset
  Priority: P3
  Area: backend, docs
  Acceptance criteria: a script or documented `stress_test.py` invocation that leaves behind a clean, realistic demo dataset (not just load-test noise) for screenshots and demo walkthroughs

- [ ] Screenshots for README
  Priority: P3
  Area: docs
  Acceptance criteria: Dashboard, Dispatch Board, Call Form, Patients, Crew Planner, Tasks — one representative screenshot each, referenced from README's Feature Highlights

- [ ] Workflow GIF: drag call → unit → update status → complete
  Priority: P3
  Area: docs
  Acceptance criteria: a short (10–20s) GIF showing the core dispatch loop, embedded in README

- [ ] Architecture diagram
  Priority: P4
  Area: docs
  Acceptance criteria: a simple diagram (even ASCII or a single image) showing the module map from `ARCHITECTURE.md` visually

- [ ] Deployment/demo notes
  Priority: P4
  Area: docs
  Why: `frontend/package.json` has a `deploy` script (`gh-pages -d dist`) but GitHub Pages deployment is currently on hold and not an active priority.
  Acceptance criteria: a short note in `DEVELOPMENT_WORKFLOW.md` or here clarifying the deploy script exists but isn't part of the current workflow, so it doesn't look abandoned/broken

---

## Priority 6 — Production Hardening (Final Phase)

Deliberately last. Current authentication is a conscious MVP choice for local development and demo/portfolio use, not an oversight — see the Security Note in the README. This phase activates once the feature set and codebase structure are stable, not before.

- [ ] Production authentication
  Priority: P0 (when this phase begins — not now)
  Area: backend, frontend, security
  Acceptance criteria:
  - Replace localStorage-based session with JWT or server-side session auth (access + refresh tokens)
  - Transparent to users — no UI changes beyond login mechanics
  - Update all protected routes and role checks accordingly

- [ ] Backend role-enforcement decorators
  Priority: P0 (when this phase begins)
  Area: backend, security
  Why: Role checks are currently duplicated inline (`if role not in ("admin", "supervisor"): return 403`) across every route file rather than centralized.
  Acceptance criteria: a `@require_role(...)` decorator (or equivalent) used consistently; no change to which roles can do what

- [ ] Tenant-safe query enforcement
  Priority: P0 (when this phase begins)
  Area: backend, security
  Acceptance criteria: every tenant-scoped query filtered by `g.current_org`/`org_id`; covered by the tenant isolation tests from Priority 3

- [ ] Protected API routes audit
  Priority: P0 (when this phase begins)
  Area: backend, security
  Acceptance criteria: every route reviewed for correct auth requirement; no endpoint accidentally left open

- [ ] Subdomain multi-tenancy activation
  Priority: P1 (when this phase begins)
  Area: backend, frontend
  Why: Foundation (Organization model, `org_id` columns) already shipped — see [COMPLETED_BLOCKS.md](COMPLETED_BLOCKS.md).
  Acceptance criteria:
  - Flask middleware reads subdomain from Host header → looks up Organization by slug → sets `g.current_org`
  - Superadmin role and UI: create/deactivate organizations, assign org admins
  - Frontend `OrgContext` reads `/api/org/current` on startup
  - Local dev: `lvh.me` subdomains or `X-Org-Slug` header fallback

- [ ] PostgreSQL migration
  Priority: P1 (when this phase begins)
  Area: backend, infra
  Why: SQLite doesn't support concurrent writes — parallel dispatch actions from 2+ users can produce lock errors. Foundation already in place (all models use SQLAlchemy, Alembic handles schema migrations) — no model changes required, only `SQLALCHEMY_DATABASE_URI` and a data migration script.

- [ ] Gunicorn production server
  Priority: P1 (when this phase begins)
  Area: backend, infra
  Why: Flask's dev server is single-threaded. Stress-test baseline is 184 req/s on the dev server; expect roughly a 4× improvement with Gunicorn workers (`gunicorn -w 4 -b 0.0.0.0:5050 app:app`, nginx as reverse proxy for static files + TLS).

- [ ] Notification polling → WebSocket
  Priority: P2 (when this phase begins)
  Area: backend, frontend, infra
  Why: Each user currently polls `/api/notifications` every 10 seconds. With an index on `user_notification.user_id`, this is acceptable up to roughly 50 concurrent users; beyond that, replace polling with WebSocket push (Flask-SocketIO or a dedicated channel server). Short-term mitigation if needed sooner: increase the poll interval to 30s for non-dispatch roles.

- [ ] Docker
  Priority: P2 (when this phase begins)
  Area: infra
  Acceptance criteria: Dockerfile for backend and frontend, `docker-compose.yml` with nginx reverse proxy, environment-based configuration

- [ ] S3 storage backend
  Priority: P3 (when this phase begins)
  Area: backend, infra
  Why: `storage.py` already abstracts file storage — swapping local disk for `boto3`/S3 requires changes only inside that one file.
  Acceptance criteria: `STORAGE_BACKEND`, `S3_BUCKET`, and AWS credential env vars control the backend with no other code changes

- [ ] Audit/security review
  Priority: P0 (when this phase begins)
  Area: security
  Acceptance criteria: a documented pass over the whole app once the above are in place, before calling it production-ready
