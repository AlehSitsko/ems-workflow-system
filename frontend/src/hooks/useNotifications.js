import { useState, useEffect, useCallback } from "react";

import API_BASE from "../api/config.js";
const POLL_INTERVAL = 10_000;

export function useNotifications(user) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await fetch(`${API_BASE}/api/notifications?user_id=${user.id}`, { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      setUnreadCount(data.unread_count);
      setNotifications(data.notifications);
    } catch { /* noop */ }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    fetchNotifications();
    const interval = setInterval(fetchNotifications, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [user?.id, fetchNotifications]);

  const markRead = useCallback(async (notifId) => {
    if (!user?.id) return;
    try {
      await fetch(`${API_BASE}/api/notifications/read`, {
    credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id, notification_id: notifId }),
      });
    } catch { /* noop */ }
    setNotifications((prev) => prev.map((n) => n.id === notifId ? { ...n, is_read: true } : n));
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }, [user?.id]);

  const markAllRead = useCallback(async () => {
    if (!user?.id) return;
    try {
      await fetch(`${API_BASE}/api/notifications/read-all`, {
    credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id }),
      });
    } catch { /* noop */ }
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
  }, [user?.id]);

  return { notifications, unreadCount, markRead, markAllRead, refresh: fetchNotifications };
}
