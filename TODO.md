# TODO

Actionable backlog, in the order it should be picked up. This is the near-term slice — for the full prioritized plan (including later phases like production hardening), see [docs/ROADMAP.md](docs/ROADMAP.md).

Format:

```text
- [ ] Task title
  Priority: P0/P1/P2/P3
  Area: frontend/backend/docs/tests/security
  Why:
  Acceptance criteria:
  Notes: (optional)
```

---

## Done — Priority 0: Documentation drift cleanup

- [x] README cleanup — trimmed to a portfolio-facing front door
  Priority: P0 | Area: docs
- [x] Split README into docs/ARCHITECTURE.md, docs/API.md, docs/ROADMAP.md, docs/TESTING.md, docs/PRODUCTION_READINESS.md, docs/DEVELOPMENT_WORKFLOW.md, docs/COMPLETED_BLOCKS.md
  Priority: P0 | Area: docs
- [x] Corrected roadmap contradictions (Vehicle Registry/shift timing/delay alerts were documented as "planned" while already shipped; duplicate PostgreSQL entries)
  Priority: P0 | Area: docs
- [x] Added Known Limitations and Security Note to README
  Priority: P0 | Area: docs
- [x] Removed stale `window.confirm`/`window.alert` references from TODO.md, docs/ROADMAP.md, docs/UI_STANDARD.md — `CallDrawer.jsx` was fixed in an earlier pass and `grep -Rni "window.confirm|window.alert" frontend/src backend` now returns nothing
  Priority: P0 | Area: docs
- [x] Corrected multi-tenancy/default-organization wording in docs/ARCHITECTURE.md, docs/COMPLETED_BLOCKS.md, docs/PRODUCTION_READINESS.md, README.md — the `organization` table is not seeded (verified: 0 rows, no seed logic in `app.py`), so docs no longer claim a default org is seeded or rows are assigned an `org_id`. Now states plainly: schema foundation only, runtime tenant isolation not active.
  Priority: P0 | Area: docs
- [x] Verified no other stale planned-vs-current contradictions (time format source of truth, Vehicle Registry, Dispatch Board, Notifications, Tasks, Payroll, Audit Log, auth framing) — all already accurate as of this pass
  Priority: P0 | Area: docs

## Next up — Priority 1: Codebase maintainability

- [x] Refactor DispatchBoardPage.jsx — Phase 1: extract already-self-contained pieces
  Priority: P1 | Area: frontend
  Done: moved pure helpers/constants to `frontend/src/utils/dispatchBoardUtils.js` and 7 presentational components (`StatusPill`, `UnitTypeBadge`, `CallCard`, `AssignedCallCard`, `CompletedCallCard`, `CallDetailModal`, `WarningModal`) to `frontend/src/components/dispatch/`. File went from 2,439 → ~1,480 lines. No behavior changed — verified via `npm run lint` (clean), `npm run build` (clean), `qa_test.py` (104/104), and a manual browser pass (unit selection, status advance, call detail modal incl. timestamp editor and cancel form, all with zero console errors).
- [x] Refactor DispatchBoardPage.jsx — Phase 2a: extract two fully-isolated hooks
  Priority: P1 | Area: frontend
  Done: extracted `usePanelResize` (`frontend/src/hooks/usePanelResize.js` — left/bottom panel resize state, drag handlers, persistence to `ui.panels.dispatch`, plus a new `resetLayout()` helper replacing the old inline "Reset layout" button logic) and `useOverdueDetection` (`frontend/src/hooks/useOverdueDetection.js` — the `now` clock tick + `getCallOverdueMinutes`/`getUnitStuckMinutes`/`isCallOverdue`/`isUnitStuck`). File went from 1,474 → 1,363 lines. Verified via `npm run lint` (clean), `npm run build` (clean, 132 modules), `qa_test.py` (104/104), and a manual browser pass: resized both panels, confirmed the size persists across a reload, clicked "Reset layout" and confirmed it returns to defaults, and confirmed the stuck-unit indicator renders correctly (tested both the real not-yet-stuck case and, by temporarily lowering `dispatch.stuck_after` to 1 minute, the positive stuck case — then restored the threshold) — zero console errors throughout.
- [x] Refactor DispatchBoardPage.jsx — Phase 2b: extract the two remaining moderate-coupling hooks
  Priority: P1 | Area: frontend
  Done: extracted `useCallPriority` (`frontend/src/hooks/useCallPriority.js` — `sortCallsByPriority`, `handleSetHighPriority`, `handleMoveCall`, `handleResetPriority`; takes `loadBoard`/`date`/`toast` as params) and `useUnitFormValidation` (`frontend/src/hooks/useUnitFormValidation.js` — the `unitValidationErrors`/`unitWarningMessages` memos; takes `unitForm`/`getEmployeeById`/`getEmployeeAssignmentsInOtherUnits` as params). File went from 1,363 → 1,297 lines. Verified via `npm run lint` (clean), `npm run build` (clean, 134 modules), `qa_test.py` (104/104), and a manual browser pass: assigned 2 real calls to a unit, confirmed default time-order sort, `handleSetHighPriority` (⚡), `handleMoveCall` (▼), and `handleResetPriority` ("Reset to time order") all reorder correctly with the "Manual priority active" banner toggling appropriately; opened the Create Unit drawer and confirmed all 5 validation error messages appear on an empty-form save attempt — zero console errors throughout.
- [ ] Refactor DispatchBoardPage.jsx — Phase 2c: split remaining JSX into components (not yet done)
  Priority: P1
  Area: frontend
  Why: The remaining ~1,297 lines hold drag/drop handlers, the embedded crew/unit-form CRUD logic, and the full JSX layout — the biggest and most drag-and-drop-adjacent remaining slice.
  Acceptance criteria:
  - Board behavior unchanged: open calls, drag/drop assignment, unit status changes, call detail modal, unit detail drawer, priority queue, overdue/stuck alerts
  - Presentational pieces split into components for the remaining JSX (`OpenCallsPanel`, `UnitTable`/`UnitCard`, `UnitDetailDrawer`, `BoardToolbar`, `BoardFilters`, `BoardAlerts`)
  Notes: Do this in small steps, one component at a time — see docs/DEVELOPMENT_WORKFLOW.md "Refactor discipline". Re-test drag/drop and status transitions after every step — these are the highest-risk regressions. No large feature additions should land before this phase completes.

- [ ] Add a backend unit test framework (pytest)
  Priority: P1
  Area: tests, backend
  Why: There are currently zero isolated unit tests — every check requires a running server and the live dev SQLite database via qa_test.py.
  Acceptance criteria:
  - pytest added to backend/requirements.txt
  - At least one real test module using an in-memory/test-only DB
  - Documented in docs/TESTING.md

- [ ] Role permission tests for Task Management (backend)
  Priority: P1
  Area: tests, backend
  Why: The admin/supervisor/hr/dispatcher × create/close/assign/view permission matrix is the most complex authorization logic in the app and is only covered by qa_test.py's live-server assertions today.
  Acceptance criteria: pytest coverage for every role × action combination already exercised in qa_test.py's Task Management section, runnable without a live server

- [ ] Collapse the pages/PatientsPage.jsx wrapper into components/PatientsPage.jsx
  Priority: P2
  Area: frontend
  Why: The only page whose real component lives outside pages/ — a 10-line wrapper re-exports the 1,747-line real component from components/.
  Acceptance criteria: real component moved into pages/, wrapper and old location removed, App.jsx import updated, no behavior change

## Priority 2 — Security / dependency review

- [ ] Review npm audit vulnerabilities
  Priority: P2
  Area: frontend/security
  Why: `npm ci` / `npm install` reports `11 vulnerabilities: 2 low, 4 moderate, 5 high`. All flagged packages observed so far (`@babel/core`, `@eslint/plugin-kit`, `ajv`, `brace-expansion`, `flatted`, `js-yaml`, `minimatch`, `picomatch`, `postcss`) sit under dev-tooling (`eslint`, `vite`) rather than runtime dependencies (`react`, `react-dom`, `react-icons`, `react-router-dom`), but this needs a deliberate review, not an assumption.
  Acceptance criteria:
  - Run `npm audit`
  - Identify whether each issue is dev-only or runtime-impacting
  - Apply safe dependency updates only
  - Confirm `npm run build` and `npm run lint` still pass
  - Do not use `npm audit fix --force` unless the breaking changes are reviewed intentionally
  Notes: Not run as part of this pass — flagged for deliberate review per the project's "no unreviewed force-fixes" rule.

- [ ] Standardize backend `get_or_404()` calls to return JSON, not HTML error pages
  Priority: P2
  Area: backend
  Why: Already fixed for Task/Employee lookups in task_routes.py/auth_routes.py during the post-QA fix-pass; the same pattern (Werkzeug's HTML 404) still exists in call_routes.py, crew_routes.py, document_routes.py, patient_routes.py, payroll_routes.py, time_routes.py.
  Acceptance criteria:
  - Every 404 from a user-facing API call returns JSON
  - No behavior change for valid ids
  Notes: Wide but mechanical and low-risk — do one route file at a time, run qa_test.py after each.

- [ ] Backend permission hardening (role-check decorator)
  Priority: P2
  Area: backend, security
  Why: Role checks are currently duplicated inline per route rather than centralized behind a decorator. Not urgent — current inline checks are correct and tested — but worth consolidating before the codebase grows further.
  Notes: Production auth itself (JWT/session replacement) remains the final Priority 6 hardening phase, deliberately deferred — see docs/PRODUCTION_READINESS.md. This item is about centralizing the existing role-check pattern, not replacing the auth model.

## Priority 3 — Portfolio polish

- [ ] Add screenshots and a workflow GIF to README
  Priority: P3
  Area: docs
  Why: README currently has placeholders; a portfolio README benefits significantly from visual proof of the working app.
  Acceptance criteria: Dashboard, Dispatch Board, Call Form, Patients, Crew Planner, Tasks screenshots; one short GIF of the core dispatch loop (drag call → unit → status → complete)

- [ ] Seeded demo dataset
  Priority: P3
  Area: backend, docs
  Acceptance criteria: a script or documented `stress_test.py` invocation that leaves behind a clean, realistic demo dataset (not just load-test noise) for screenshots and demo walkthroughs

- [ ] Architecture diagram
  Priority: P3
  Area: docs
  Acceptance criteria: a simple diagram (even ASCII or a single image) showing the module map from docs/ARCHITECTURE.md visually

---

For everything past this point — the rest of the codebase-maintainability refactors, UI consistency items, the full testing roadmap, operations features (assignment conflict validation, call timeline, call export, etc.), further portfolio polish, and the production hardening final phase — see [docs/ROADMAP.md](docs/ROADMAP.md).
