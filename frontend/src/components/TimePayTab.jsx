import React, { useState, useEffect, useCallback } from "react";
import {
  getTimeEntries, createTimeEntry, updateTimeEntry, deleteTimeEntry,
  getPayConfig, savePayConfig,
} from "../api/timeApi";

const STATUS_COLOR = {
  approved: { bg: "rgba(25,135,84,0.12)",  color: "#75b798",  label: "Approved" },
  disputed: { bg: "rgba(220,53,69,0.12)",  color: "#ea868f",  label: "Disputed" },
};

function formatDuration(minutes) {
  if (minutes === null || minutes === undefined) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

function formatDateTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}

// Default to current pay period: Mon–Sun of last 2 weeks
function defaultDateRange() {
  const now = new Date();
  const to = new Date(now);
  to.setDate(to.getDate() + 1);
  const from = new Date(now);
  from.setDate(from.getDate() - 13);
  return {
    dateFrom: from.toISOString().slice(0, 10),
    dateTo: to.toISOString().slice(0, 10),
  };
}

const canManage = (role) => ["admin", "supervisor", "hr"].includes(role);

export default function TimePayTab({ employeeId, currentUser }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState(defaultDateRange());
  const [payConfig, setPayConfig] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showPayConfig, setShowPayConfig] = useState(false);
  const [saving, setSaving] = useState(false);

  const [addForm, setAddForm] = useState({
    clock_in: "", clock_out: "", break_minutes: 0, notes: "", entry_type: "manual",
  });
  const [payForm, setPayForm] = useState({
    pay_type: "hourly", hourly_rate: 0, overtime_rate: 1.5, overtime_after: 40, effective_from: "",
  });

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getTimeEntries(employeeId, filter);
      setEntries(data);
    } catch { /* noop */ } finally { setLoading(false); }
  }, [employeeId, filter]);

  const loadPayConfig = useCallback(async () => {
    try {
      const cfg = await getPayConfig(employeeId);
      if (cfg) {
        setPayConfig(cfg);
        setPayForm({
          pay_type: cfg.pay_type || "hourly",
          hourly_rate: cfg.hourly_rate || 0,
          overtime_rate: cfg.overtime_rate || 1.5,
          overtime_after: cfg.overtime_after || 40,
          effective_from: cfg.effective_from || "",
        });
      }
    } catch { /* noop */ }
  }, [employeeId]);

  useEffect(() => { loadEntries(); }, [loadEntries]);
  useEffect(() => { loadPayConfig(); }, [loadPayConfig]);

  const totalMinutes = entries.reduce((s, e) => s + (e.duration_minutes || 0), 0);
  const rate = payConfig?.hourly_rate || 0;
  const totalHours = totalMinutes / 60;
  const otThreshold = (payConfig?.overtime_after || 40) * 60;
  const regularMin = Math.min(totalMinutes, otThreshold);
  const otMin = Math.max(0, totalMinutes - otThreshold);
  const regularPay = (regularMin / 60) * rate;
  const otPay = (otMin / 60) * rate * (payConfig?.overtime_rate || 1.5);
  const totalPay = regularPay + otPay;

  const handleAddEntry = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await createTimeEntry(employeeId, {
        ...addForm,
        break_minutes: parseInt(addForm.break_minutes) || 0,
        created_by: currentUser?.id,
      });
      setAddForm({ clock_in: "", clock_out: "", break_minutes: 0, notes: "", entry_type: "manual" });
      setShowAddForm(false);
      await loadEntries();
    } catch (err) { alert(err.message); }
    setSaving(false);
  };

  const handleApprove = async (entry) => {
    try {
      await updateTimeEntry(entry.id, { status: "approved", approved_by: currentUser?.id });
      await loadEntries();
    } catch { /* noop */ }
  };

  const handleDispute = async (entry) => {
    try {
      await updateTimeEntry(entry.id, { status: "disputed" });
      await loadEntries();
    } catch { /* noop */ }
  };

  const handleDelete = async (entryId) => {
    if (!window.confirm("Delete this time entry?")) return;
    try {
      await deleteTimeEntry(entryId);
      await loadEntries();
    } catch { /* noop */ }
  };

  const handleSavePayConfig = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const cfg = await savePayConfig(employeeId, {
        ...payForm,
        hourly_rate: parseFloat(payForm.hourly_rate) || 0,
        overtime_rate: parseFloat(payForm.overtime_rate) || 1.5,
        overtime_after: parseInt(payForm.overtime_after) || 40,
      });
      setPayConfig(cfg);
      setShowPayConfig(false);
    } catch (err) { alert(err.message); }
    setSaving(false);
  };

  const manage = canManage(currentUser?.role);

  return (
    <div data-bs-theme="dark" style={{ overflowY: "auto", flex: 1, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16, background: "#0d1117", color: "#e9ecef" }}>

      {/* Pay Summary */}
      <div style={{ background: "#1a2236", borderRadius: 10, padding: "14px 16px" }}>
        <div className="d-flex align-items-center justify-content-between mb-2">
          <div style={{ fontSize: 12, color: "#6c757d", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>
            Pay Period Summary
          </div>
          {manage && (
            <button
              className="btn btn-sm btn-outline-secondary"
              style={{ fontSize: 11 }}
              onClick={() => setShowPayConfig(!showPayConfig)}
            >
              ⚙ Pay Config
            </button>
          )}
        </div>
        <div className="d-flex gap-3 flex-wrap">
          <Stat label="Total Hours" value={`${totalHours.toFixed(1)}h`} />
          <Stat label="Regular" value={`${(regularMin/60).toFixed(1)}h`} />
          <Stat label="Overtime" value={`${(otMin/60).toFixed(1)}h`} color={otMin > 0 ? "#ffc107" : undefined} />
          {rate > 0 && <Stat label="Est. Pay" value={`$${totalPay.toFixed(2)}`} color="#75b798" />}
        </div>
      </div>

      {/* Pay Config Form */}
      {showPayConfig && manage && (
        <form onSubmit={handleSavePayConfig} style={{ background: "#151b27", borderRadius: 8, padding: "14px 16px", border: "1px solid #2a3347" }}>
          <div style={{ fontSize: 12, color: "#6c757d", marginBottom: 10, fontWeight: 700, textTransform: "uppercase" }}>Pay Configuration</div>
          <div className="row g-2">
            <div className="col-6">
              <label className="form-label" style={{ fontSize: 12 }}>Pay Type</label>
              <select className="form-select form-select-sm" value={payForm.pay_type} onChange={e => setPayForm(p => ({...p, pay_type: e.target.value}))}>
                <option value="hourly">Hourly</option>
                <option value="salary">Salary</option>
              </select>
            </div>
            <div className="col-6">
              <label className="form-label" style={{ fontSize: 12 }}>Hourly Rate ($)</label>
              <input className="form-control form-control-sm" type="number" step="0.01" value={payForm.hourly_rate} onChange={e => setPayForm(p => ({...p, hourly_rate: e.target.value}))} />
            </div>
            <div className="col-6">
              <label className="form-label" style={{ fontSize: 12 }}>OT Multiplier</label>
              <input className="form-control form-control-sm" type="number" step="0.01" value={payForm.overtime_rate} onChange={e => setPayForm(p => ({...p, overtime_rate: e.target.value}))} />
            </div>
            <div className="col-6">
              <label className="form-label" style={{ fontSize: 12 }}>OT After (hrs/wk)</label>
              <input className="form-control form-control-sm" type="number" value={payForm.overtime_after} onChange={e => setPayForm(p => ({...p, overtime_after: e.target.value}))} />
            </div>
            <div className="col-12">
              <label className="form-label" style={{ fontSize: 12 }}>Effective From</label>
              <input className="form-control form-control-sm" type="date" value={payForm.effective_from} onChange={e => setPayForm(p => ({...p, effective_from: e.target.value}))} />
            </div>
          </div>
          <div className="d-flex gap-2 mt-2">
            <button className="btn btn-sm btn-primary" type="submit" disabled={saving}>Save</button>
            <button className="btn btn-sm btn-outline-secondary" type="button" onClick={() => setShowPayConfig(false)}>Cancel</button>
          </div>
        </form>
      )}

      {/* Date filter + Add button */}
      <div className="d-flex gap-2 align-items-center flex-wrap">
        <input type="date" className="form-control form-control-sm" style={{ width: 140 }} value={filter.dateFrom} onChange={e => setFilter(f => ({...f, dateFrom: e.target.value}))} />
        <span style={{ color: "#6c757d", fontSize: 13 }}>—</span>
        <input type="date" className="form-control form-control-sm" style={{ width: 140 }} value={filter.dateTo} onChange={e => setFilter(f => ({...f, dateTo: e.target.value}))} />
        {manage && (
          <button className="btn btn-sm btn-outline-primary ms-auto" onClick={() => setShowAddForm(!showAddForm)}>
            + Add Entry
          </button>
        )}
      </div>

      {/* Add Entry Form */}
      {showAddForm && manage && (
        <form onSubmit={handleAddEntry} style={{ background: "#151b27", borderRadius: 8, padding: "14px 16px", border: "1px solid #2a3347" }}>
          <div style={{ fontSize: 12, color: "#6c757d", marginBottom: 10, fontWeight: 700, textTransform: "uppercase" }}>Add Manual Entry</div>
          <div className="row g-2">
            <div className="col-6">
              <label className="form-label" style={{ fontSize: 12 }}>Clock In</label>
              <input required className="form-control form-control-sm" type="datetime-local" value={addForm.clock_in} onChange={e => setAddForm(f => ({...f, clock_in: e.target.value}))} />
            </div>
            <div className="col-6">
              <label className="form-label" style={{ fontSize: 12 }}>Clock Out</label>
              <input className="form-control form-control-sm" type="datetime-local" value={addForm.clock_out} onChange={e => setAddForm(f => ({...f, clock_out: e.target.value}))} />
            </div>
            <div className="col-6">
              <label className="form-label" style={{ fontSize: 12 }}>Break (min)</label>
              <input className="form-control form-control-sm" type="number" min="0" value={addForm.break_minutes} onChange={e => setAddForm(f => ({...f, break_minutes: e.target.value}))} />
            </div>
            <div className="col-12">
              <label className="form-label" style={{ fontSize: 12 }}>Notes</label>
              <input className="form-control form-control-sm" type="text" value={addForm.notes} onChange={e => setAddForm(f => ({...f, notes: e.target.value}))} placeholder="Optional" />
            </div>
          </div>
          <div className="d-flex gap-2 mt-2">
            <button className="btn btn-sm btn-primary" type="submit" disabled={saving}>Add</button>
            <button className="btn btn-sm btn-outline-secondary" type="button" onClick={() => setShowAddForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      {/* Entries List */}
      {loading ? (
        <p className="text-muted small">Loading...</p>
      ) : entries.length === 0 ? (
        <p className="text-muted small">No time entries for this period.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {entries.map((entry) => {
            const st = STATUS_COLOR[entry.status] || STATUS_COLOR.pending;
            return (
              <div key={entry.id} style={{ background: "#151b27", borderRadius: 8, padding: "10px 14px", border: "1px solid #2a3347" }}>
                <div className="d-flex align-items-start justify-content-between gap-2">
                  <div style={{ flex: 1 }}>
                    <div className="d-flex align-items-center gap-2 mb-1 flex-wrap">
                      <span style={{ fontSize: 13, color: "#e9ecef", fontWeight: 600 }}>
                        {formatDateTime(entry.clock_in)}
                      </span>
                      <span style={{ fontSize: 12, color: "#6c757d" }}>→ {formatDateTime(entry.clock_out)}</span>
                      <span style={{ fontSize: 11, padding: "1px 8px", borderRadius: 20, background: st.bg, color: st.color, fontWeight: 600 }}>
                        {st.label}
                      </span>
                      <span style={{ fontSize: 11, color: "#6c757d", background: "#1a2236", padding: "1px 8px", borderRadius: 20 }}>
                        {entry.entry_type}
                      </span>
                    </div>
                    <div className="d-flex gap-3" style={{ fontSize: 12, color: "#adb5bd" }}>
                      <span>⏱ {formatDuration(entry.duration_minutes)}</span>
                      {entry.break_minutes > 0 && <span>☕ {entry.break_minutes}m break</span>}
                      {entry.notes && <span style={{ color: "#6c757d" }}>{entry.notes}</span>}
                    </div>
                  </div>
                  {manage && (
                    <div className="d-flex gap-1 flex-shrink-0">
                      {entry.status !== "disputed" && (
                        <button className="btn btn-sm" style={{ fontSize: 10, padding: "2px 8px", background: "rgba(220,53,69,0.1)", color: "#ea868f", border: "1px solid #ea868f44" }} onClick={() => handleDispute(entry)} title="Mark disputed">!</button>
                      )}
                      {entry.status === "disputed" && (
                        <button className="btn btn-sm" style={{ fontSize: 10, padding: "2px 8px", background: "rgba(25,135,84,0.12)", color: "#75b798", border: "1px solid #75b79844" }} onClick={() => handleApprove(entry)} title="Clear dispute">✓</button>
                      )}
                      <button className="btn btn-sm" style={{ fontSize: 10, padding: "2px 8px", color: "#6c757d", border: "1px solid #2a3347" }} onClick={() => handleDelete(entry.id)}>✕</button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ background: "#151b27", borderRadius: 8, padding: "8px 14px", minWidth: 90 }}>
      <div style={{ fontSize: 10, color: "#6c757d", marginBottom: 2, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: color || "#e9ecef" }}>{value}</div>
    </div>
  );
}
