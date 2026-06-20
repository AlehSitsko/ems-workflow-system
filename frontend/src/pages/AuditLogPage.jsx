import { useState, useEffect, useCallback } from "react";
import { FaSync, FaFilter, FaPhoneAlt, FaUserInjured, FaAmbulance, FaClock, FaChevronDown, FaChevronUp } from "react-icons/fa";
import { getAuditLog } from "../api/auditApi";

const ACTION_CONFIG = {
  "call.created":        { label: "Created",         color: "#3b82f6" },
  "call.assigned":       { label: "Assigned",        color: "#22c55e" },
  "call.unassigned":     { label: "Unassigned",      color: "#f97316" },
  "call.completed":      { label: "Completed",       color: "#16a34a" },
  "call.reopened":       { label: "Reopened",        color: "#a855f7" },
  "call.cancelled":      { label: "Cancelled",       color: "#ef4444" },
  "call.uncancelled":    { label: "Uncancelled",     color: "#eab308" },
  "unit.status_changed": { label: "Status Changed",  color: "#64748b" },
  "patient.created":     { label: "Created",         color: "#3b82f6" },
  "patient.updated":     { label: "Updated",         color: "#f59e0b" },
  "patient.deleted":     { label: "Deleted",         color: "#ef4444" },
  "time_entry.created":  { label: "Added",           color: "#3b82f6" },
  "time_entry.updated":  { label: "Updated",         color: "#f59e0b" },
  "time_entry.deleted":  { label: "Deleted",         color: "#ef4444" },
};

const ENTITY_CONFIG = {
  call:        { label: "Call",       icon: FaPhoneAlt,    color: "#3b82f6", bg: "rgba(59,130,246,0.1)" },
  patient:     { label: "Patient",    icon: FaUserInjured, color: "#22c55e", bg: "rgba(34,197,94,0.1)" },
  unit:        { label: "Unit",       icon: FaAmbulance,   color: "#a855f7", bg: "rgba(168,85,247,0.1)" },
  time_entry:  { label: "Time Entry", icon: FaClock,       color: "#f59e0b", bg: "rgba(245,158,11,0.1)"  },
};

const ENTITY_TYPES = ["", "call", "patient", "unit", "time_entry"];

const DETAIL_LABELS = {
  service_level: "Service", trip_date: "Date", pickup_time: "Time",
  pickup: "From", dropoff: "To", dispatcher: "Dispatcher",
  reason: "Reason", previous_reason: "Prev. reason",
  truck: "Unit", unit_id: "Unit ID", from: "Status from", to: "Status to",
  clock_in: "Clock in", clock_out: "Clock out", type: "Type",
  changed_fields: "Changed", assignment_id: "Assignment",
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

function EventRow({ entry, isFirst }) {
  const cfg = ACTION_CONFIG[entry.action] || { label: entry.action, color: "#64748b" };
  const details = parseDetails(entry.details);

  return (
    <div style={{ display: "flex", gap: 12, position: "relative" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, width: 16 }}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: cfg.color, flexShrink: 0, marginTop: 4, border: `2px solid ${cfg.color}66` }} />
        {!isFirst && <div style={{ width: 1, flex: 1, background: "var(--ems-border)", marginTop: 3 }} />}
      </div>
      <div style={{ flex: 1, paddingBottom: 14 }}>
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <span style={{ fontSize: 12, fontWeight: 700, color: cfg.color }}>{cfg.label}</span>
          <span style={{ fontSize: 11, color: "var(--ems-text-muted)" }}>
            by <span style={{ color: "var(--ems-text-secondary)" }}>{entry.user_name}</span>
          </span>
          <span style={{ fontSize: 11, color: "var(--ems-text-subtle)", marginLeft: "auto" }}>{formatTs(entry.timestamp)}</span>
        </div>
        {details && (
          <div className="d-flex flex-wrap gap-1 mt-1">
            {Object.entries(details)
              .filter(([, v]) => v !== null && v !== undefined && v !== "")
              .map(([k, v]) => (
                <span key={k} style={{
                  fontSize: 10,
                  color: "var(--ems-text-muted)",
                  background: "var(--ems-bg-surface-2)",
                  border: "1px solid var(--ems-border)",
                  borderRadius: 4,
                  padding: "1px 6px",
                }}>
                  <span style={{ color: "var(--ems-text-subtle)" }}>{DETAIL_LABELS[k] || k}:</span>{" "}
                  <span style={{ color: "var(--ems-text-secondary)" }}>{Array.isArray(v) ? v.join(", ") : String(v)}</span>
                </span>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EntityCard({ entityKey, entries }) {
  const [open, setOpen] = useState(false);
  const first = entries[0];
  const entCfg = ENTITY_CONFIG[first.entity_type] || ENTITY_CONFIG.call;
  const Icon = entCfg.icon;

  const lastEntry = entries[0];
  const lastCfg = ACTION_CONFIG[lastEntry.action] || { label: lastEntry.action, color: "#64748b" };

  const isCancelled = entries.some((e) => e.action === "call.cancelled") &&
    !entries.some((e) => e.action === "call.uncancelled" &&
      new Date(e.timestamp) > new Date(entries.find((x) => x.action === "call.cancelled")?.timestamp || 0));

  return (
    <div style={{
      background: "var(--ems-bg-surface)",
      border: `1px solid ${open ? entCfg.color + "55" : "var(--ems-border)"}`,
      borderRadius: 10,
      overflow: "hidden",
      transition: "border-color 0.15s",
      boxShadow: "0 1px 3px var(--ems-shadow-subtle)",
    }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", background: "transparent", border: "none", cursor: "pointer",
          padding: "12px 16px", display: "flex", alignItems: "center", gap: 12,
          textAlign: "left",
        }}
      >
        <div style={{
          width: 38, height: 38, borderRadius: 9, background: entCfg.bg,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <Icon style={{ color: entCfg.color, fontSize: 15 }} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--ems-text-primary)" }}>
              {first.entity_label || `${first.entity_type} #${first.entity_id}`}
            </span>
            <span style={{
              fontSize: 10, fontWeight: 700,
              color: lastCfg.color,
              background: `${lastCfg.color}18`,
              border: `1px solid ${lastCfg.color}33`,
              borderRadius: 8, padding: "1px 8px",
            }}>
              {lastCfg.label}
            </span>
            {isCancelled && (
              <span style={{
                fontSize: 10, color: "#ef4444",
                background: "rgba(239,68,68,0.1)",
                border: "1px solid rgba(239,68,68,0.25)",
                borderRadius: 8, padding: "1px 8px", fontWeight: 700,
              }}>
                Cancelled
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: "var(--ems-text-muted)", marginTop: 2 }}>
            {entries.length} event{entries.length !== 1 ? "s" : ""} · last: {formatTs(lastEntry.timestamp)}
          </div>
        </div>

        <div style={{ color: "var(--ems-text-subtle)", fontSize: 12, flexShrink: 0 }}>
          {open ? <FaChevronUp /> : <FaChevronDown />}
        </div>
      </button>

      {open && (
        <div style={{ padding: "4px 16px 0 16px", borderTop: "1px solid var(--ems-border)" }}>
          <div style={{ paddingTop: 14 }}>
            {[...entries].reverse().map((e, i) => (
              <EventRow key={e.id} entry={e} isFirst={i === [...entries].length - 1} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AuditLogPage({ currentUser }) {
  const [allEntries, setAllEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [filterEntityType, setFilterEntityType] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  const headers = {
    "X-User-Role": currentUser?.role || "",
    "X-User-Id":   String(currentUser?.id || ""),
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getAuditLog({
        entity_type: filterEntityType || undefined,
        date_from:   filterDateFrom || undefined,
        date_to:     filterDateTo || undefined,
        per_page: 500,
      }, headers);
      setAllEntries(data.entries);
      setTotal(data.total);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterEntityType, filterDateFrom, filterDateTo, currentUser]);

  useEffect(() => { load(); }, [load]);

  const grouped = (() => {
    const map = new Map();
    allEntries.forEach((e) => {
      const key = `${e.entity_type}::${e.entity_id}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(e);
    });
    return Array.from(map.entries()).sort(([, a], [, b]) =>
      new Date(b[0].timestamp) - new Date(a[0].timestamp)
    );
  })();

  return (
    <div className="page-stack">
      <section className="content-panel">
        <div className="content-panel-header">
          <div>
            <h4>Audit Log</h4>
            <p className="text-muted mb-0" style={{ fontSize: 13 }}>
              {grouped.length} entities · {total} events total
            </p>
          </div>
          <button className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-2" onClick={load}>
            <FaSync style={{ fontSize: 11 }} /> Refresh
          </button>
        </div>

        {/* Filters */}
        <div className="d-flex gap-2 flex-wrap mb-4 align-items-end">
          <div>
            <label style={{ fontSize: 11, color: "var(--ems-text-muted)", display: "block", marginBottom: 4 }}>Entity type</label>
            <select
              className="form-select form-select-sm"
              style={{ minWidth: 130 }}
              value={filterEntityType}
              onChange={(e) => setFilterEntityType(e.target.value)}
            >
              {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t || "All types"}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, color: "var(--ems-text-muted)", display: "block", marginBottom: 4 }}>From</label>
            <input type="date" className="form-control form-control-sm" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "var(--ems-text-muted)", display: "block", marginBottom: 4 }}>To</label>
            <input type="date" className="form-control form-control-sm" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} />
          </div>
          <button className="btn btn-sm btn-primary d-flex align-items-center gap-2" onClick={load} style={{ marginBottom: 1 }}>
            <FaFilter style={{ fontSize: 11 }} /> Apply
          </button>
          {(filterEntityType || filterDateFrom || filterDateTo) && (
            <button
              className="btn btn-sm btn-outline-secondary"
              style={{ marginBottom: 1 }}
              onClick={() => { setFilterEntityType(""); setFilterDateFrom(""); setFilterDateTo(""); }}
            >
              Clear
            </button>
          )}
        </div>

        {error && <p className="text-danger">{error}</p>}

        {loading ? (
          <p className="text-muted">Loading...</p>
        ) : grouped.length === 0 ? (
          <p className="text-muted">No audit entries found.</p>
        ) : (
          <div className="d-flex flex-column gap-2">
            {grouped.map(([key, entries]) => (
              <EntityCard key={key} entityKey={key} entries={entries} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
