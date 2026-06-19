import { useState, useEffect, useCallback } from "react";
import { FaSync, FaFilter, FaPhoneAlt, FaUserInjured, FaAmbulance, FaClock } from "react-icons/fa";
import { getAuditLog } from "../api/auditApi";

const ACTION_CONFIG = {
  "call.created":        { label: "Call Created",        color: "#60a5fa", bg: "rgba(96,165,250,0.12)" },
  "call.assigned":       { label: "Call Assigned",       color: "#34d399", bg: "rgba(52,211,153,0.12)" },
  "call.unassigned":     { label: "Call Unassigned",     color: "#fb923c", bg: "rgba(251,146,60,0.12)" },
  "call.completed":      { label: "Call Completed",      color: "#22c55e", bg: "rgba(34,197,94,0.12)" },
  "call.reopened":       { label: "Call Reopened",       color: "#a78bfa", bg: "rgba(167,139,250,0.12)" },
  "call.cancelled":      { label: "Call Cancelled",      color: "#f87171", bg: "rgba(248,113,113,0.12)" },
  "call.uncancelled":    { label: "Call Uncancelled",    color: "#fbbf24", bg: "rgba(251,191,36,0.12)" },
  "unit.status_changed": { label: "Unit Status Changed", color: "#94a3b8", bg: "rgba(148,163,184,0.10)" },
  "patient.created":     { label: "Patient Created",     color: "#60a5fa", bg: "rgba(96,165,250,0.12)" },
  "patient.updated":     { label: "Patient Updated",     color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
  "patient.deleted":     { label: "Patient Deleted",     color: "#f87171", bg: "rgba(248,113,113,0.12)" },
  "time_entry.created":  { label: "Time Entry Added",    color: "#60a5fa", bg: "rgba(96,165,250,0.12)" },
  "time_entry.updated":  { label: "Time Entry Updated",  color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
  "time_entry.deleted":  { label: "Time Entry Deleted",  color: "#f87171", bg: "rgba(248,113,113,0.12)" },
};

const ENTITY_ICON = {
  call:        FaPhoneAlt,
  patient:     FaUserInjured,
  unit:        FaAmbulance,
  time_entry:  FaClock,
};

const ENTITY_TYPES = ["", "call", "patient", "unit", "time_entry"];

const DETAIL_LABELS = {
  service_level:    "Service",
  trip_date:        "Date",
  pickup_time:      "Time",
  pickup:           "From",
  dropoff:          "To",
  dispatcher:       "Dispatcher",
  reason:           "Reason",
  previous_reason:  "Prev. reason",
  truck:            "Unit",
  unit_id:          "Unit ID",
  from:             "From",
  to:               "To",
  clock_in:         "Clock in",
  clock_out:        "Clock out",
  type:             "Type",
  changed_fields:   "Changed",
  assignment_id:    "Assignment",
};

function formatTs(ts) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return ts; }
}

function parseDetails(raw) {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function DetailPills({ details }) {
  if (!details) return null;
  const entries = Object.entries(details).filter(([, v]) => v !== null && v !== undefined && v !== "");
  if (entries.length === 0) return null;
  return (
    <div className="d-flex flex-wrap gap-2 mt-2">
      {entries.map(([k, v]) => (
        <span key={k} style={{ fontSize: 11, color: "#94a3b8", background: "rgba(148,163,184,0.08)", border: "1px solid rgba(148,163,184,0.15)", borderRadius: 6, padding: "2px 8px" }}>
          <span style={{ color: "#64748b" }}>{DETAIL_LABELS[k] || k}:</span>{" "}
          <span style={{ color: "#cbd5e1" }}>{Array.isArray(v) ? v.join(", ") : String(v)}</span>
        </span>
      ))}
    </div>
  );
}

function AuditCard({ entry }) {
  const cfg = ACTION_CONFIG[entry.action] || { label: entry.action, color: "#94a3b8", bg: "rgba(148,163,184,0.08)" };
  const EntityIcon = ENTITY_ICON[entry.entity_type] || FaPhoneAlt;
  const details = parseDetails(entry.details);

  return (
    <div style={{
      background: "#1a2235",
      border: "1px solid #1e2a3a",
      borderLeft: `3px solid ${cfg.color}`,
      borderRadius: 8,
      padding: "12px 16px",
      display: "flex",
      gap: 14,
    }}>
      {/* Icon */}
      <div style={{
        width: 36, height: 36, borderRadius: 8,
        background: cfg.bg,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        <EntityIcon style={{ color: cfg.color, fontSize: 15 }} />
      </div>

      {/* Body */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <span style={{
            fontSize: 11, fontWeight: 700,
            color: cfg.color,
            background: cfg.bg,
            border: `1px solid ${cfg.color}44`,
            borderRadius: 10, padding: "1px 10px",
            whiteSpace: "nowrap",
          }}>
            {cfg.label}
          </span>
          {entry.entity_label && (
            <span style={{ fontSize: 13, color: "#e2e8f0", fontWeight: 600 }}>
              {entry.entity_label}
            </span>
          )}
          <span style={{ fontSize: 11, color: "#475569", marginLeft: "auto", whiteSpace: "nowrap" }}>
            {formatTs(entry.timestamp)}
          </span>
        </div>

        {/* User */}
        <div style={{ fontSize: 12, color: "#64748b", marginTop: 3 }}>
          by <span style={{ color: "#94a3b8" }}>{entry.user_name}</span>
        </div>

        {/* Detail pills */}
        <DetailPills details={details} />
      </div>
    </div>
  );
}

export default function AuditLogPage({ currentUser }) {
  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 50;

  const [filterEntityType, setFilterEntityType] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  const headers = {
    "X-User-Role": currentUser?.role || "",
    "X-User-Id":   String(currentUser?.id || ""),
  };

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    setError("");
    try {
      const data = await getAuditLog({
        entity_type: filterEntityType || undefined,
        date_from:   filterDateFrom || undefined,
        date_to:     filterDateTo || undefined,
        page: p,
        per_page: perPage,
      }, headers);
      setEntries(data.entries);
      setTotal(data.total);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterEntityType, filterDateFrom, filterDateTo, currentUser]);

  useEffect(() => { load(page); }, [load, page]);

  const pages = Math.max(1, Math.ceil(total / perPage));

  function applyFilters() {
    setPage(1);
    load(1);
  }

  return (
    <div className="page-stack">
      <section className="content-panel">
        <div className="content-panel-header">
          <div>
            <h4>Audit Log</h4>
            <p className="text-muted mb-0" style={{ fontSize: 13 }}>
              All tracked actions · {total.toLocaleString()} entries
            </p>
          </div>
          <button className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-2" onClick={() => load(page)}>
            <FaSync style={{ fontSize: 11 }} /> Refresh
          </button>
        </div>

        {/* Filters */}
        <div className="d-flex gap-2 flex-wrap mb-4 align-items-end">
          <div>
            <label style={{ fontSize: 11, color: "#64748b", display: "block", marginBottom: 4 }}>Entity type</label>
            <select
              className="form-select form-select-sm"
              style={{ minWidth: 130 }}
              value={filterEntityType}
              onChange={(e) => setFilterEntityType(e.target.value)}
            >
              {ENTITY_TYPES.map((t) => (
                <option key={t} value={t}>{t || "All types"}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, color: "#64748b", display: "block", marginBottom: 4 }}>From</label>
            <input type="date" className="form-control form-control-sm" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "#64748b", display: "block", marginBottom: 4 }}>To</label>
            <input type="date" className="form-control form-control-sm" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} />
          </div>
          <button className="btn btn-sm btn-primary d-flex align-items-center gap-2" onClick={applyFilters} style={{ marginBottom: 1 }}>
            <FaFilter style={{ fontSize: 11 }} /> Apply
          </button>
          {(filterEntityType || filterDateFrom || filterDateTo) && (
            <button className="btn btn-sm btn-outline-secondary" style={{ marginBottom: 1 }}
              onClick={() => { setFilterEntityType(""); setFilterDateFrom(""); setFilterDateTo(""); setPage(1); }}>
              Clear
            </button>
          )}
        </div>

        {error && <p className="text-danger">{error}</p>}

        {loading ? (
          <p className="text-muted">Loading...</p>
        ) : entries.length === 0 ? (
          <p className="text-muted">No audit entries found.</p>
        ) : (
          <div className="d-flex flex-column gap-2">
            {entries.map((e) => <AuditCard key={e.id} entry={e} />)}
          </div>
        )}

        {/* Pagination */}
        {pages > 1 && (
          <div className="d-flex align-items-center gap-2 mt-4" style={{ fontSize: 13 }}>
            <button className="btn btn-sm btn-outline-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              ← Prev
            </button>
            <span style={{ color: "#64748b" }}>Page {page} of {pages}</span>
            <button className="btn btn-sm btn-outline-secondary" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
              Next →
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
