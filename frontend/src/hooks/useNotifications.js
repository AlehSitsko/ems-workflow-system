import { useState, useEffect, useCallback } from "react";

const API_BASE = "http://127.0.0.1:5050";
const POLL_INTERVAL = 10_000;

export function useNotifications(user) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await fetch(`${API_BASE}/api/notifications?user_id=${user.id}`);
      if (!res.ok) return;
      const data = await res.json();
      setUnreadCount(data.unread_count);
      setNotifications(data.notifications);
    } catch (e) {
      // Silently ignore poll failures.
    }
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
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id, notification_id: notifId }),
      });
    } catch (e) {}
    setNotifications((prev) => prev.map((n) => n.id === notifId ? { ...n, is_read: true } : n));
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }, [user?.id]);

  const markAllRead = useCallback(async () => {
    if (!user?.id) return;
    try {
      await fetch(`${API_BASE}/api/notifications/read-all`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id }),
      });
    } catch (e) {}
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
  }, [user?.id]);

  return { notifications, unreadCount, markRead, markAllRead, refresh: fetchNotifications };
}
