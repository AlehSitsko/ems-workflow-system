import React, { useState, useRef, useEffect } from "react";
import { FaBell, FaCheckDouble } from "react-icons/fa";

const SEVERITY_COLOR = {
  critical: "#dc3545",
  warning:  "#ffc107",
  info:     "#6ea8fe",
};

const TYPE_ICON = {
  call_new_today:       "📞",
  call_unassigned_soon: "⏰",
  call_als_on_bls:      "⚠️",
  unit_understaffed:    "👥",
  unit_stuck_status:    "🚑",
  cert_expiring:        "📋",
  employee_added:       "👤",
};

function timeAgo(isoStr) {
  if (!isoStr) return "";
  const diff = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function NotificationBell({ notifications, unreadCount, markRead, markAllRead }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        className="topbar-icon-button"
        onClick={() => setOpen((o) => !o)}
        title="Notifications"
      >
        <FaBell />
        {unreadCount > 0 && (
          <span className="topbar-notification-badge">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", right: 0,
          width: 360, maxHeight: 480, overflowY: "auto",
          background: "#1e2430", border: "1px solid #2a3347",
          borderRadius: 10, boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          zIndex: 2000,
        }}>
          {/* Header */}
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "12px 16px", borderBottom: "1px solid #2a3347",
            position: "sticky", top: 0, background: "#1e2430",
          }}>
            <span style={{ fontWeight: 600, fontSize: 14, color: "#fff" }}>
              Notifications {unreadCount > 0 && <span style={{ color: "#6ea8fe" }}>({unreadCount})</span>}
            </span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                style={{ background: "none", border: "none", color: "#6ea8fe", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
              >
                <FaCheckDouble /> Mark all read
              </button>
            )}
          </div>

          {/* List */}
          {notifications.length === 0 ? (
            <div style={{ padding: "32px 16px", textAlign: "center", color: "#6c757d", fontSize: 13 }}>
              No notifications
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                onClick={() => !n.is_read && markRead(n.id)}
                style={{
                  padding: "10px 16px",
                  borderBottom: "1px solid #2a3347",
                  background: n.is_read ? "transparent" : "rgba(110,168,254,0.06)",
                  cursor: n.is_read ? "default" : "pointer",
                  display: "flex", gap: 10, alignItems: "flex-start",
                }}
              >
                <span style={{ fontSize: 18, flexShrink: 0, marginTop: 2 }}>
                  {TYPE_ICON[n.type] || "🔔"}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <span style={{
                      fontSize: 13, fontWeight: n.is_read ? 400 : 600,
                      color: n.is_read ? "#adb5bd" : "#fff",
                      lineHeight: 1.3,
                    }}>
                      {n.title}
                    </span>
                    <span style={{ fontSize: 11, color: "#6c757d", flexShrink: 0 }}>
                      {timeAgo(n.created_at)}
                    </span>
                  </div>
                  {n.body && (
                    <div style={{ fontSize: 12, color: "#6c757d", marginTop: 2, lineHeight: 1.4 }}>
                      {n.body}
                    </div>
                  )}
                  <div style={{
                    display: "inline-block", marginTop: 4,
                    fontSize: 10, fontWeight: 600, letterSpacing: 0.5,
                    color: SEVERITY_COLOR[n.severity] || "#6c757d",
                    textTransform: "uppercase",
                  }}>
                    {n.severity}
                  </div>
                </div>
                {!n.is_read && (
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#6ea8fe", flexShrink: 0, marginTop: 6 }} />
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default NotificationBell;
