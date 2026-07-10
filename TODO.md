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
- [x] Refactor DispatchBoardPage.jsx — Phase 2c: extract the two safest presentational components
  Priority: P1 | Area: frontend
  Done: extracted `BoardToolbar` (`frontend/src/components/dispatch/BoardToolbar.jsx` — date picker, refresh, Day/Night Unit buttons, stats/reset-layout line; zero drag/drop involvement) and `OpenCallsPanel` (`frontend/src/components/dispatch/OpenCallsPanel.jsx` — Calls/Staff toggle, call filter tabs, staff list, call list; only touches drag as a source via passthrough to `CallCard`, never a drop target). File went from 1,297 → 1,103 lines. Verified via `npm run lint` (clean), `npm run build` (clean, 136 modules), `qa_test.py` (104/104), and a manual browser pass: date change triggers board reload, refresh/Day Unit/Night Unit buttons work, Calls/Staff tab toggle and all 4 call filter tabs (Open/Done/Cancelled/All) render correctly with real data — zero console errors throughout.
- [x] Refactor DispatchBoardPage.jsx — Phase 2d (final): split UnitTable + UnitDetailPanel into components
  Priority: P1 | Area: frontend
  Done: extracted `UnitTable` (`frontend/src/components/dispatch/UnitTable.jsx` — every drag-and-drop drop-target handler wiring, double-click status-advance, shift-severity styling, patient-queue sub-rows) and `UnitDetailPanel` (`frontend/src/components/dispatch/UnitDetailPanel.jsx` — renamed from the ROADMAP's aspirational `UnitDetailDrawer` since it's an inline panel, not an overlay; row-resize divider, status buttons, priority-queue banner/reset, assigned/completed call lists). All drag-and-drop and status handler *functions* stayed in the page — only the JSX invoking them moved. File went from 1,103 → 768 lines (2,439 → 768 across the whole refactor). Verified via `npm run lint` (clean), `npm run build` (clean, 138 modules), `qa_test.py` (104/104), and an exhaustive manual browser pass: unit select/deselect, double-click status advance, inline "→ Next Status" button, Edit Unit drawer, Make Night dialog, Out-of-Service toggle, drag-and-drop assign (including the insufficient-crew warning modal), priority queue (Move Down, Reset to time order), Unassign, Mark Completed, and bottom-panel resize — zero console errors throughout. This was the last remaining phase — the DispatchBoardPage.jsx refactor is now complete.

- [x] Add a backend unit test framework (pytest)
  Priority: P1 | Area: tests, backend
  Done: added `pytest==8.3.4` to `backend/requirements.txt`; made `SQLALCHEMY_DATABASE_URI` read from a `DATABASE_URL` env var (defaulting to the unchanged `sqlite:///database.db`) so tests can point it at `sqlite:///:memory:` without touching prod/dev behavior; added `backend/conftest.py` (`app`/`client`/`db_session` fixtures — fresh schema created/dropped per test, rate limiting disabled) and `backend/tests/test_auth.py` (6 tests: login success, wrong password, unknown user, missing fields, no JSON body, inactive user) — all isolated from any live server or the dev database. Verified: `pytest -v` → 6/6 passed in <1s, `qa_test.py` still 104/104 against the live backend (confirming the `DATABASE_URL` env-var change is a no-op for the real app), `npm run lint`/`npm run build` unaffected (frontend-only checks, included for completeness). Documented in docs/TESTING.md.

- [x] Role permission tests for Task Management (backend)
  Priority: P1 | Area: tests, backend
  Done: added `backend/tests/test_tasks.py` — 31 isolated pytest tests porting qa_test.py's Task Management section: create/edit/status-transition happy paths and validation; the close-permission workflow (assignee can set In Progress/Done but gets 403 on Completed, creator/assigner can close); comments + activity log; list/filter/summary/my; and the full dispatcher (cannot create/assign/archive/view-others'-tasks, can view their own) and HR (blocked from non-HR task types, blocked from archiving) permission matrices; plus the admin/supervisor archive workflow and archived-task list visibility. Reuses the `app`/`client` fixtures from `backend/conftest.py` with a `roles` fixture (one `User` per role, dispatcher linked to a test `Employee`) — no live server, no dev database. Verified: `pytest -v` → 37/37 passed (6 auth + 31 task) in ~15s, `qa_test.py` still 104/104 against the live backend, `python -m compileall backend` clean. Also quieted pytest's pre-existing SQLAlchemy `Query.get()` `LegacyAPIWarning` noise via `backend/pytest.ini` (unrelated existing deprecation, not fixed here — just silenced in test output).

- [x] Collapse the pages/PatientsPage.jsx wrapper into components/PatientsPage.jsx
  Priority: P2 | Area: frontend
  Done: moved the 1,747-line real component from `components/PatientsPage.jsx` directly into `pages/PatientsPage.jsx`, replacing the 10-line re-export wrapper; fixed the 3 relative imports that referenced `./ui/...` (component-local) to `../components/ui/...` (all other imports — `../api/...`, `../context/...`, `../utils/...` — were already correct since `components/` and `pages/` are sibling directories under `src/`). Deleted the old `components/PatientsPage.jsx`. `App.jsx` already imported from `./pages/PatientsPage`, so no route wiring changed. Verified: `npm run lint` (clean), `npm run build` (clean, 137 modules — one fewer than before since the wrapper file is gone, `PatientsPage` chunk size unchanged), `qa_test.py` (104/104), and a manual browser pass logged in as admin — Patients page loads, Show All + Show Archived toggle both fetch real data from the live backend, opening a patient's drawer shows all 5 tabs (Overview/Alerts/Contacts/Edit/Call History) with correct data, and the Edit tab's full form renders — zero console errors throughout.

## Priority 2 — Security / dependency review

- [x] Review npm audit vulnerabilities
  Priority: P2
  Area: frontend/security
  Why: `npm ci` / `npm install` reported `11 vulnerabilities: 2 low, 4 moderate, 5 high`.
  Done: Traced every flagged package via `npm ls` — all 11 (`@babel/core`, `@eslint/plugin-kit`, `ajv`, `brace-expansion`, `flatted`, `js-yaml`, `minimatch`, `picomatch`, `postcss`, `rollup`, `vite`) are transitive under dev tooling only (`vite`, `eslint`, `@vitejs/plugin-react`, `gh-pages`); none descend from the 4 runtime deps (`react`, `react-dom`, `react-icons`, `react-router-dom`), so nothing shipped in the production bundle. Verified `npm audit fix --dry-run` produced only minor/patch bumps within existing semver ranges (vite 7.0.4→7.3.6, rollup 4.45.1→4.62.2, @babel/* 7.28→7.29, react-router-dom 7.14→7.18) — no major jumps, so no `--force` needed. Ran plain `npm audit fix` → `found 0 vulnerabilities`, only `package-lock.json` changed (`package.json` untouched). Confirmed `npm run lint` (clean) and `npm run build` (clean, built in 1.4s). No `--force` used, per the project's no-unreviewed-force-fixes rule.

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
