import React, { useState, useEffect } from "react";
import { FaBell, FaSave } from "react-icons/fa";
import { usePushNotifications } from "../hooks/usePushNotifications";
import { useUserSettings } from "../context/UserSettingsContext";
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
  // Available types + labels for this user's role (from backend, role-filtered)
  const [availableTypes, setAvailableTypes] = useState({});
  const [loadingTypes, setLoadingTypes] = useState(true);

  // Local edits before saving
  const [localNotifs, setLocalNotifs] = useState({});
  const [localDispatch, setLocalDispatch] = useState({ pickup_late_after: 0, stuck_after: 30 });
  const [hydrated, setHydrated] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const { settings, updateSettings, settingsLoaded } = useUserSettings();
  const { pushState, subscribe } = usePushNotifications(currentUser);

  // Load available types + labels from backend (role-specific metadata)
  useEffect(() => {
    if (!currentUser?.id) return;
    fetch(`${API_BASE}/api/notifications/prefs?user_id=${currentUser.id}`)
      .then((r) => r.json())
      .then((data) => { setAvailableTypes(data); setLoadingTypes(false); })
      .catch(() => setLoadingTypes(false));
  }, [currentUser?.id]);

  // Hydrate local state from context once both are ready
  useEffect(() => {
    if (!settingsLoaded || loadingTypes) return;
    const notifValues = {};
    Object.keys(availableTypes).forEach((type) => {
      notifValues[type] = settings.notifications[type] ?? availableTypes[type]?.enabled ?? true;
    });
    setLocalNotifs(notifValues);
    setLocalDispatch({ ...settings.dispatch });
    setHydrated(true);
  }, [settingsLoaded, loadingTypes, settings]);

  const toggle = (type) => {
    setLocalNotifs((prev) => ({ ...prev, [type]: !prev[type] }));
    setSaved(false);
  };

  const setThreshold = (key, val) => {
    const n = Math.max(0, parseInt(val, 10) || 0);
    setLocalDispatch((prev) => ({ ...prev, [key]: n }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSettings({
        notifications: localNotifs,
        dispatch: localDispatch,
      });
      setSaved(true);
    } catch { /* noop */ }
    setSaving(false);
  };

  if (loadingTypes || !hydrated) {
    return <div className="page-stack"><p className="text-muted">Loading...</p></div>;
  }

  return (
    <div className="page-stack">
      <section className="content-panel">
        <div className="content-panel-header">
          <div>
            <h4>Notification Settings</h4>
            <p>Your personal notification preferences — saved to your account across all sessions.</p>
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

        {/* Browser Push */}
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

        {/* Notification type toggles */}
        {Object.keys(availableTypes).length === 0 && (
          <p className="text-muted">No notification types available for your role.</p>
        )}

        {GROUPS.map((group) => {
          const visible = group.types.filter((t) => availableTypes[t]);
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
                    <FaBell style={{ color: localNotifs[type] ? "#6ea8fe" : "#495057", fontSize: 14 }} />
                    <span style={{ fontSize: 14, color: localNotifs[type] ? "#fff" : "#6c757d" }}>
                      {availableTypes[type]?.label || type}
                    </span>
                  </div>
                  <div className="form-check form-switch mb-0">
                    <input
                      type="checkbox"
                      className="form-check-input"
                      role="switch"
                      checked={!!localNotifs[type]}
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
                value={localDispatch.pickup_late_after}
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
                Flash unit status red when no status change for this many minutes.
              </div>
            </div>
            <div className="d-flex align-items-center gap-2">
              <input
                type="number"
                min="5"
                max="240"
                value={localDispatch.stuck_after}
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
