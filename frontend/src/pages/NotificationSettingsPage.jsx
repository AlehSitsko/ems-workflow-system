import React, { useState, useEffect } from "react";
import { FaBell, FaSave } from "react-icons/fa";
import { usePushNotifications } from "../hooks/usePushNotifications";
import { getDispatchThresholds, saveDispatchThresholds } from "../api/dispatchApi";

import API_BASE from "../api/config.js";

const GROUPS = [
  {
    label: "Calls",
    types: ["call_new_today", "call_unassigned_soon", "call_als_on_bls"],
  },
  {
    label: "Units",
    types: ["unit_stuck_status", "unit_understaffed"],
  },
  {
    label: "HR & Employees",
    types: ["cert_expiring", "employee_added", "doc_expiring", "cert_no_scan"],
  },
];

function NotificationSettingsPage({ currentUser }) {
  const [prefs, setPrefs] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [thresholds, setThresholds] = useState({ pickup_late_after: 0, stuck_after: 30 });
  const { pushState, subscribe, dismiss: _dismiss } = usePushNotifications(currentUser);

  useEffect(() => {
    if (!currentUser?.id) return;
    fetch(`${API_BASE}/api/notifications/prefs?user_id=${currentUser.id}`)
      .then((r) => r.json())
      .then((data) => {
        setPrefs(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    getDispatchThresholds(currentUser.id).then(t => setThresholds(t)).catch(() => {});
  }, [currentUser?.id]);

  const toggle = (type) => {
    setPrefs((prev) => ({
      ...prev,
      [type]: { ...prev[type], enabled: !prev[type].enabled },
    }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    const flat = {};
    Object.entries(prefs).forEach(([k, v]) => { flat[k] = v.enabled; });
    try {
      await Promise.all([
        fetch(`${API_BASE}/api/notifications/prefs`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: currentUser.id, prefs: flat }),
        }),
        saveDispatchThresholds(currentUser.id, thresholds),
      ]);
      setSaved(true);
    } catch { /* noop */ }
    setSaving(false);
  };

  const setThreshold = (key, val) => {
    const n = Math.max(0, parseInt(val, 10) || 0);
    setThresholds(prev => ({ ...prev, [key]: n }));
    setSaved(false);
  };

  if (loading) {
    return <div className="page-stack"><p className="text-muted">Loading...</p></div>;
  }

  const availableTypes = Object.keys(prefs);

  return (
    <div className="page-stack">
      <section className="content-panel">
        <div className="content-panel-header">
          <div>
            <h4>Notification Settings</h4>
            <p>Choose which notifications you want to receive. Only event types available for your role are shown.</p>
          </div>
          <button
            type="button"
            className="btn btn-primary btn-sm d-inline-flex align-items-center gap-2"
            onClick={handleSave}
            disabled={saving}
          >
            <FaSave />
            {saving ? "Saving..." : saved ? "Saved ✓" : "Save"}
          </button>
        </div>

        {/* Browser Push section */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#6c757d", letterSpacing: 1, marginBottom: 10, textTransform: "uppercase" }}>
            Browser Notifications
          </div>
          <div className="d-flex align-items-center justify-content-between" style={{ padding: "10px 0", borderBottom: "1px solid #2a3347" }}>
            <div>
              <div style={{ fontSize: 14, color: pushState === "granted" ? "#fff" : "#6c757d" }}>
                Push notifications
              </div>
              <div style={{ fontSize: 12, color: "#6c757d", marginTop: 2 }}>
                {pushState === "unsupported" && "Not supported in this browser."}
                {pushState === "denied" && "Blocked by browser. Enable in browser settings."}
                {pushState === "granted" && "Active — alerts will appear even when the tab is in the background."}
                {(pushState === "default" || pushState === "unknown") && "Receive alerts even when the tab is in the background."}
              </div>
            </div>
            {pushState === "granted" ? (
              <span style={{ fontSize: 12, color: "#75b798", fontWeight: 600 }}>✓ Enabled</span>
            ) : pushState === "unsupported" || pushState === "denied" ? (
              <span style={{ fontSize: 12, color: "#6c757d" }}>Unavailable</span>
            ) : (
              <button className="btn btn-sm btn-outline-primary" style={{ fontSize: 12 }} onClick={subscribe}>
                Enable
              </button>
            )}
          </div>
        </div>

        {availableTypes.length === 0 && (
          <p className="text-muted">No notification types available for your role.</p>
        )}

        {GROUPS.map((group) => {
          const visible = group.types.filter((t) => prefs[t]);
          if (visible.length === 0) return null;
          return (
            <div key={group.label} style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#6c757d", letterSpacing: 1, marginBottom: 10, textTransform: "uppercase" }}>
                {group.label}
              </div>
              {visible.map((type) => (
                <div
                  key={type}
                  className="d-flex align-items-center justify-content-between"
                  style={{ padding: "10px 0", borderBottom: "1px solid #2a3347" }}
                >
                  <div className="d-flex align-items-center gap-3">
                    <FaBell style={{ color: prefs[type].enabled ? "#6ea8fe" : "#495057", fontSize: 14 }} />
                    <span style={{ fontSize: 14, color: prefs[type].enabled ? "#fff" : "#6c757d" }}>
                      {prefs[type].label}
                    </span>
                  </div>
                  <div className="form-check form-switch mb-0">
                    <input
                      type="checkbox"
                      className="form-check-input"
                      role="switch"
                      checked={prefs[type].enabled}
                      onChange={() => toggle(type)}
                      style={{ cursor: "pointer" }}
                    />
                  </div>
                </div>
              ))}
            </div>
          );
        })}

        {/* Dispatch Visual Alerts */}
        <div style={{ marginTop: 28 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#6c757d", letterSpacing: 1, marginBottom: 10, textTransform: "uppercase" }}>
            Dispatch Visual Alerts
          </div>
          <p style={{ fontSize: 12, color: "#6c757d", marginBottom: 14 }}>
            Controls when calls and units flash red on the Dispatch Board. Applies per user — each dispatcher can set their own thresholds.
          </p>

          <div className="d-flex align-items-center justify-content-between" style={{ padding: "12px 0", borderBottom: "1px solid #2a3347" }}>
            <div>
              <div style={{ fontSize: 14, color: "var(--ems-text-primary)" }}>Call overdue alert</div>
              <div style={{ fontSize: 12, color: "#6c757d", marginTop: 2 }}>
                Flash call red in queue when pickup time is exceeded by this many minutes. 0 = immediately when past pickup.
              </div>
            </div>
            <div className="d-flex align-items-center gap-2">
              <input
                type="number"
                min="0"
                max="120"
                value={thresholds.pickup_late_after}
                onChange={e => setThreshold("pickup_late_after", e.target.value)}
                style={{ width: 64, fontSize: 13, padding: "3px 8px", background: "var(--ems-bg-surface)", border: "1px solid var(--ems-border)", borderRadius: 6, color: "var(--ems-text-primary)", textAlign: "center" }}
              />
              <span style={{ fontSize: 12, color: "#6c757d" }}>min</span>
            </div>
          </div>

          <div className="d-flex align-items-center justify-content-between" style={{ padding: "12px 0", borderBottom: "1px solid #2a3347" }}>
            <div>
              <div style={{ fontSize: 14, color: "var(--ems-text-primary)" }}>Unit stuck alert</div>
              <div style={{ fontSize: 12, color: "#6c757d", marginTop: 2 }}>
                Flash unit status red when the unit has been in the same status for this many minutes without advancing.
              </div>
            </div>
            <div className="d-flex align-items-center gap-2">
              <input
                type="number"
                min="5"
                max="240"
                value={thresholds.stuck_after}
                onChange={e => setThreshold("stuck_after", e.target.value)}
                style={{ width: 64, fontSize: 13, padding: "3px 8px", background: "var(--ems-bg-surface)", border: "1px solid var(--ems-border)", borderRadius: 6, color: "var(--ems-text-primary)", textAlign: "center" }}
              />
              <span style={{ fontSize: 12, color: "#6c757d" }}>min</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default NotificationSettingsPage;
