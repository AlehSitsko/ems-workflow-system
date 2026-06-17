import React, { useState, useEffect } from "react";
import { FaBell, FaSave } from "react-icons/fa";
import { usePushNotifications } from "../hooks/usePushNotifications";

const API_BASE = "http://127.0.0.1:5050";

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
    types: ["cert_expiring", "employee_added"],
  },
];

function NotificationSettingsPage({ currentUser }) {
  const [prefs, setPrefs] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const { pushState, subscribe, dismiss } = usePushNotifications(currentUser);

  useEffect(() => {
    if (!currentUser?.id) return;
    fetch(`${API_BASE}/api/notifications/prefs?user_id=${currentUser.id}`)
      .then((r) => r.json())
      .then((data) => {
        setPrefs(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
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
      await fetch(`${API_BASE}/api/notifications/prefs`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: currentUser.id, prefs: flat }),
      });
      setSaved(true);
    } catch (e) {}
    setSaving(false);
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
      </section>
    </div>
  );
}

export default NotificationSettingsPage;
