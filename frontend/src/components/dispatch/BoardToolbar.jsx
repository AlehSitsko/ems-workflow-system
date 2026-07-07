import { FaSun, FaMoon, FaPlus } from "react-icons/fa";

// Dispatch Board header — extracted from DispatchBoardPage.jsx (Phase 2c
// of its hook/component split, see docs/ROADMAP.md Priority 1). Purely
// presentational; all state/handlers live in the page.

export default function BoardToolbar({
  date, onDateChange, loading, onRefresh,
  onCreateDayUnit, onCreateNightUnit, creatingDisabled,
  error, openCallsCount, unitsCount,
  showResetLayout, onResetLayout,
}) {
  return (
    <div className="d-flex align-items-center gap-2 px-3 py-2 flex-wrap" style={{ background: "var(--ems-board-bg-header)", borderBottom: "1px solid #2a3347", flexShrink: 0 }}>
      <h5 className="mb-0 fw-bold" style={{ color: "var(--ems-board-text)", fontSize: 16 }}>Dispatch Board</h5>
      <input
        type="date"
        className="form-control form-control-sm"
        style={{ width: 150, background: "var(--ems-board-bg-input)", color: "var(--ems-board-text)", border: "1px solid var(--ems-board-border)" }}
        value={date}
        onChange={(e) => onDateChange(e.target.value)}
      />
      <button className="btn btn-sm btn-outline-secondary" onClick={onRefresh} disabled={loading} style={{ fontSize: 12 }}>
        {loading ? "Loading…" : "Refresh"}
      </button>
      <div style={{ width: 1, height: 20, background: "#2a3347", margin: "0 4px" }} />
      <button
        className="btn btn-sm btn-primary d-inline-flex align-items-center gap-1"
        style={{ fontSize: 12 }}
        onClick={onCreateDayUnit}
        disabled={creatingDisabled}
      >
        <FaSun style={{ fontSize: 10 }} /><FaPlus style={{ fontSize: 9 }} /> Day Unit
      </button>
      <button
        className="btn btn-sm d-inline-flex align-items-center gap-1"
        style={{ fontSize: 12, color: "#6ea8fe", border: "1px solid #6ea8fe44", background: "transparent" }}
        onClick={onCreateNightUnit}
        disabled={creatingDisabled}
      >
        <FaMoon style={{ fontSize: 10 }} /><FaPlus style={{ fontSize: 9 }} /> Night Unit
      </button>
      {error && <span className="text-danger small">{error}</span>}
      <span className="ms-auto text-muted small d-none d-lg-inline d-flex align-items-center gap-2">
        {openCallsCount} open · {unitsCount} units ·{" "}
        <span style={{ color: "#6ea8fe" }}>click → inspect · dbl-click → status</span>
        {showResetLayout && (
          <button
            type="button"
            onClick={onResetLayout}
            style={{ fontSize: 10, padding: "1px 7px", background: "transparent", border: "1px solid #475569", borderRadius: 5, color: "#94a3b8", cursor: "pointer", lineHeight: 1.6 }}
            title="Reset panel sizes to default"
          >
            ⊞ Reset layout
          </button>
        )}
      </span>
    </div>
  );
}
