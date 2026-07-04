import { FaClock } from "react-icons/fa";

// Time Format is a per-user preference — see frontend/src/utils/timeUtils.js
// and TimeInput.jsx, which read this value from useUserSettings() app-wide.
function TimeFormatSettings({ value, onChange }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#6c757d", letterSpacing: 1, marginBottom: 10, textTransform: "uppercase" }}>
        Preferences
      </div>
      <div style={{ padding: "10px 0", borderBottom: "1px solid #2a3347" }}>
        <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
          <div>
            <div className="d-flex align-items-center gap-2">
              <FaClock style={{ color: "var(--ems-text-secondary)", fontSize: 13 }} />
              <span style={{ fontSize: 14, color: "var(--ems-text-primary)" }}>Time Format</span>
            </div>
            <div style={{ fontSize: 12, color: "#6c757d", marginTop: 2 }}>
              Controls time inputs and time display across all modules — Call Form, Dispatch Board, Crew Planner, Calls, Payroll.
            </div>
          </div>
          <div className="d-flex gap-2">
            <button
              type="button"
              className={`btn btn-sm ${value === "12h" ? "btn-primary" : "btn-outline-secondary"}`}
              onClick={() => onChange("12h")}
            >
              12-hour — 2:30 PM
            </button>
            <button
              type="button"
              className={`btn btn-sm ${value === "24h" ? "btn-primary" : "btn-outline-secondary"}`}
              onClick={() => onChange("24h")}
            >
              24-hour — 14:30
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TimeFormatSettings;
