import { FaSun, FaMoon, FaPlus, FaChevronLeft, FaChevronRight } from "react-icons/fa";

import { BOARD_MODE_META } from "../../utils/dispatchBoardUtils";

// Dispatch Board header — extracted from DispatchBoardPage.jsx (Phase 2c
// of its hook/component split, see docs/ROADMAP.md Priority 1). Purely
// presentational; all state/handlers live in the page.

// Visible mode badge colors (Planning / Live / History).
const MODE_STYLE = {
  planning: { bg: "rgba(110,168,254,0.18)", color: "#6ea8fe", border: "#6ea8fe66" },
  live: { bg: "rgba(117,183,152,0.20)", color: "#75b798", border: "#75b79866" },
  history: { bg: "rgba(148,163,184,0.18)", color: "#94a3b8", border: "#94a3b866" },
};

export default function BoardToolbar({
  date, onDateChange, mode = "live", onPrevDay, onToday, onNextDay,
  loading, onRefresh,
  onCreateDayUnit, onCreateNightUnit, creatingDisabled,
  error, openCallsCount, unitsCount,
  showResetLayout, onResetLayout,
}) {
  const modeStyle = MODE_STYLE[mode] || MODE_STYLE.live;
  const modeMeta = BOARD_MODE_META[mode] || BOARD_MODE_META.live;

  return (
    <div className="d-flex align-items-center gap-2 px-3 py-2 flex-wrap" style={{ background: "var(--ems-board-bg-header)", borderBottom: "1px solid #2a3347", flexShrink: 0 }}>
      <h5 className="mb-0 fw-bold" style={{ color: "var(--ems-board-text)", fontSize: 16 }}>Dispatch Board</h5>

      {/* Mode badge — Planning / Live / History */}
      <span
        title={modeMeta.hint}
        style={{
          fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4,
          padding: "3px 9px", borderRadius: 6,
          background: modeStyle.bg, color: modeStyle.color, border: `1px solid ${modeStyle.border}`,
        }}
      >
        {modeMeta.label}
      </span>

      {/* Day navigation */}
      <button className="btn btn-sm btn-outline-secondary" onClick={onPrevDay} disabled={loading} title="Previous day" aria-label="Previous day" style={{ fontSize: 12 }}>
        <FaChevronLeft />
      </button>
      <input
        type="date"
        className="form-control form-control-sm"
        style={{ width: 150, background: "var(--ems-board-bg-input)", color: "var(--ems-board-text)", border: "1px solid var(--ems-board-border)" }}
        value={date}
        onChange={(e) => onDateChange(e.target.value)}
      />
      <button className="btn btn-sm btn-outline-secondary" onClick={onNextDay} disabled={loading} title="Next day" aria-label="Next day" style={{ fontSize: 12 }}>
        <FaChevronRight />
      </button>
      {mode !== "live" && (
        <button className="btn btn-sm btn-outline-primary" onClick={onToday} disabled={loading} style={{ fontSize: 12 }}>
          Today
        </button>
      )}
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
