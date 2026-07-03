import React, { useState, useEffect } from "react";
import { FaBell, FaSave, FaClock } from "react-icons/fa";
import { usePushNotifications } from "../hooks/usePushNotifications";
import { useUserSettings } from "../context/useUserSettings";
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

const STATUS_COPY = {
  unsupported: {
    badge: "Unsupported",
    badgeColor: "#6c757d",
    message: "Browser notifications are not supported by this browser.",
  },
  insecure: {
    badge: "Requires HTTPS",
    badgeColor: "#6c757d",
    message: "Browser notifications require HTTPS or localhost.",
  },
  not_enabled: {
    badge: null,
    badgeColor: null,
    message: "Browser notifications are not enabled yet.",
  },
  blocked: {
    badge: "Blocked",
    badgeColor: "#dc3545",
    message: "Notifications are blocked by your browser.",
  },
  enabled: {
    badge: "Enabled",
    badgeColor: "#75b798",
    message: "Browser notifications are enabled.",
  },
};

function NotificationSettingsPage({ currentUser }) {
  // Available types + labels for this user's role (from backend, role-filtered)
  const [availableTypes, setAvailableTypes] = useState({});
  const [loadingTypes, setLoadingTypes] = useState(true);

  // Local edits before saving
  const [localNotifs, setLocalNotifs] = useState({});
  const [localDispatch, setLocalDispatch] = useState({ pickup_late_after: 0, stuck_after: 30 });
  const [localTimeFormat, setLocalTimeFormat] = useState("12h");
  const [hydrated, setHydrated] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const { settings, updateSettings, settingsLoaded } = useUserSettings();
  const { status, subscribe, sendTestPush } = usePushNotifications(currentUser);

  const [testState, setTestState] = useState("idle"); // idle | sending | sent | error
  const [testError, setTestError] = useState("");

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
    setLocalTimeFormat(settings.ui?.time_format === "24h" ? "24h" : "12h");
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
        ui: { time_format: localTimeFormat },
      });
      setSaved(true);
    } catch { /* noop */ }
    setSaving(false);
  };

  const handleEnable = async () => {
    setTestState("idle");
    setTestError("");
    await subscribe();
  };

  const handleTestPush = async () => {
    setTestState("sending");
    setTestError("");
    try {
      await sendTestPush();
      setTestState("sent");
    } catch (err) {
      setTestState("error");
      setTestError(err.message || "Failed to send test notification");
    }
  };

  if (loadingTypes || !hydrated) {
    return <div className="page-stack"><p className="text-muted">Loading...</p></div>;
  }

  const copy = STATUS_COPY[status] || STATUS_COPY.not_enabled;
  const isLocalhost = typeof window !== "undefined" && window.location.hostname === "localhost";

  return (
    <div className="page-stack">
      <section className="content-panel">
        <div className="content-panel-header">
          <div>
            <h4>Settings</h4>
            <p>Your personal preferences and notification settings — saved to your account across all sessions.</p>
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

        {/* Preferences */}
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
                  className={`btn btn-sm ${localTimeFormat === "12h" ? "btn-primary" : "btn-outline-secondary"}`}
                  onClick={() => { setLocalTimeFormat("12h"); setSaved(false); }}
                >
                  12-hour — 2:30 PM
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${localTimeFormat === "24h" ? "btn-primary" : "btn-outline-secondary"}`}
                  onClick={() => { setLocalTimeFormat("24h"); setSaved(false); }}
                >
                  24-hour — 14:30
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Browser Notifications */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#6c757d", letterSpacing: 1, marginBottom: 10, textTransform: "uppercase" }}>
            Push Notifications
          </div>
          <p style={{ fontSize: 12, color: "#6c757d", marginBottom: 10 }}>
            Background dispatch alerts delivered through your browser, even when this tab isn't open.
          </p>
          <div className="d-flex align-items-center justify-content-between" style={{ padding: "10px 0", borderBottom: "1px solid #2a3347" }}>
            <div>
              <div style={{ fontSize: 14, color: status === "enabled" ? "#fff" : "#6c757d" }}>
                {copy.message}
              </div>
            </div>
            <div className="d-flex align-items-center gap-2">
              {copy.badge && (
                <span style={{ fontSize: 12, color: copy.badgeColor, fontWeight: 600 }}>{copy.badge}</span>
              )}
              {status === "not_enabled" && (
                <button className="btn btn-sm btn-outline-primary" style={{ fontSize: 12 }} onClick={handleEnable}>
                  Enable notifications
                </button>
              )}
              {status === "enabled" && (
                <button className="btn btn-sm btn-outline-secondary" style={{ fontSize: 12 }} onClick={handleTestPush}>
                  {testState === "sending" ? "Sending..." : "Send test notification"}
                </button>
              )}
            </div>
          </div>

          {status === "blocked" && (
            <div style={{ fontSize: 12, color: "#6c757d", marginTop: 8 }}>
              Click the lock icon near the address bar → Site settings → Notifications → Allow.
              {isLocalhost && ` For localhost: click the lock icon near ${window.location.host} → Site settings → Notifications → Allow.`}
            </div>
          )}

          {status === "enabled" && testState === "sent" && (
            <div style={{ fontSize: 12, color: "#75b798", marginTop: 8 }}>
              Test notification sent — check for a browser notification.
            </div>
          )}
          {testState === "error" && (
            <div style={{ fontSize: 12, color: "#dc3545", marginTop: 8 }}>
              {testError}
            </div>
          )}
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
