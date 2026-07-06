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

## Done this pass (Priority 0 — Documentation & Stabilization)

- [x] README cleanup — trimmed to a portfolio-facing front door
  Priority: P0 | Area: docs
- [x] Split README into docs/ARCHITECTURE.md, docs/API.md, docs/ROADMAP.md, docs/TESTING.md, docs/PRODUCTION_READINESS.md, docs/DEVELOPMENT_WORKFLOW.md, docs/COMPLETED_BLOCKS.md
  Priority: P0 | Area: docs
- [x] Corrected roadmap contradictions (Vehicle Registry/shift timing/delay alerts were documented as "planned" while already shipped; duplicate PostgreSQL entries; stale window.confirm claim) — see docs/ROADMAP.md "Corrections made"
  Priority: P0 | Area: docs
- [x] Added Known Limitations and Security Note to README
  Priority: P0 | Area: docs

## Next up

- [ ] Replace the remaining `window.confirm` in `CallDrawer.jsx`
  Priority: P2
  Area: frontend
  Why: docs/UI_STANDARD.md mandates ConfirmDialog/useConfirm everywhere; this one call site (line 102) was missed or regressed.
  Acceptance criteria:
  - Uses `useConfirm()` instead of `window.confirm()`
  - Behavior (prompt before closing with unsaved changes) unchanged
  - `grep -rn "window\.\(confirm\|alert\)" frontend/src` returns nothing

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

- [ ] Refactor DispatchBoardPage.jsx into components/hooks
  Priority: P1
  Area: frontend
  Why: At 2,461 lines it's the largest file in the project by a wide margin and the core operational workflow.
  Acceptance criteria:
  - Board behavior unchanged: open calls, drag/drop assignment, unit status changes, call detail modal, unit detail drawer, priority queue, overdue/stuck alerts
  - Board-specific state moved into hooks (useDispatchBoardData, useDispatchAssignments, useBoardFilters, useBoardAlerts)
  - Presentational pieces split into components (OpenCallsPanel, UnitTable/UnitCard, CallCard, CallDetailDrawer, UnitDetailDrawer, BoardToolbar, BoardFilters, BoardAlerts)
  Notes: Do this in small steps — see docs/DEVELOPMENT_WORKFLOW.md "Refactor discipline" and the full breakdown in docs/ROADMAP.md Priority 1.

- [ ] Standardize backend `get_or_404()` calls to return JSON, not HTML error pages
  Priority: P2
  Area: backend
  Why: Already fixed for Task/Employee lookups in task_routes.py/auth_routes.py during the post-QA fix-pass; the same pattern (Werkzeug's HTML 404) still exists in call_routes.py, crew_routes.py, document_routes.py, patient_routes.py, payroll_routes.py, time_routes.py.
  Acceptance criteria:
  - Every 404 from a user-facing API call returns JSON
  - No behavior change for valid ids
  Notes: Wide but mechanical and low-risk — do one route file at a time, run qa_test.py after each.

- [ ] Collapse the pages/PatientsPage.jsx wrapper into components/PatientsPage.jsx
  Priority: P2
  Area: frontend
  Why: The only page whose real component lives outside pages/ — a 10-line wrapper re-exports the 1,747-line real component from components/.
  Acceptance criteria: real component moved into pages/, wrapper and old location removed, App.jsx import updated, no behavior change

- [ ] Add screenshots and a workflow GIF to README
  Priority: P3
  Area: docs
  Why: README currently has placeholders; a portfolio README benefits significantly from visual proof of the working app.
  Acceptance criteria: Dashboard, Dispatch Board, Call Form, Patients, Crew Planner, Tasks screenshots; one short GIF of the core dispatch loop (drag call → unit → status → complete)

---

For everything past this point — the rest of the codebase-maintainability refactors, UI consistency items, the full testing roadmap, operations features (assignment conflict validation, call timeline, call export, etc.), portfolio polish, and the production hardening final phase — see [docs/ROADMAP.md](docs/ROADMAP.md).
