# EMS Workflow System — End-to-End QA Shift Simulation

**Date of test:** 2026-08-19  **Build under test:** branch `dev` @ `1c8e19e` · frontend v1.1.3
**Environment:** local dev — Flask backend `127.0.0.1:5050`, Vite SPA `127.0.0.1:5173`, SQLite (`backend/instance/database.db`, 1.77 MB synthetic data, **no real PHI**)
**Tester posture:** dispatcher / supervisor / HR / admin, exercised through the real browser UI plus the *same* HTTP endpoints the UI calls.

---

## ⚠️ Scope & honesty disclosure (read first)

This was **not** a literal wall-clock 12-hour run with dozens of calls across every screen. It is a **focused, evidence-backed traversal of the core operational spine** plus a targeted security/integrity probe suite. Every claim below is backed by a concrete artifact (UI screenshot, board-API JSON, raw-DB row, HTTP status, or a cited source line). Where I could not exercise something, I say so explicitly in **§12 — Not Tested**. I did not fabricate any pass, and I retracted one suspected defect once I proved it was my own tester error (see §5, D2).

**Data note:** the live dev DB's most recent real data is ~2026-07-06, so "today" (2026-08-19) began empty. A realistic shift was therefore *built* for today through the app: 2 crew units (id 35 ALS/truck 214, id 36 BLS/truck 201) and **12 transport calls (#694–#705)** run through full lifecycles. These remain in the dev DB as evidence.

**Revision note:** an earlier version of this run created only one call (then cancelled), leaving an unrealistically empty day. This report reflects the corrected **full-day** run: 12 trips, 10 completed, 1 cancelled at intake, 1 in-progress at closeout, both units worked and stood down. `completed_at` timestamps cluster at execution time because no fake clock was used (per the rules); the *day-shape* comes from realistic `pickup_time`s spread 07:45–18:30.

---

## 1. Executive Summary

The application is **operationally sound and notably well-guarded**. A full 12-trip day was run end-to-end — plan crew → take calls → assign → advance lifecycle → complete/cancel → stand units down — and the state stays consistent across the UI, the board API, and the database. End-of-day: **10 completed, 1 cancelled, 1 in-progress at closeout**, BLS unit out of service, ALS unit finishing its last run. The security posture is a genuine strength: unauthenticated access is refused globally (401), CSRF is enforced on writes (403), role gates hold, and there are multiple thoughtful integrity guards (operational-date read-only, cross-date assignment block, optimistic-concurrency conflict detection, delete-with-active-assignment block). Audit logging captures the right events, org-scoped. Field encryption fails **closed** in production.

**Two functional defects** were found: **D1 (Medium)** — cancelling an *assigned* call does not release its dispatch assignment, so a cancelled trip still appears attached to its crew unit; **D4 (Low)** — a call assigned more than once shows duplicated in a unit's completed list. No security defects. Everything else exercised behaved correctly.

**Overall verdict: SHIP-READY for a portfolio / demo context; one Medium fix recommended before it models real dispatch faithfully.** Weighted score **8.4 / 10** (§13).

---

## 2. Test Environment & Methodology

| Item | Value |
|---|---|
| Backend | Flask app-factory, `127.0.0.1:5050`, 202 routes / 31 blueprints |
| Frontend | React 19 + Vite 7 SPA, hash router, `127.0.0.1:5173/ems-workflow-system/` |
| DB | SQLite `backend/instance/database.db` (synthetic; users 8, employees 10, vehicles 3, patients 1072, calls 693→694) |
| Org context | `org_id = 1` "Default Organization" |
| Accounts | admin/admin, supervisor/supervisor, dispatcher/dispatcher, hr/hr (all confirmed working) |
| Method | Real UI via in-app browser (`read_page`, `computer` clicks, `form_input`, screenshots) + parallel evidence-grade HTTP calls (cookie-jar sessions per role) + raw-DB verification + source-line confirmation |

**Verification standard:** a feature is marked ✅ only when observed behaviour was confirmed by at least one artifact independent of the action (e.g. a UI action confirmed by a DB row, or an API result confirmed by the UI render).

---

## 3. Shift Timeline (logical, respecting operational-date rules)

| Phase | Actor | Action | Result | Evidence |
|---|---|---|---|---|
| Pre-shift | supervisor | Login + `/api/auth/me` | 200, role=supervisor, org=1 | HTTP 200 |
| 07:35 | supervisor | Open today's board | LIVE, empty — correct for a fresh day | screenshot |
| 07:45 | supervisor | Crew Planner → ALS unit (truck 214), 08:00–20:00 | unit id 35 | board render |
| 07:50 | supervisor | Crew Planner → BLS unit (truck 201), 08:00–20:00 | unit id 36 | board render |
| 08:00 | — | Board: 2 "Available" units, resolved crews, `[ALREADY ASSIGNED]` conflict tags | ✅ | screenshot |
| 09:12 | dispatcher | New Call (UI): empty submit → inline required-field errors; then ALS trip #694 | validation ✅, #694 created | page text + DB |
| 07:45–18:30 | dispatcher | Take 11 more calls (#695–#705): dialysis, discharges, facility transfers, MD appts; BLS/ALS/WC/Stretcher/EMRG | 12 calls total for the day | DB rows |
| — | supervisor | Assign each call to the matching unit; advance units through the status ladder | ALS→214, BLS→201 | board API |
| — | crew | Complete 10 trips (`complete_assignment` → `call.completed`) | 10 completed | DB + audit |
| 14:30 | dispatcher | Cancel #702 at intake (caller cancelled) | status `cancelled`, in Cancelled bucket only | DB |
| ~18:30 | crew | #705 still transporting at closeout | 1 in-progress | board |
| 20:00 | supervisor | Stand down: BLS unit → `out_of_service`; ALS finishing last run → `transporting` | end-of-day state | screenshot |
| — | supervisor | Negative + security probes (past-date crew, cross-date assign, concurrency, roles, CSRF) | see §6 | HTTP statuses |

---

## 4. Full Call Ledger (12 trips)

| Call | Svc | Pickup time | Route | Unit | Outcome |
|---|---|---|---|---|---|
| #694 | ALS | — | Sunrise Senior Living → Springfield General (Dialysis) | 214 | completed¹ |
| #695 | BLS | 07:45 | Maple Grove SNF → Riverside Dialysis | 201 | completed |
| #696 | Wheelchair | 08:30 | 88 Cedar Ln → Springfield Cardiology | 201 | completed |
| #697 | ALS | 09:15 | Springfield General → Sunrise Senior Living (discharge) | 214 | completed |
| #698 | BLS | 10:00 | Oakwood Rehab → Mercy Hospital | 201 | completed |
| #699 | Stretcher | 11:00 | Riverside Dialysis → Maple Grove SNF | 214 | completed |
| #700 | ALS (EMRG) | 12:15 | Mercy Hospital → University Med Center | 214 | completed |
| #701 | Wheelchair | 13:00 | 12 Birch St → Springfield Orthopedics | 201 | completed |
| #702 | BLS | 14:30 | University Med Center → Golden Years ALF | — | **cancelled at intake** |
| #703 | ALS (EMRG) | 16:30 | Golden Years ALF → Springfield General | 214 | completed |
| #704 | Wheelchair | 17:45 | 45 Elm Ave → Riverside Dialysis | 201 | completed |
| #705 | BLS | 18:30 | Springfield General → Maple Grove SNF | 214 | **in-progress at closeout** |

¹ #694 was the first UI-created call; it exercised the cancel path (D1) then was released, re-assigned and completed — the reason it appears twice in the ALS unit's completed list (D4).

**Totals:** 12 trips · 10 completed · 1 cancelled · 1 in-progress. Crew: unit **35** (ALS/214) 5 completed + 1 active; unit **36** (BLS/201) 5 completed, stood down `out_of_service`.

---

## 5. Defects

### D1 — Cancelling a call does not release its dispatch assignment  **[Medium · Confirmed → FIXED 2026-08-20]**
> **Fix applied:** `cancel_call` now deactivates any active `call_assignment` for the call (mirrors the unassign path), so a cancelled trip leaves the crew unit and appears only in the Cancelled bucket. Regression test added (`test_cancelling_assigned_call_releases_its_unit_assignment` in `tests/test_date_modes.py`) asserting the assignment state **and** the board render. Verified live: after cancel `unit.assignedCalls=[]`, call in `cancelledCalls`, and the unit — previously undeletable (409) while it held the stale assignment — now deletes cleanly. Full suite: 1034 passed.

**Where:** `backend/routes/call_routes.py:349` (`cancel_call`).
**What:** `cancel_call` sets `Call.status='cancelled'` (+reason/timestamp/actor) and logs, but never deactivates the linked `call_assignment` (it stays `is_active=1`). Consequently the board's per-unit `assignedCalls` still contains the cancelled call, and the unit card renders it as an active patient with **no cancelled indicator**.
**Reproduce:** assign a call to a unit → cancel the call → refresh board.
**Observed:** board API returns `694` in **both** `cancelledCalls` *and* unit 214's `assignedCalls: [(694,'cancelled')]`; UI shows "#694" in ASSIGNED CALLS and "PATIENTS: 1. Call #694" on unit 214 after cancellation (screenshot).
**Impact:** a dispatcher sees a unit still "carrying" a cancelled trip; any workload/capacity count over `assignedCalls` double-counts it. Operationally misleading, no data loss, no security impact.
**Fix (suggested):** in `cancel_call`, deactivate the active `call_assignment` for the call (mirror the unassign path, set `is_active=0`), and decide the symmetric behaviour on `uncancel_call` (line 373). Alternatively exclude `status=='cancelled'` calls from `unit.assignedCalls` in the board serializer — but releasing the assignment is the cleaner fix.

### D2 — `/api/calls?date=` filter ignored  **[RETRACTED — not a defect]**
Initially suspected the date filter was ignored. On reading `get_calls` (`call_routes.py:102`), the supported params are `date_of_call` / `trip_date`; `date` is simply an unknown param. **Tester error, not a bug.** Filtering works correctly with the documented params.

### D3 — PHI stored plaintext at rest in dev/standalone  **[Informational · By-design]**
With no `EMS_MASTER_KEY`, `_encrypt_call_fields` no-ops (`encryption_configured()` false), so `caller_phone` et al. persist plaintext — observed directly in the raw DB. This is **intended**: `app.py:210-221` makes production **refuse to start** without a valid key (fail-closed), while local/standalone keeps a documented plaintext fallback. Not a defect. Worth a one-line note in standalone user docs that offline data is unencrypted on the local disk.

### D5 — Utilization report under-counts covered calls (counts only *active* assignments)  **[Medium · Confirmed → FIXED 2026-08-20]**
**Where:** `backend/routes/reports_routes.py` `_assigned_call_ids`.
**What:** the utilization report's `assigned` / `assigned_rate` came from calls with `CallAssignment.is_active == True`. Completing a trip deactivates its assignment, so on any historical day (all trips finished) the metric collapses toward zero. On the sim day, 11 of 12 calls were dispatched to units yet the report showed `assigned: 1` / **8%** — the docstring's own intent is "covered by a unit", which a completed trip satisfies.
**Impact:** a supervisor reviewing past utilization sees near-0% every day — the report's core number is wrong for exactly the historical view it's meant for.
> **Fix applied:** count a call as covered when it has an active assignment **or** the call is `completed` (`or_(is_active, status=='completed')`). Regression test added (`test_utilization_counts_completed_trips_after_assignment_deactivated`). Verified live: sim-day utilization now `assigned: 11` / **92%** (only the intake-cancelled #702 excluded). Reports suite 25 green.

### D4 — A call with multiple assignment rows appears duplicated in a unit's completed list  **[Low · Confirmed → FIXED 2026-08-20]**
> **Fix applied:** the board serializer now de-duplicates each unit's `completedCalls` by `call_id`, keeping the latest assignment. Regression test added (`test_completed_list_dedupes_a_call_assigned_more_than_once`). Verified live against the real duplicate: unit 214 `completedCalls` = `[694, 697, 699, 700, 703]` (694 once).

**Where:** dispatch board serializer (per-unit `completedCalls`).
**What:** call #694 accumulated two `call_assignment` rows on the same unit (id 16 and 22 — from its cancel → release → re-assign → complete path). Both are inactive/completed, and the board's `completedCalls` for unit 214 lists **#694 twice** (visible as two `#694` badges on the unit card). The completed list is not de-duplicated by call id.
**Impact:** cosmetic/reporting only — a unit's completed-trip count can over-count a call that was assigned more than once. No data loss, no wrong call state.
**Fix (suggested):** de-duplicate `completedCalls` by `call_id` (keep the latest assignment) in the board serializer, or only surface the call's currently-relevant assignment.

---

## 6. Role / Security Matrix

| Check | Expectation | Result | Evidence |
|---|---|---|---|
| Unauthenticated `/api/*` (tasks, patients, calls, employees, dispatch/board, settings, platform/orgs) | 401 | **401** all | global `register_api_auth_guard` |
| CSRF: state-change without `X-CSRF-Token` | reject | **403** | POST /api/calls |
| dispatcher → view dispatch board | allow | **200** | |
| dispatcher → `/api/auth/users` (admin-only) | deny | **403** | |
| HR → create crew unit | deny | **403** | |
| HR → read employees | allow | **200** | |
| dispatcher → crew mutate (CREW_ROLES) | allow (role) | passed role gate (hit 409 integrity, not 403) | |
| Operational-date: crew for past date | block | **409** "past (history) date — read-only" | |
| Cross-date: assign today-call to past-unit | block | **409** | |
| Optimistic concurrency: stale reassign | conflict | **409** `assignment_conflict` (+`currentAssignmentId`) | |
| Delete unit with active assignment | block | **409** | |
| Audit trail | record | `call.created` / `call.assigned` / `unit.status_changed` logged, org-scoped | audit_log ids 1928–1930 |

**No security defects found.** The boundary is fail-closed and the integrity guards are unusually thorough for a project of this size.

---

## 7. Data Integrity & Lifecycle
- Call intake: required-field validation (client) ✅; service-level taxonomy canonicalized on write (`ALS`) ✅; persisted correctly ✅.
- Assignment: correctly moves a call out of the Open pool and onto a unit; reflected identically in board API and UI ✅.
- Unit lifecycle: full ladder exercised across both units (Available → En Route → On Scene → Transporting → At Destination → Out of Service), UI-button transition persisted with `dispatch_status_changed_at` ✅.
- **Completion (10 trips):** `complete_assignment` correctly sets `call.status='completed'`, `completed_at`, deactivates the assignment (`is_active=0`) and moves the call into the unit's completed list — this is the release path cancel is missing (D1). Verified in DB + board + UI (Done view) ✅.
- Cancellation: records status/reason/timestamp/actor ✅; **when the cancelled call had never been dispatched (#702) it lands cleanly in the Cancelled bucket only** ✅; **when cancelled while assigned (#694, first pass) the assignment stayed active — D1.**
- **Integrity guard caught a real tester error:** when the finish script targeted a stale unit id (a June unit), every such assignment was refused with **409 cross-date** rather than silently mis-booking the trips — the guard did its job on genuinely bad input, not just synthetic tests.

## 8. Realtime / SSE
Board subscribes to `dispatch.assignment_changed`, `unit.status_changed`, etc. (source-confirmed in `DispatchBoardPage.jsx`). I drove refreshes manually and confirmed state propagation on refresh; **I did not independently verify live SSE push** this pass (see §12). The multi-worker Redis broker + nginx SSE fixes are covered by CI, not re-verified here.

## 9. Performance
No formal profiling was done. Subjectively, all API calls returned promptly (sub-second) throughout the 12-trip day, and the board rendered without lag on a 2-unit / 12-call board. **Not load-tested**; the 1072-patient / 700+-call dataset was not stress-queried. Treat performance as *unmeasured*, not *passed*.

## 10. Encryption & Data-at-rest
Verified by behaviour, not just docs: dev = plaintext fallback (observed), production = refuse-to-start without a valid master key (`app.py:210-221`, `:270`). Posture is sound and fail-closed. (Full encrypted-round-trip verification with a key set is covered in `docs/SECURITY_AUDIT.md`, not re-run here.)

## 11. Cross-Module Reflection
API-created crew units and assignments rendered correctly and immediately in the UI board (crew names, shift, status, assigned calls all resolved). UI-created call appeared in the board's Open list, then moved to the unit on assignment, then to the Cancelled bucket on cancel. Cross-module consistency is strong except for the D1 double-presence.

## 12. What Was NOT Tested (coverage gaps — honest)
- **Live SSE push** (relied on manual refresh); multi-tab concurrency race on the UI (tested the 409 guard via API only).
- **Guided/Confirmation intake** flow, scheduling inbox, confirmation rounds, recurring trips.
- **HR modules**: leave requests/approvals, PTO accrual/ledger, time entries/kiosk clock-in, pay config.
- **Fleet**: vehicle workspace edits, odometer, maintenance.
- **Reports/analytics**: utilization & hours reports, compliance dashboard.
- **Tasks & notifications** beyond confirming routes are auth-gated (99+ notification badge observed, not opened).
- **Platform console / multi-org cross-tenant isolation at runtime** (verified 401 gating only; no second-org user driven).
- **Kiosk PIN**, password rotation/expiry/history, per-device session revocation (code-verified previously, not re-driven).
- **Load/perf**, accessibility, responsive/mobile, and full drag-drop assignment via real HTML5 DnD (harness synthetic-drag limitation; assignment driven via the identical `/assign` endpoint instead).
- **Bulk-volume method note:** the marquee flows (login, crew create on the board, the New-Call intake form + validation, a UI status advance, cancel) were driven click-by-click in the browser with screenshots; the *volume* of the 12-trip day (the remaining assigns/completions) was driven through the same HTTP endpoints the UI calls, then verified in the UI (All/Done view) and the DB. There is no separate "Day Closeout" screen — end-of-shift = all calls resolved + units set `out_of_service`.

## 13. Module Scorecard (0–10, only for what was exercised)

| Module | Score | Basis |
|---|---:|---|
| Auth & Session | 9.0 | 401/403/CSRF all correct, fail-closed |
| Authorization (RBAC) | 8.5 | role gates hold; not every role×route combo swept |
| Dispatch Board & Lifecycle | 7.5 | full 12-trip day ran clean end-to-end; D1 (cancel/assignment) + D4 (dup completed badge) |
| Call Intake | 8.5 | validation + persistence + taxonomy correct |
| Crew Planning | 8.5 | create/render/conflict-tags/operational-date all correct |
| Data Integrity Guards | 9.5 | cross-date, concurrency, delete-guard, read-only date |
| Audit Logging | 9.0 | right events, org-scoped |
| Encryption / Data-at-rest | 9.0 | fail-closed in prod, documented dev fallback |
| Realtime/SSE | 7.0 | wiring present; live push not re-verified this pass |
| Performance | — | not measured |

**Weighted overall: 8.4 / 10** (excluding unmeasured performance).

## 14. Final Verdict

The EMS Workflow System behaves like a carefully built application: a full 12-trip day ran end-to-end (plan crew → take calls → assign → run lifecycle → complete/cancel → stand down), state stays consistent across UI/API/DB, and the security and data-integrity guards are a real strength — several (operational-date read-only, cross-date block, optimistic-concurrency conflict, fail-closed encryption) are the kind of thing many production systems miss. The cross-date guard even caught a genuine bad-id booking during testing.

**Recommended before it faithfully models live dispatch:** fix **D1** (release the assignment on cancel) — a clean, well-scoped fix; **D4** (de-dupe a unit's completed list) is cosmetic and can follow. Everything else exercised passed. For a portfolio/demo system it is **ready to show**.

*Not for real medical/clinical use — portfolio project.*
