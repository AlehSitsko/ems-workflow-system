import { STATUS_COPY, getEffectiveStatus } from "./notificationStatus";

// Browser Notifications — desktop alerts delivered through the browser's own
// push service (VAPID + service worker), even when the tab isn't open.
//
// Status shown here is derived from the *actual* browser permission
// (Notification.permission) plus server-side push configuration, never just
// a saved preference — a denied/misconfigured state must never be reported
// as "Enabled".
function BrowserNotificationSettings({ status, vapidConfigured, onEnable, onSendTest, testState, testError }) {
  const effectiveStatus = getEffectiveStatus(status, vapidConfigured);
  const copy = STATUS_COPY[effectiveStatus] || STATUS_COPY.not_enabled;
  const isLocalhost = typeof window !== "undefined" && window.location.hostname === "localhost";

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#6c757d", letterSpacing: 1, marginBottom: 10, textTransform: "uppercase" }}>
        Browser Notifications
      </div>
      <p style={{ fontSize: 12, color: "#6c757d", marginBottom: 10 }}>
        Browser-level desktop alerts for important dispatch events, delivered even when this tab isn't open. Requires browser permission and push service configuration.
      </p>
      <div className="d-flex align-items-center justify-content-between" style={{ padding: "10px 0", borderBottom: "1px solid #2a3347" }}>
        <div>
          <div style={{ fontSize: 14, color: effectiveStatus === "enabled" ? "var(--ems-text-primary)" : "#6c757d" }}>
            {copy.message}
          </div>
        </div>
        <div className="d-flex align-items-center gap-2">
          {copy.badge && (
            <span style={{ fontSize: 12, color: copy.badgeColor, fontWeight: 600 }}>{copy.badge}</span>
          )}
          {status === "not_enabled" && (
            <button className="btn btn-sm btn-outline-primary" style={{ fontSize: 12 }} onClick={onEnable}>
              Enable notifications
            </button>
          )}
          {effectiveStatus === "enabled" && (
            <button className="btn btn-sm btn-outline-secondary" style={{ fontSize: 12 }} onClick={onSendTest}>
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

      {effectiveStatus === "push_not_configured" && (
        <div style={{ fontSize: 12, color: "#6c757d", marginTop: 8 }}>
          This is a server configuration issue, not something you can fix from this page — an administrator needs to set up VAPID keys.
        </div>
      )}

      {effectiveStatus === "enabled" && testState === "sent" && (
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
  );
}

export default BrowserNotificationSettings;
