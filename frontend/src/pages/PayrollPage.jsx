import React, { useState, useEffect, useCallback } from "react";
import { FaMoneyBillWave, FaDownload, FaPlus, FaCheck, FaSearch, FaEdit, FaTrash } from "react-icons/fa";
import { getPeriods, createPeriod, updatePeriod, updatePeriodStatus, deletePeriod, getPeriodSummary, exportPayroll } from "../api/payrollApi";
import { getCurrentUser } from "../api/authApi";
import EntityDrawer from "../components/ui/EntityDrawer";
import { useConfirm } from "../components/ui/ConfirmDialog";
import { useToast } from "../components/ui/ToastProvider";

const STATUS_META = {
  open:     { label: "Open",     color: "#6c757d", bg: "rgba(108,117,125,0.12)" },
  review:   { label: "Review",   color: "#ffc107", bg: "rgba(255,193,7,0.12)" },
  approved: { label: "Approved", color: "#75b798", bg: "rgba(25,135,84,0.12)" },
  exported: { label: "Exported", color: "#6ea8fe", bg: "rgba(110,168,254,0.12)" },
};

const STATUS_FLOW = { open: "review", review: "approved", approved: "exported" };
const STATUS_LABEL = { open: "Submit for Review", review: "Approve", approved: "Mark Exported" };

function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.open;
  return (
    <span style={{ fontSize: 11, padding: "2px 10px", borderRadius: 20, background: m.bg, color: m.color, fontWeight: 700 }}>
      {m.label}
    </span>
  );
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function weekAgoStr() {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  return d.toISOString().slice(0, 10);
}

export default function PayrollPage() {
  const confirm = useConfirm();
  const toast = useToast();
  const currentUser = getCurrentUser();
  const canManage = ["admin", "supervisor", "hr"].includes(currentUser?.role);

  const [periods, setPeriods] = useState([]);
  const [selected, setSelected] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [search, setSearch] = useState("");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState("create");
  const [drawerSaving, setDrawerSaving] = useState(false);
  const [drawerError, setDrawerError] = useState("");

  const [createForm, setCreateForm] = useState({
    start_date: weekAgoStr(),
    end_date: todayStr(),
    period_type: "weekly",
    notes: "",
  });

  const [editForm, setEditForm] = useState({});

  const load = useCallback(async () => {
    try { setPeriods(await getPeriods()); } catch { /* noop */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSelect = async (period) => {
    setSelected(period);
    setSummary(null);
    setLoadingSummary(true);
    try {
      const s = await getPeriodSummary(period.id);
      setSummary(s);
    } catch { /* noop */ }
    setLoadingSummary(false);
  };

  const openCreate = () => {
    setCreateForm({ start_date: weekAgoStr(), end_date: todayStr(), period_type: "weekly", notes: "" });
    setDrawerError("");
    setDrawerMode("create");
    setDrawerOpen(true);
  };

  const openEdit = () => {
    if (!selected) return;
    setEditForm({
      start_date: selected.start_date,
      end_date: selected.end_date,
      period_type: selected.period_type,
      notes: selected.notes || "",
    });
    setDrawerError("");
    setDrawerMode("edit");
    setDrawerOpen(true);
  };

  const handleDrawerClose = () => {
    setDrawerOpen(false);
    setDrawerError("");
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setDrawerSaving(true);
    setDrawerError("");
    try {
      const p = await createPeriod({ ...createForm, created_by: currentUser?.id });
      await load();
      handleDrawerClose();
      handleSelect(p);
      toast.success("Pay period created", `${p.start_date} → ${p.end_date}`);
    } catch (err) {
      setDrawerError(err.message || "Create failed.");
    }
    setDrawerSaving(false);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    setDrawerSaving(true);
    setDrawerError("");
    try {
      const updated = await updatePeriod(selected.id, editForm);
      setSelected(updated);
      await load();
      handleDrawerClose();
      setLoadingSummary(true);
      try { setSummary(await getPeriodSummary(updated.id)); } catch { /* noop */ }
      finally { setLoadingSummary(false); }
      toast.success("Period updated");
    } catch (err) {
      setDrawerError(err.message || "Save failed.");
    }
    setDrawerSaving(false);
  };

  const handleDelete = async () => {
    if (!selected) return;
    const ok = await confirm({
      title: "Delete pay period?",
      message: `${selected.start_date} → ${selected.end_date}. This cannot be undone.`,
      variant: "danger",
      confirmLabel: "Delete",
    });
    if (!ok) return;
    try {
      await deletePeriod(selected.id);
      setSelected(null);
      setSummary(null);
      await load();
      toast.success("Pay period deleted");
    } catch (err) { toast.error("Delete failed", err.message); }
  };

  const handleAdvanceStatus = async () => {
    if (!selected) return;
    const next = STATUS_FLOW[selected.status];
    if (!next) return;
    try {
      const updated = await updatePeriodStatus(selected.id, next, next === "exported" ? "csv" : undefined);
      setSelected(updated);
      await load();
      toast.success("Status updated", `Period moved to ${next}`);
    } catch (err) { toast.error("Update failed", err.message); }
  };

  const handleExport = (fmt) => {
    exportPayroll(selected.id, fmt);
    if (selected.status === "approved") {
      updatePeriodStatus(selected.id, "exported", fmt)
        .then((u) => { setSelected(u); load(); })
        .catch(() => {});
    }
  };

  const filteredPeriods = periods.filter(p => {
    if (!search) return true;
    return p.start_date.includes(search) || p.end_date.includes(search) || p.status.includes(search.toLowerCase());
  });

  const totals = summary?.employees?.reduce((acc, r) => ({
    total_hours: acc.total_hours + r.total_hours,
    regular_hours: acc.regular_hours + r.regular_hours,
    ot_hours: acc.ot_hours + r.ot_hours,
    total_pay: acc.total_pay + r.total_pay,
  }), { total_hours: 0, regular_hours: 0, ot_hours: 0, total_pay: 0 });

  const drawerFormId = drawerMode === "create" ? "create-period-form" : "edit-period-form";

  const drawerFooter = (
    <div className="d-flex gap-2">
      <button type="submit" form={drawerFormId} className="btn btn-primary" disabled={drawerSaving}>
        {drawerSaving ? "Saving…" : drawerMode === "create" ? "Create" : "Save"}
      </button>
      <button type="button" className="btn btn-outline-secondary" onClick={handleDrawerClose}>
        Cancel
      </button>
    </div>
  );

  return (
    <div className="page-stack">
      <div className="content-panel-header" style={{ marginBottom: 0 }}>
        <div>
          <h4 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <FaMoneyBillWave style={{ color: "#75b798" }} /> Payroll Periods
          </h4>
          <p style={{ margin: 0, color: "var(--ems-text-muted)", fontSize: 13 }}>Pay period management, approval, and CSV export</p>
        </div>
        {canManage && (
          <button className="btn btn-sm btn-primary d-flex align-items-center gap-1" onClick={openCreate}>
            <FaPlus /> New Period
          </button>
        )}
      </div>

      <div className="row g-3" style={{ flex: 1 }}>
        {/* Period list */}
        <div className="col-md-4">
          <div className="content-panel" style={{ height: "100%", minHeight: 300 }}>
            <div className="d-flex align-items-center gap-2 mb-3">
              <FaSearch style={{ color: "var(--ems-text-muted)", fontSize: 12 }} />
              <input
                type="text"
                className="form-control form-control-sm"
                placeholder="Filter periods…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ fontSize: 13 }}
              />
            </div>
            {filteredPeriods.length === 0 ? (
              <p className="text-muted small">No pay periods yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {filteredPeriods.map(p => (
                  <button
                    key={p.id}
                    onClick={() => handleSelect(p)}
                    style={{
                      background: selected?.id === p.id ? "var(--ems-bg-surface-2)" : "transparent",
                      border: `1px solid ${selected?.id === p.id ? "#6ea8fe" : "var(--ems-border)"}`,
                      borderRadius: 8,
                      padding: "10px 14px",
                      textAlign: "left",
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    <div className="d-flex align-items-center justify-content-between mb-1">
                      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ems-text-primary)" }}>
                        {p.start_date} → {p.end_date}
                      </span>
                      <StatusBadge status={p.status} />
                    </div>
                    <div style={{ fontSize: 11, color: "var(--ems-text-muted)" }}>{p.period_type} · #{p.id}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Period detail */}
        <div className="col-md-8">
          {!selected ? (
            <div className="content-panel d-flex align-items-center justify-content-center" style={{ minHeight: 300, color: "var(--ems-text-muted)" }}>
              <p>Select a pay period to view details</p>
            </div>
          ) : (
            <div className="content-panel">
              {/* Header */}
              <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "var(--ems-text-primary)" }}>
                    {selected.start_date} — {selected.end_date}
                  </div>
                  <div className="d-flex align-items-center gap-2 mt-1">
                    <StatusBadge status={selected.status} />
                    <span style={{ fontSize: 12, color: "var(--ems-text-muted)" }}>{selected.period_type}</span>
                    {selected.notes && <span style={{ fontSize: 12, color: "var(--ems-text-muted)" }}>· {selected.notes}</span>}
                  </div>
                </div>
                {canManage && (
                  <div className="d-flex gap-2 flex-wrap">
                    <button className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1" onClick={openEdit}>
                      <FaEdit /> Edit
                    </button>
                    <button className="btn btn-sm btn-outline-danger d-flex align-items-center gap-1" onClick={handleDelete}>
                      <FaTrash /> Delete
                    </button>
                    {STATUS_FLOW[selected.status] && (
                      <button className="btn btn-sm btn-outline-success d-flex align-items-center gap-1" onClick={handleAdvanceStatus}>
                        <FaCheck /> {STATUS_LABEL[selected.status]}
                      </button>
                    )}
                    {(selected.status === "approved" || selected.status === "exported") && (
                      <>
                        <button className="btn btn-sm btn-outline-primary d-flex align-items-center gap-1" onClick={() => handleExport("csv")}>
                          <FaDownload /> CSV
                        </button>
                        <button className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1" onClick={() => handleExport("gusto")}>
                          <FaDownload /> Gusto
                        </button>
                        <button className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1" onClick={() => handleExport("adp")}>
                          <FaDownload /> ADP
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Totals */}
              {totals && (
                <div className="d-flex gap-3 flex-wrap mb-3">
                  {[
                    { label: "Total Hours", value: totals.total_hours.toFixed(1) + "h" },
                    { label: "Regular", value: totals.regular_hours.toFixed(1) + "h" },
                    { label: "Overtime", value: totals.ot_hours.toFixed(1) + "h", color: totals.ot_hours > 0 ? "#ffc107" : undefined },
                    { label: "Est. Total Pay", value: "$" + totals.total_pay.toFixed(2), color: "#75b798" },
                  ].map(s => (
                    <div key={s.label} style={{ background: "var(--ems-bg-surface-2)", borderRadius: 8, padding: "8px 16px", minWidth: 100 }}>
                      <div style={{ fontSize: 10, color: "var(--ems-text-muted)", textTransform: "uppercase", marginBottom: 2 }}>{s.label}</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: s.color || "var(--ems-text-primary)" }}>{s.value}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Employee table */}
              {loadingSummary ? (
                <p className="text-muted small">Loading summary…</p>
              ) : !summary || summary.employees.length === 0 ? (
                <p className="text-muted small">No time entries found for this period.</p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table className="table table-sm table-hover" style={{ fontSize: 13 }}>
                    <thead>
                      <tr style={{ color: "var(--ems-text-muted)" }}>
                        <th>Employee</th>
                        <th className="text-end">Total h</th>
                        <th className="text-end">Regular h</th>
                        <th className="text-end">OT h</th>
                        <th className="text-end">Rate</th>
                        <th className="text-end">Reg Pay</th>
                        <th className="text-end">OT Pay</th>
                        <th className="text-end">Total Pay</th>
                        <th className="text-end">Entries</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.employees.map(r => (
                        <tr key={r.employee_id}>
                          <td>
                            <div style={{ fontWeight: 600 }}>{r.first_name} {r.last_name}</div>
                            {r.employee_number && <div style={{ fontSize: 11, color: "var(--ems-text-muted)" }}>#{r.employee_number}</div>}
                          </td>
                          <td className="text-end">{r.total_hours.toFixed(1)}</td>
                          <td className="text-end">{r.regular_hours.toFixed(1)}</td>
                          <td className="text-end" style={{ color: r.ot_hours > 0 ? "#ffc107" : undefined, fontWeight: r.ot_hours > 0 ? 700 : undefined }}>
                            {r.ot_hours.toFixed(1)}
                          </td>
                          <td className="text-end">${r.hourly_rate.toFixed(2)}</td>
                          <td className="text-end">${r.regular_pay.toFixed(2)}</td>
                          <td className="text-end" style={{ color: r.ot_pay > 0 ? "#ffc107" : undefined }}>
                            ${r.ot_pay.toFixed(2)}
                          </td>
                          <td className="text-end" style={{ fontWeight: 700 }}>${r.total_pay.toFixed(2)}</td>
                          <td className="text-end" style={{ color: "var(--ems-text-muted)" }}>{r.entry_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Create / Edit Drawer */}
      <EntityDrawer
        open={drawerOpen}
        onClose={handleDrawerClose}
        title={drawerMode === "create" ? "New Pay Period" : `Edit: ${selected?.start_date} → ${selected?.end_date}`}
        subtitle={drawerMode === "create" ? "Define a new payroll period" : "Update pay period details"}
        footer={drawerFooter}
      >
        {drawerError && (
          <div className="alert alert-danger mb-3">{drawerError}</div>
        )}

        {drawerMode === "create" ? (
          <form id="create-period-form" onSubmit={handleCreate}>
            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label">Start Date</label>
                <input type="date" className="form-control" value={createForm.start_date}
                  onChange={e => setCreateForm(f => ({ ...f, start_date: e.target.value }))} required />
              </div>
              <div className="col-md-6">
                <label className="form-label">End Date</label>
                <input type="date" className="form-control" value={createForm.end_date}
                  onChange={e => setCreateForm(f => ({ ...f, end_date: e.target.value }))} required />
              </div>
              <div className="col-md-6">
                <label className="form-label">Type</label>
                <select className="form-select" value={createForm.period_type}
                  onChange={e => setCreateForm(f => ({ ...f, period_type: e.target.value }))}>
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Bi-weekly</option>
                </select>
              </div>
              <div className="col-md-6">
                <label className="form-label">Notes</label>
                <input type="text" className="form-control" value={createForm.notes}
                  onChange={e => setCreateForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" />
              </div>
            </div>
          </form>
        ) : (
          <form id="edit-period-form" onSubmit={handleSaveEdit}>
            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label">Start Date</label>
                <input type="date" className="form-control" value={editForm.start_date}
                  onChange={e => setEditForm(f => ({ ...f, start_date: e.target.value }))} required />
              </div>
              <div className="col-md-6">
                <label className="form-label">End Date</label>
                <input type="date" className="form-control" value={editForm.end_date}
                  onChange={e => setEditForm(f => ({ ...f, end_date: e.target.value }))} required />
              </div>
              <div className="col-md-6">
                <label className="form-label">Type</label>
                <select className="form-select" value={editForm.period_type}
                  onChange={e => setEditForm(f => ({ ...f, period_type: e.target.value }))}>
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Bi-weekly</option>
                </select>
              </div>
              <div className="col-md-6">
                <label className="form-label">Notes</label>
                <input type="text" className="form-control" value={editForm.notes}
                  onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" />
              </div>
            </div>
          </form>
        )}
      </EntityDrawer>
    </div>
  );
}
