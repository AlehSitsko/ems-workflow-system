import { useState, useEffect, useCallback } from "react";
import {
  FaDownload, FaSync, FaCheckCircle, FaExclamationTriangle,
  FaTimesCircle, FaMinusCircle, FaExclamationCircle,
} from "react-icons/fa";
import { getComplianceSummary } from "../api/documentsApi";

// ── Role → required doc types ────────────────────────────────────────────────
// A "required" doc that is missing or expired/critical is flagged as a role gap.
const ROLE_REQUIRED_DOCS = {
  Driver:    ["drivers_license", "evoc_cert"],
  EMT:       ["cpr_cert", "emt_cert", "physical_exam"],
  Paramedic: ["cpr_cert", "emt_cert", "als_cert", "physical_exam"],
  Assist:    ["cpr_cert"],
};

// ── Status display config ────────────────────────────────────────────────────
const STATUS_CONFIG = {
  ok:       { color: "#22c55e", bg: "rgba(34,197,94,0.15)",   border: "rgba(34,197,94,0.3)",   label: "OK",       icon: FaCheckCircle },
  warning:  { color: "#f59e0b", bg: "rgba(245,158,11,0.15)",  border: "rgba(245,158,11,0.3)",  label: "Warning",  icon: FaExclamationTriangle },
  critical: { color: "#ef4444", bg: "rgba(239,68,68,0.15)",   border: "rgba(239,68,68,0.3)",   label: "Critical", icon: FaTimesCircle },
  expired:  { color: "#6b7280", bg: "rgba(107,114,128,0.15)", border: "rgba(107,114,128,0.3)", label: "Expired",  icon: FaTimesCircle },
  none:     { color: "#334155", bg: "rgba(51,65,85,0.2)",     border: "rgba(51,65,85,0.4)",    label: "Missing",  icon: FaMinusCircle },
  // synthetic: required doc is missing/critical/expired
  gap:      { color: "#ef4444", bg: "rgba(239,68,68,0.22)",   border: "rgba(239,68,68,0.55)",  label: "Required — Missing", icon: FaExclamationCircle },
};

const DOC_LABELS = {
  drivers_license:     "Driver's Lic.",
  cdl:                 "CDL",
  cpr_cert:            "CPR",
  evoc_cert:           "EVOC",
  emt_cert:            "EMT Lic.",
  als_cert:            "ALS",
  physical_exam:       "Physical",
  employment_contract: "Contract",
  offer_letter:        "Offer",
  background_check:    "Background",
  insurance_card:      "Insurance",
  other:               "Other",
};

// Columns to hide from the compliance grid (not relevant for this org)
const HIDDEN_COLUMNS = new Set(["cdl"]);

// Compute the effective display status for a cell, considering role requirements.
function effectiveStatus(docType, rawStatus, empRole) {
  const required = ROLE_REQUIRED_DOCS[empRole] || [];
  const isRequired = required.includes(docType);
  if (isRequired && (rawStatus === "none" || rawStatus === "expired" || rawStatus === "critical")) {
    return "gap";
  }
  return rawStatus;
}

function StatusCell({ docType, rawStatus, empRole }) {
  const status = effectiveStatus(docType, rawStatus, empRole);
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.none;
  const Icon = cfg.icon;

  const required = (ROLE_REQUIRED_DOCS[empRole] || []).includes(docType);

  return (
    <div
      title={`${cfg.label}${required ? " (required for " + empRole + ")" : ""}`}
      style={{
        width: "100%",
        height: 32,
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        borderRadius: 4,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
      }}
    >
      <Icon style={{ color: cfg.color, fontSize: 13 }} />
      {/* Small dot indicator for required docs */}
      {required && (
        <span style={{
          position: "absolute",
          top: 2,
          right: 3,
          width: 4,
          height: 4,
          borderRadius: "50%",
          background: status === "ok" || status === "warning" ? "#64748b" : cfg.color,
          opacity: 0.7,
        }} />
      )}
    </div>
  );
}

function exportCSV(employees, docTypes) {
  const header = ["Employee", "Role", ...docTypes.map((t) => DOC_LABELS[t] || t)];
  const rows = employees.map((emp) => {
    const name = `${emp.last_name}, ${emp.first_name}`;
    const cols = docTypes.map((t) => {
      const raw = emp.docs[t] || "none";
      const eff = effectiveStatus(t, raw, emp.role);
      return STATUS_CONFIG[eff]?.label || eff;
    });
    return [name, emp.role || "", ...cols];
  });

  const csv = [header, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `compliance_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ComplianceDashboardPage({ currentUser }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const d = await getComplianceSummary(currentUser);
      setData(d);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="page-stack"><p className="text-muted">Loading compliance data...</p></div>;
  if (error)   return <div className="page-stack"><p className="text-danger">{error}</p></div>;
  if (!data)   return null;

  const { employees, doc_types: rawDocTypes } = data;
  const docTypes = rawDocTypes.filter((t) => !HIDDEN_COLUMNS.has(t));

  // Count by effective status (including gap)
  const counts = {};
  employees.forEach((emp) => {
    docTypes.forEach((t) => {
      const raw = emp.docs[t] || "none";
      const eff = effectiveStatus(t, raw, emp.role);
      counts[eff] = (counts[eff] || 0) + 1;
    });
  });
  const total = employees.length * docTypes.length;

  // Filter order for pills
  const FILTER_ORDER = ["gap", "critical", "expired", "warning", "none", "ok"];

  // Filter rows
  const filtered = filter === "all"
    ? employees
    : employees.filter((emp) =>
        docTypes.some((t) => {
          const raw = emp.docs[t] || "none";
          return effectiveStatus(t, raw, emp.role) === filter;
        })
      );

  // Role color badges
  const ROLE_COLORS = {
    Driver:    { color: "#a78bfa", bg: "rgba(167,139,250,0.15)" },
    EMT:       { color: "#34d399", bg: "rgba(52,211,153,0.15)" },
    Paramedic: { color: "#60a5fa", bg: "rgba(96,165,250,0.15)" },
    Assist:    { color: "#fb923c", bg: "rgba(251,146,60,0.15)" },
  };

  return (
    <div className="page-stack">
      <section className="content-panel">
        <div className="content-panel-header">
          <div>
            <h4>Compliance Dashboard</h4>
            <p className="text-muted mb-0" style={{ fontSize: 13 }}>
              Document status across all active employees · role-based requirements enforced
            </p>
          </div>
          <div className="d-flex gap-2">
            <button className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-2" onClick={load}>
              <FaSync style={{ fontSize: 11 }} /> Refresh
            </button>
            <button
              className="btn btn-sm btn-outline-primary d-flex align-items-center gap-2"
              onClick={() => exportCSV(employees, docTypes)}
            >
              <FaDownload style={{ fontSize: 11 }} /> Export CSV
            </button>
          </div>
        </div>

        {/* Summary pills */}
        <div className="d-flex gap-2 flex-wrap mb-3">
          {FILTER_ORDER.map((key) => {
            const cfg = STATUS_CONFIG[key];
            const count = counts[key] || 0;
            if (count === 0) return null;
            const Icon = cfg.icon;
            return (
              <button
                key={key}
                onClick={() => setFilter(filter === key ? "all" : key)}
                style={{
                  background: filter === key ? cfg.bg : "transparent",
                  border: `1px solid ${cfg.border}`,
                  borderRadius: 20,
                  padding: "4px 14px",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  cursor: "pointer",
                  color: cfg.color,
                  fontSize: 12,
                  fontWeight: 600,
                  transition: "background 0.15s",
                }}
              >
                <Icon style={{ fontSize: 11 }} />
                {cfg.label}: {count}
              </button>
            );
          })}
          <span style={{ fontSize: 11, color: "#475569", alignSelf: "center", marginLeft: 4 }}>
            {employees.length} employees · {docTypes.length} types · {total} cells
          </span>
        </div>

        {/* Active filter banner */}
        {filter !== "all" && (
          <div className="d-flex align-items-center gap-2 mb-3">
            <span style={{ fontSize: 12, color: "#94a3b8" }}>
              Showing employees with at least one{" "}
              <strong style={{ color: STATUS_CONFIG[filter]?.color }}>
                {STATUS_CONFIG[filter]?.label}
              </strong>{" "}
              cell
            </span>
            <button
              className="btn btn-sm"
              style={{ fontSize: 11, padding: "2px 10px", color: "#6c757d", border: "1px solid #334155", background: "transparent" }}
              onClick={() => setFilter("all")}
            >
              Clear
            </button>
          </div>
        )}

        {/* Grid */}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "3px 3px", minWidth: 640 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "6px 10px", color: "#64748b", fontSize: 11, fontWeight: 700, letterSpacing: 1, width: 160, whiteSpace: "nowrap" }}>
                  EMPLOYEE
                </th>
                <th style={{ textAlign: "center", padding: "4px 6px", color: "#64748b", fontSize: 11, fontWeight: 700, letterSpacing: 1, width: 80, whiteSpace: "nowrap" }}>
                  ROLE
                </th>
                {docTypes.map((t) => (
                  <th
                    key={t}
                    style={{
                      color: "#64748b",
                      fontSize: 10,
                      fontWeight: 700,
                      textAlign: "center",
                      padding: "4px 2px",
                      whiteSpace: "nowrap",
                      letterSpacing: 0.5,
                      minWidth: 54,
                    }}
                  >
                    {DOC_LABELS[t] || t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={docTypes.length + 2} style={{ color: "#475569", textAlign: "center", padding: 24, fontSize: 13 }}>
                    No employees match the current filter.
                  </td>
                </tr>
              )}
              {filtered.map((emp) => {
                const hasGap = docTypes.some((t) => {
                  const raw = emp.docs[t] || "none";
                  return effectiveStatus(t, raw, emp.role) === "gap";
                });
                const hasCritical = !hasGap && docTypes.some((t) => {
                  const raw = emp.docs[t] || "none";
                  return effectiveStatus(t, raw, emp.role) === "critical" || (emp.docs[t] || "none") === "expired";
                });
                const roleStyle = ROLE_COLORS[emp.role] || { color: "#94a3b8", bg: "rgba(148,163,184,0.1)" };

                return (
                  <tr key={emp.employee_id}>
                    <td style={{ padding: "2px 10px", whiteSpace: "nowrap" }}>
                      <span style={{
                        fontSize: 13,
                        color: hasGap ? "#f87171" : hasCritical ? "#fca5a5" : "#e2e8f0",
                        fontWeight: hasGap || hasCritical ? 600 : 400,
                      }}>
                        {hasGap && <span style={{ marginRight: 5, fontSize: 11 }}>⚠</span>}
                        {emp.last_name}, {emp.first_name}
                      </span>
                    </td>
                    <td style={{ padding: "2px 4px", textAlign: "center" }}>
                      <span style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: roleStyle.color,
                        background: roleStyle.bg,
                        border: `1px solid ${roleStyle.color}44`,
                        borderRadius: 10,
                        padding: "2px 8px",
                        whiteSpace: "nowrap",
                      }}>
                        {emp.role || "—"}
                      </span>
                    </td>
                    {docTypes.map((t) => (
                      <td key={t} style={{ padding: "2px" }}>
                        <StatusCell
                          docType={t}
                          rawStatus={emp.docs[t] || "none"}
                          empRole={emp.role}
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Legend + role requirements */}
        <div style={{ borderTop: "1px solid #1e2a3a", marginTop: 16, paddingTop: 14, display: "flex", gap: 32, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", letterSpacing: 1, marginBottom: 8, textTransform: "uppercase" }}>Status</div>
            <div className="d-flex gap-3 flex-wrap">
              {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
                const Icon = cfg.icon;
                return (
                  <div key={key} className="d-flex align-items-center gap-1">
                    <Icon style={{ color: cfg.color, fontSize: 12 }} />
                    <span style={{ fontSize: 11, color: "#64748b" }}>{cfg.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", letterSpacing: 1, marginBottom: 8, textTransform: "uppercase" }}>Required by role</div>
            <div className="d-flex gap-4 flex-wrap">
              {Object.entries(ROLE_REQUIRED_DOCS).map(([role, docs]) => {
                const roleStyle = ROLE_COLORS[role] || { color: "#94a3b8" };
                return (
                  <div key={role} className="d-flex align-items-start gap-2">
                    <span style={{ fontSize: 10, fontWeight: 700, color: roleStyle.color, minWidth: 60 }}>{role}</span>
                    <span style={{ fontSize: 10, color: "#475569" }}>
                      {docs.map((d) => DOC_LABELS[d] || d).join(", ")}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
