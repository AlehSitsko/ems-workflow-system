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

## EntityDrawer

Standard right-side panel for all create / edit / view flows. **Do not use full-page forms or inline expand/collapse.**

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
| Create / Edit an entity | Irreversible confirmation (delete, cancel call) |
| View entity details | Single yes/no decision |
| Multi-tab flows | Short warning with two choices |

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

### Audit Log
- Grouped by entity type, card view.
- Uncancel available to dispatchers.

---

## Design Tokens

All colors come from `--ems-*` CSS custom properties defined in `App.css`. Never use hardcoded hex values in component styles.

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
