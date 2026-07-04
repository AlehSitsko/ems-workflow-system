// Display copy for every browser-notification status shown in Settings.
// Statuses come from usePushNotifications(): unsupported | insecure | not_enabled | blocked | enabled.
// "push_not_configured" is a derived status computed below — browser permission is granted,
// but the server has no VAPID key, so a push subscription can never succeed.
export const STATUS_COPY = {
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
    badge: "Not enabled",
    badgeColor: "#6c757d",
    message: "Browser notifications are not enabled.",
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
  push_not_configured: {
    badge: "Browser enabled / Push not configured",
    badgeColor: "#f0ad4e",
    message: "Push service is not configured. Browser permission is enabled, but server push delivery requires VAPID keys.",
  },
};

// Combines the raw browser-permission status with server-side push configuration.
// vapidConfigured is null while still loading — treat that as "assume configured"
// so the UI doesn't flash a false warning before the check completes.
export function getEffectiveStatus(status, vapidConfigured) {
  if (status === "enabled" && vapidConfigured === false) {
    return "push_not_configured";
  }
  return status;
}
