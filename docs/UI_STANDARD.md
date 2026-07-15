# EMS Workflow System — UI Standard

## Layout Primitives

### Page Shell
Every page uses `.page-stack` (flex column, gap 1rem). Top-level sections use `.content-panel`.

### Content Panel
```jsx
<section className="content-panel">
  <div className="content-panel-header">
    <div><h4>Title</h4><p>Subtitle</p></div>
    <div>{/* actions */}</div>
  </div>
  {/* body */}
</section>
```

---

## Data Display

### Cards vs Tables

| Use cards when | Use tables when |
|---|---|
| Each record has 4+ visible fields | Comparing rows column-by-column matters |
| Records have status, badge, or action variety | Dense read-only lists (audit log, payroll) |
| Clicking a row opens a drawer | Bulk selection needed |

### Detail Grid
Use `DetailGrid` / `DetailItem` components for key-value pairs inside a drawer or overview panel — not raw `<div>` pairs.

---

## Choosing a surface: Drawer vs Modal vs Full Page

The original rule — *everything* opens in a right-side drawer — does not survive
complex entities. A drawer that grows tabs, documents, history and analytics
becomes a cramped page with worse navigation. There are now **three levels**;
pick by what the user is doing, not by habit.

| Level | Surface | Use when | Examples |
|---|---|---|---|
| **1. Quick Peek** | `EntityDrawer` | Glance at a record and maybe take one action, without losing the list you are standing in | Calendar Day Operations, Dispatch call detail, compact previews |
| **2. Quick Create / Edit** | `EntityDrawer` | A short form — a handful of logical sections, no nested navigation | New call intake, crew unit create/edit, filters/settings |
| **3. Entity Workspace** | Full page + own route | A complex entity: several tabs, documents, history, analytics, related records, audit | `/fleet/vehicles/:id`, and later `/patients/:id`, `/employees/:id` |

Confirmations are always a **modal** (`ConfirmDialog`), never a drawer.

**Never** open a separate browser window as the primary UX. It can be blocked,
loses SPA context, complicates auth/state, breaks on mobile, and creates several
unsynchronised copies of the app.

Migrate to a workspace **incrementally** — Vehicles first (done), then
Employees, then Patients. Do not rewrite every module at once.

---

## Entity Workspace pattern

Implemented by `components/workspace/EntityWorkspace.jsx`.
`pages/fleet/VehicleWorkspacePage.jsx` is the reference implementation.

```jsx
<EntityWorkspace
  backTo="/fleet/vehicles" backLabel="Vehicles"
  title={vehicle.unitName} subtitle={`Unit ${vehicle.unitNumber}`}
  badges={<VehicleTypeBadge value={vehicle.unitType} />}
  tabs={[{ key: "overview", label: "Overview" },
         { key: "maintenance", label: "Maintenance", disabled: true,
           disabledReason: "Arrives with Fleet Management" }]}
  loading={loading} error={error} notFound={notFound}
  canView={hasFleetAccess(currentUser)} dirty={formDirty}
>
  {(activeTab) => activeTab === "overview" ? <Overview /> : null}
</EntityWorkspace>
```

**Rules:**
- **Canonical URL per entity.** `/<module>/<entity>/:id`. The record is the URL —
  it must be linkable, bookmarkable and survive a refresh.
- **Tab in the query string** (`?tab=compliance`). A deep link opens on that tab.
  Tab switches use `replace` so they don't stack history entries.
- **Back returns to the list *as the user left it*.** The list keeps its
  filters/search/page in its own URL and hands that query string to the
  workspace via router state; the workspace's back link restores it. A direct
  deep link falls back to the bare list URL.
- **The workspace owns its states** — loading, error, not-found, and
  no-permission. Callers pass flags; they don't invent their own empty states.
- **Permissions are a backend guarantee.** `canView` only decides what to render;
  the API must refuse the data regardless.
- **Unsaved changes** are protected via the `dirty` prop (guards the back link,
  tab switches, and page unload).
- **Don't fake tabs.** A section whose data doesn't exist yet is `disabled` with
  a `disabledReason`, never a fake or empty panel pretending to work.

**Known limitation:** `dirty` cannot block sidebar navigation, because
`useBlocker` needs a react-router *data* router and the app still mounts a
component `<HashRouter>`. Migrating to `createHashRouter` is tracked in TODO.md.

---

## EntityDrawer

The Quick Peek / Quick Create surface (levels 1–2 above). For complex entities
use an Entity Workspace instead.

```jsx
<EntityDrawer
  open={drawerOpen}
  onClose={handleClose}
  title="Patient Name"
  subtitle="Optional subtitle"
  width="50vw"
  tabs={[{ key: "overview", label: "Overview" }, { key: "edit", label: "Edit" }]}
  activeTab={drawerTab}
  onTabChange={setDrawerTab}
  footer={drawerTab === "edit" ? <SaveCancelButtons /> : null}
>
  {drawerTab === "overview" && <OverviewContent />}
  {drawerTab === "edit" && <form id="my-form" onSubmit={handleSave}>…</form>}
</EntityDrawer>
```

**Rules:**
- `width="50vw"` for all modules (default).
- Tab content lives in `children`, never in `tab.content`.
- Submit button in footer uses `type="submit" form="my-form"` pattern.
- Footer only renders on tabs that have actions.
- Inline reference data (e.g. Available Crew) goes inside the drawer body, not as a separate tab.

### When to use EntityDrawer vs Modal

| EntityDrawer | Modal (ConfirmDialog) |
|---|---|
| Quick create / edit (short form) | Irreversible confirmation (delete, cancel call) |
| Quick peek at a record | Single yes/no decision |
| Compact preview, filters, settings | Short warning with two choices |

A multi-tab flow is no longer a drawer case — that is an Entity Workspace.

---

## Toasts & Confirms

### Toast (non-blocking feedback)
```js
const toast = useToast();
toast.success("Unit saved");
toast.error("Save failed", errorMessage);
```
Use for: success after save, background errors, soft warnings.

### Confirm (blocking decision)
```js
const confirm = useConfirm();
const ok = await confirm("Delete this patient?", {
  confirmLabel: "Delete",
  variant: "danger",
});
if (!ok) return;
```
Use for: delete, cancel call, irreversible state changes.

**Never use `window.alert()` or `window.confirm()`.**

---

## Module Patterns

### Patients
- List: clickable cards → drawer opens on Overview tab.
- Add button → drawer opens on Edit tab (no patient selected).
- Tabs: Overview | Edit | Call History.

### Employees
- List: clickable cards → EntityDrawer.
- Tabs: Overview | Edit | Certifications (or similar).

### Calls
- List: compact call cards, clickable → EntityDrawer.
- Tabs: Summary | Trip | Quality.
- Cancel/Uncancel via ConfirmDialog.

### Crew Planner
- Page shows only `<PlannedUnitsList />`.
- Unit create/edit → EntityDrawer.
- Available staff: inline chip list inside Crew Assignment section of the form.

### Dispatch Board
- Three-panel layout: left call list | unit table | bottom inspector.
- Status advance: inline "→ Next Status" button on each unit row (double-click also works as shortcut).
- Call details: `CallDetailModal` opens on card click — all actions (complete, unassign, cancel) accessible without double-click.
- No important action should require double-click as the **only** access path.

### Payroll
- Two-column layout: left period list | right period detail.
- New Period → EntityDrawer. Edit Period → EntityDrawer.
- Status advance, export buttons stay inline in period detail panel.

### User Management
- Table only (no inline form card above table).
- Add User button → EntityDrawer (create mode).
- Click row or Edit button → EntityDrawer (edit mode).
- Deactivate → ConfirmDialog.

### Audit Log
- Grouped by entity type, card view with expand/collapse.
- Uncancel available to dispatchers.

---

## Operational classification (semantic colour system)

One meaning, one colour, in every module — and **colour is never the only
signal**. Every badge pairs its colour with a text label and a
tooltip/`aria-label`; an unrecognised value degrades to a neutral **Unknown**
badge that keeps the raw text in its tooltip rather than breaking or hiding it.

Vocabulary comes from the canonical taxonomy — `backend/utils/taxonomy.py`
(authoritative, published at `GET /api/taxonomy`) mirrored by
`frontend/src/utils/taxonomy.js`. **Never re-declare these lists in a component.**

### Four axes that are not interchangeable

| Axis | Meaning | Component |
|---|---|---|
| Service level | Level of care. `Patient.default_service_level` is a *preference*; `Call.service_level` is the *actual* requirement of that trip | `ServiceLevelBadge` |
| Unit type | How a crew unit is deployed for a day | `UnitTypeBadge` |
| Vehicle capability | What a physical vehicle can do | `VehicleTypeBadge` |
| Qualification | What an employee is qualified to do | `QualificationBadge`, `EmployeeAvatar` ring |

**Qualification is not the shift role.** The role comes from the DailyCrewUnit
slot, so a Paramedic can be rostered as Driver. `AssignedRoleBadge` is
icon-led and colour-neutral on purpose, so it can never be mistaken for the
qualification colour.

`emergency` is a **call type**, not a service level — it must never appear in a
service-level selector.

### Tokens

Semantic tokens live in `styles/theme.css` as RGB triplets, with light and dark
values, so callers can tint them: `rgba(var(--ems-tax-bls-rgb), .14)`.

```
--ems-tax-bls|als|bls4|bls6|cct|bariatric|stretcher|wheelchair|assist|unknown-rgb
--ems-qual-driver|emt|paramedic|assist|admin|unknown-rgb
```

Colour meanings: BLS green · ALS blue · BLS-4/6 orange/amber · Bariatric purple ·
CCT burgundy · Assist grey · Stretcher teal · Wheelchair slate · Unknown neutral.
Qualification: Driver-only slate · EMT teal/green · Paramedic blue · Supervisor
purple (**administrative badge, not a clinical qualification**).

An ALS-on-BLS mismatch stays an explicit **warning**, not merely a colour
difference.

---

## Design Tokens

All colors come from `--ems-*` CSS custom properties defined in `styles/theme.css`. Never use hardcoded hex values in component styles.

Common tokens:
```
--ems-primary            Blue accent
--ems-bg-surface         Page / drawer background
--ems-bg-surface-2       Inset / secondary surface
--ems-border             Default border
--ems-text-primary       Body text
--ems-text-muted         Labels, subtitles
--ems-section-bg         Section card background
--ems-section-border     Section card border
```

Dispatch Board uses its own `--ems-board-*` namespace for the dark operational theme.

---

## Known Inconsistencies (tracked, not yet fixed)

Found during the stabilization/documentation audit — listed here so they're not lost, tracked with full detail in [ROADMAP.md](ROADMAP.md) Priority 2:

- **`window.alert`/`window.confirm` have been removed from all application modules** (fixed in a later pass, including the `CallDrawer.jsx` regression this section used to track — `grep -Rni "window.confirm|window.alert" frontend/src backend` returns nothing). Destructive and unsaved-change confirmations use the shared `ConfirmDialog`/`useConfirm` pattern everywhere.
- **Hardcoded hex colors** still appear in several components (`CallForm.jsx`, `PatientOrderSection.jsx`, `PlannedUnitsList.jsx`, `CallDrawer.jsx`, `DocumentsTab.jsx`, `NotificationBell.jsx`, `PushNotificationBanner.jsx`, `Topbar.jsx`, `BrowserNotificationSettings.jsx`) despite the design-token rule above. Needs a file-by-file review — some hits may be legitimate (SVG data URIs, one-off non-UI colors), not a blind find-and-replace. Operational *classification* colours are already tokenised (see above).
- **Drawer-first legacy.** Patients and Employees still use large multi-tab drawers. They are the next Entity Workspace migrations (Vehicles is the reference implementation); the drawers stay until then.
- **Unsaved-changes guarding** only covers a workspace's own back link, tab switches and page unload — sidebar navigation is not blocked until the app moves to a react-router data router.
