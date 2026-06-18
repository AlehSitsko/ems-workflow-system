import React, { useState, useEffect, useCallback } from "react";
import { FaMoneyBillWave, FaDownload, FaPlus, FaCheck, FaSearch, FaEdit, FaSave, FaTimes, FaTrash } from "react-icons/fa";
import { getPeriods, createPeriod, updatePeriod, updatePeriodStatus, deletePeriod, getPeriodSummary, exportPayroll } from "../api/payrollApi";
import { getCurrentUser } from "../api/authApi";

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
  const currentUser = getCurrentUser();
  const canManage = ["admin", "supervisor", "hr"].includes(currentUser?.role);

  const [periods, setPeriods] = useState([]);
  const [selected, setSelected] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");

  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);

  const [newPeriod, setNewPeriod] = useState({
    start_date: weekAgoStr(),
    end_date: todayStr(),
    period_type: "weekly",
    notes: "",
  });

  const load = useCallback(async () => {
    try { setPeriods(await getPeriods()); } catch { /* noop */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSelect = async (period) => {
    setSelected(period);
    setEditMode(false);
    setSummary(null);
    setLoadingSummary(true);
    try {
      const s = await getPeriodSummary(period.id);
      setSummary(s);
    } catch { /* noop */ }
    setLoadingSummary(false);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      const p = await createPeriod({ ...newPeriod, created_by: currentUser?.id });
      await load();
      setShowCreate(false);
      handleSelect(p);
    } catch (err) { alert(err.message); }
    setCreating(false);
  };

  const startEdit = () => {
    setEditForm({
      start_date: selected.start_date,
      end_date: selected.end_date,
      period_type: selected.period_type,
      notes: selected.notes || "",
    });
    setEditMode(true);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await updatePeriod(selected.id, editForm);
      setSelected(updated);
      setEditMode(false);
      await load();
      // reload summary with new dates
      setLoadingSummary(true);
      try { setSummary(await getPeriodSummary(updated.id)); } catch { /* noop */ }
      finally { setLoadingSummary(false); }
    } catch (err) { alert(err.message); }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!selected) return;
    if (!window.confirm(`Delete period ${selected.start_date} → ${selected.end_date}? This cannot be undone.`)) return;
    try {
      await deletePeriod(selected.id);
      setSelected(null);
      setSummary(null);
      await load();
    } catch (err) { alert(err.message); }
  };

  const handleAdvanceStatus = async () => {
    if (!selected) return;
    const next = STATUS_FLOW[selected.status];
    if (!next) return;
    try {
      const updated = await updatePeriodStatus(selected.id, next, next === "exported" ? "csv" : undefined);
      setSelected(updated);
      await load();
    } catch (err) { alert(err.message); }
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

  return (
    <div className="page-stack">
      <div className="content-panel-header" style={{ marginBottom: 0 }}>
        <div>
          <h4 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <FaMoneyBillWave style={{ color: "#75b798" }} /> Payroll Periods
          </h4>
          <p style={{ margin: 0, color: "#6c757d", fontSize: 13 }}>Pay period management, approval, and CSV export</p>
        </div>
        {canManage && (
          <button className="btn btn-sm btn-primary d-flex align-items-center gap-1" onClick={() => setShowCreate(!showCreate)}>
            <FaPlus /> New Period
          </button>
        )}
      </div>

      {showCreate && canManage && (
        <div className="content-panel" style={{ background: "#1a2236", border: "1px solid #2a3347" }}>
          <form onSubmit={handleCreate}>
            <div style={{ fontSize: 12, color: "#6c757d", marginBottom: 12, fontWeight: 700, textTransform: "uppercase" }}>Create Pay Period</div>
            <div className="row g-2">
              <div className="col-md-3">
                <label className="form-label" style={{ fontSize: 12, color: "#adb5bd" }}>Start Date</label>
                <input type="date" className="form-control form-control-sm" value={newPeriod.start_date}
                  onChange={e => setNewPeriod(p => ({ ...p, start_date: e.target.value }))} required />
              </div>
              <div className="col-md-3">
                <label className="form-label" style={{ fontSize: 12, color: "#adb5bd" }}>End Date</label>
                <input type="date" className="form-control form-control-sm" value={newPeriod.end_date}
                  onChange={e => setNewPeriod(p => ({ ...p, end_date: e.target.value }))} required />
              </div>
              <div className="col-md-2">
                <label className="form-label" style={{ fontSize: 12, color: "#adb5bd" }}>Type</label>
                <select className="form-select form-select-sm" value={newPeriod.period_type}
                  onChange={e => setNewPeriod(p => ({ ...p, period_type: e.target.value }))}>
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Bi-weekly</option>
                </select>
              </div>
              <div className="col-md-4">
                <label className="form-label" style={{ fontSize: 12, color: "#adb5bd" }}>Notes</label>
                <input type="text" className="form-control form-control-sm" value={newPeriod.notes}
                  onChange={e => setNewPeriod(p => ({ ...p, notes: e.target.value }))} placeholder="Optional" />
              </div>
            </div>
            <div className="d-flex gap-2 mt-3">
              <button type="submit" className="btn btn-sm btn-primary" disabled={creating}>
                {creating ? "Creating…" : "Create"}
              </button>
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="row g-3" style={{ flex: 1 }}>
        {/* Period list */}
        <div className="col-md-4">
          <div className="content-panel" style={{ height: "100%", minHeight: 300 }}>
            <div className="d-flex align-items-center gap-2 mb-3">
              <FaSearch style={{ color: "#6c757d", fontSize: 12 }} />
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
                      background: selected?.id === p.id ? "#1a2236" : "transparent",
                      border: `1px solid ${selected?.id === p.id ? "#6ea8fe" : "#e4e8f0"}`,
                      borderRadius: 8,
                      padding: "10px 14px",
                      textAlign: "left",
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    <div className="d-flex align-items-center justify-content-between mb-1">
                      <span style={{ fontSize: 13, fontWeight: 700, color: selected?.id === p.id ? "#e9ecef" : "#101828" }}>
                        {p.start_date} → {p.end_date}
                      </span>
                      <StatusBadge status={p.status} />
                    </div>
                    <div style={{ fontSize: 11, color: "#6c757d" }}>{p.period_type} · #{p.id}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Period detail */}
        <div className="col-md-8">
          {!selected ? (
            <div className="content-panel d-flex align-items-center justify-content-center" style={{ minHeight: 300, color: "#6c757d" }}>
              <p>Select a pay period to view details</p>
            </div>
          ) : (
            <div className="content-panel">
              {/* Edit form */}
              {editMode && canManage ? (
                <form onSubmit={handleSaveEdit} className="mb-3">
                  <div style={{ fontSize: 12, color: "#6c757d", marginBottom: 10, fontWeight: 700, textTransform: "uppercase" }}>Edit Period</div>
                  <div className="row g-2">
                    <div className="col-md-3">
                      <label className="form-label" style={{ fontSize: 12 }}>Start Date</label>
                      <input type="date" className="form-control form-control-sm" value={editForm.start_date}
                        onChange={e => setEditForm(f => ({ ...f, start_date: e.target.value }))} required />
                    </div>
                    <div className="col-md-3">
                      <label className="form-label" style={{ fontSize: 12 }}>End Date</label>
                      <input type="date" className="form-control form-control-sm" value={editForm.end_date}
                        onChange={e => setEditForm(f => ({ ...f, end_date: e.target.value }))} required />
                    </div>
                    <div className="col-md-2">
                      <label className="form-label" style={{ fontSize: 12 }}>Type</label>
                      <select className="form-select form-select-sm" value={editForm.period_type}
                        onChange={e => setEditForm(f => ({ ...f, period_type: e.target.value }))}>
                        <option value="weekly">Weekly</option>
                        <option value="biweekly">Bi-weekly</option>
                      </select>
                    </div>
                    <div className="col-md-4">
                      <label className="form-label" style={{ fontSize: 12 }}>Notes</label>
                      <input type="text" className="form-control form-control-sm" value={editForm.notes}
                        onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" />
                    </div>
                  </div>
                  <div className="d-flex gap-2 mt-2">
                    <button type="submit" className="btn btn-sm btn-primary d-flex align-items-center gap-1" disabled={saving}>
                      <FaSave /> {saving ? "Saving…" : "Save"}
                    </button>
                    <button type="button" className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1" onClick={() => setEditMode(false)}>
                      <FaTimes /> Cancel
                    </button>
                  </div>
                </form>
              ) : (
              /* Header */
              <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>{selected.start_date} — {selected.end_date}</div>
                  <div className="d-flex align-items-center gap-2 mt-1">
                    <StatusBadge status={selected.status} />
                    <span style={{ fontSize: 12, color: "#6c757d" }}>{selected.period_type}</span>
                    {selected.notes && <span style={{ fontSize: 12, color: "#6c757d" }}>· {selected.notes}</span>}
                  </div>
                </div>
                {canManage && (
                  <div className="d-flex gap-2 flex-wrap">
                    <button className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1" onClick={startEdit}>
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
              )}

              {/* Totals */}
              {totals && (
                <div className="d-flex gap-3 flex-wrap mb-3">
                  {[
                    { label: "Total Hours", value: totals.total_hours.toFixed(1) + "h" },
                    { label: "Regular", value: totals.regular_hours.toFixed(1) + "h" },
                    { label: "Overtime", value: totals.ot_hours.toFixed(1) + "h", color: totals.ot_hours > 0 ? "#ffc107" : undefined },
                    { label: "Est. Total Pay", value: "$" + totals.total_pay.toFixed(2), color: "#75b798" },
                  ].map(s => (
                    <div key={s.label} style={{ background: "#f5f7fb", borderRadius: 8, padding: "8px 16px", minWidth: 100 }}>
                      <div style={{ fontSize: 10, color: "#6c757d", textTransform: "uppercase", marginBottom: 2 }}>{s.label}</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: s.color || "#101828" }}>{s.value}</div>
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
                      <tr style={{ color: "#6c757d" }}>
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
                            {r.employee_number && <div style={{ fontSize: 11, color: "#6c757d" }}>#{r.employee_number}</div>}
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
                          <td className="text-end" style={{ color: "#6c757d" }}>{r.entry_count}</td>
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
    </div>
  );
}
