import { useState, useEffect, useCallback } from "react";
import { FaSync, FaFilter } from "react-icons/fa";
import { getAuditLog } from "../api/auditApi";

const ACTION_LABELS = {
  "call.created":        "Call Created",
  "call.assigned":       "Call Assigned",
  "call.unassigned":     "Call Unassigned",
  "call.completed":      "Call Completed",
  "call.reopened":       "Call Reopened",
  "call.cancelled":      "Call Cancelled",
  "unit.status_changed": "Unit Status Changed",
  "patient.created":     "Patient Created",
  "patient.updated":     "Patient Updated",
  "patient.deleted":     "Patient Deleted",
  "time_entry.created":  "Time Entry Added",
  "time_entry.updated":  "Time Entry Updated",
  "time_entry.deleted":  "Time Entry Deleted",
};

const ACTION_COLORS = {
  "call.created":        "#60a5fa",
  "call.assigned":       "#34d399",
  "call.unassigned":     "#fb923c",
  "call.completed":      "#22c55e",
  "call.reopened":       "#a78bfa",
  "call.cancelled":      "#f87171",
  "unit.status_changed": "#94a3b8",
  "patient.created":     "#60a5fa",
  "patient.updated":     "#f59e0b",
  "patient.deleted":     "#f87171",
  "time_entry.created":  "#60a5fa",
  "time_entry.updated":  "#f59e0b",
  "time_entry.deleted":  "#f87171",
};

const ENTITY_TYPES = ["", "call", "patient", "unit", "time_entry"];

function formatTs(ts) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

function DetailsCell({ raw }) {
  if (!raw) return <span style={{ color: "#475569" }}>—</span>;
  try {
    const obj = JSON.parse(raw);
    return (
      <span style={{ fontSize: 11, color: "#94a3b8", fontFamily: "monospace" }}>
        {Object.entries(obj)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
          .join(" · ")}
      </span>
    );
  } catch {
    return <span style={{ fontSize: 11, color: "#94a3b8" }}>{raw}</span>;
  }
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

  const load = useCallback(async (p = page) => {
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
  }, [filterEntityType, filterDateFrom, filterDateTo, page, currentUser]);

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
        <div className="d-flex gap-2 flex-wrap mb-3 align-items-end">
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
            <input
              type="date"
              className="form-control form-control-sm"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "#64748b", display: "block", marginBottom: 4 }}>To</label>
            <input
              type="date"
              className="form-control form-control-sm"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
            />
          </div>
          <button
            className="btn btn-sm btn-primary d-flex align-items-center gap-2"
            onClick={applyFilters}
            style={{ marginBottom: 1 }}
          >
            <FaFilter style={{ fontSize: 11 }} /> Apply
          </button>
          {(filterEntityType || filterDateFrom || filterDateTo) && (
            <button
              className="btn btn-sm btn-outline-secondary"
              style={{ marginBottom: 1 }}
              onClick={() => {
                setFilterEntityType("");
                setFilterDateFrom("");
                setFilterDateTo("");
                setPage(1);
              }}
            >
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
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #1e2a3a" }}>
                  <th style={{ padding: "6px 10px", color: "#64748b", fontSize: 11, fontWeight: 700, letterSpacing: 1, whiteSpace: "nowrap" }}>TIMESTAMP</th>
                  <th style={{ padding: "6px 10px", color: "#64748b", fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>USER</th>
                  <th style={{ padding: "6px 10px", color: "#64748b", fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>ACTION</th>
                  <th style={{ padding: "6px 10px", color: "#64748b", fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>ENTITY</th>
                  <th style={{ padding: "6px 10px", color: "#64748b", fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>DETAILS</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr
                    key={e.id}
                    style={{ borderBottom: "1px solid #1a2030" }}
                  >
                    <td style={{ padding: "8px 10px", color: "#64748b", whiteSpace: "nowrap", fontSize: 12 }}>
                      {formatTs(e.timestamp)}
                    </td>
                    <td style={{ padding: "8px 10px", color: "#e2e8f0", whiteSpace: "nowrap" }}>
                      {e.user_name}
                    </td>
                    <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                      <span style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: ACTION_COLORS[e.action] || "#94a3b8",
                        background: `${ACTION_COLORS[e.action] || "#94a3b8"}22`,
                        border: `1px solid ${ACTION_COLORS[e.action] || "#94a3b8"}44`,
                        borderRadius: 10,
                        padding: "2px 10px",
                      }}>
                        {ACTION_LABELS[e.action] || e.action}
                      </span>
                    </td>
                    <td style={{ padding: "8px 10px", color: "#94a3b8", whiteSpace: "nowrap" }}>
                      {e.entity_label || (e.entity_type ? `${e.entity_type} #${e.entity_id}` : "—")}
                    </td>
                    <td style={{ padding: "8px 10px", maxWidth: 320 }}>
                      <DetailsCell raw={e.details} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pages > 1 && (
          <div className="d-flex align-items-center gap-2 mt-3" style={{ fontSize: 13 }}>
            <button
              className="btn btn-sm btn-outline-secondary"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              ← Prev
            </button>
            <span style={{ color: "#64748b" }}>Page {page} of {pages}</span>
            <button
              className="btn btn-sm btn-outline-secondary"
              disabled={page >= pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next →
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
