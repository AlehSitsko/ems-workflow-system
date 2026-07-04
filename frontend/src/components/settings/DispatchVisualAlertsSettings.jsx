// Dispatch Visual Alerts control the red flashing/highlighting on the
// Dispatch Board (overdue calls, stuck units) — this is NOT a browser/push
// notification, it's a purely visual, in-app cue. Kept as its own section
// so the two concepts are never conflated in the UI.
function DispatchVisualAlertsSettings({ pickupLateAfter, stuckAfter, onChange }) {
  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#6c757d", letterSpacing: 1, marginBottom: 10, textTransform: "uppercase" }}>
        Dispatch Visual Alerts
      </div>
      <p style={{ fontSize: 12, color: "#6c757d", marginBottom: 14 }}>
        Controls when calls and units flash red on the Dispatch Board. Saved per user.
      </p>

      <div className="d-flex align-items-center justify-content-between" style={{ padding: "12px 0", borderBottom: "1px solid #2a3347" }}>
        <div>
          <div style={{ fontSize: 14, color: "var(--ems-text-primary)" }}>Call overdue alert</div>
          <div style={{ fontSize: 12, color: "#6c757d", marginTop: 2 }}>
            Flash call red when pickup time is exceeded by this many minutes. 0 = immediately.
          </div>
        </div>
        <div className="d-flex align-items-center gap-2">
          <input
            type="number"
            min="0"
            max="120"
            value={pickupLateAfter}
            onChange={(e) => onChange("pickup_late_after", e.target.value)}
            style={{ width: 64, fontSize: 13, padding: "3px 8px", background: "var(--ems-bg-surface)", border: "1px solid var(--ems-border)", borderRadius: 6, color: "var(--ems-text-primary)", textAlign: "center" }}
          />
          <span style={{ fontSize: 12, color: "#6c757d" }}>min</span>
        </div>
      </div>

      <div className="d-flex align-items-center justify-content-between" style={{ padding: "12px 0", borderBottom: "1px solid #2a3347" }}>
        <div>
          <div style={{ fontSize: 14, color: "var(--ems-text-primary)" }}>Unit stuck alert</div>
          <div style={{ fontSize: 12, color: "#6c757d", marginTop: 2 }}>
            Flash unit status red when no status change for this many minutes.
          </div>
        </div>
        <div className="d-flex align-items-center gap-2">
          <input
            type="number"
            min="5"
            max="240"
            value={stuckAfter}
            onChange={(e) => onChange("stuck_after", e.target.value)}
            style={{ width: 64, fontSize: 13, padding: "3px 8px", background: "var(--ems-bg-surface)", border: "1px solid var(--ems-border)", borderRadius: 6, color: "var(--ems-text-primary)", textAlign: "center" }}
          />
          <span style={{ fontSize: 12, color: "#6c757d" }}>min</span>
        </div>
      </div>
    </div>
  );
}

export default DispatchVisualAlertsSettings;
