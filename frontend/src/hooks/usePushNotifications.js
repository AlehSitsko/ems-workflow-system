import { useState, useEffect, useCallback } from "react";

import API_BASE from "../api/config.js";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

const supported =
  typeof window !== "undefined" &&
  "Notification" in window &&
  "serviceWorker" in navigator &&
  "PushManager" in window;

// Full status classification for the Notification Settings UI:
// "unsupported" | "insecure" | "not_enabled" | "blocked" | "enabled"
export function getNotificationStatus() {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  if (!window.isSecureContext) {
    return "insecure";
  }
  if (Notification.permission === "granted") {
    return "enabled";
  }
  if (Notification.permission === "denied") {
    return "blocked";
  }
  return "not_enabled";
}

export function usePushNotifications(user) {
  const [pushState, setPushState] = useState(() => {
    if (!supported) return "unsupported";
    return Notification.permission; // "default" | "granted" | "denied"
  });
  const [status, setStatus] = useState(getNotificationStatus);
  const [bannerDismissed, setBannerDismissed] = useState(
    () => localStorage.getItem("push_banner_dismissed") === "1"
  );
  // Whether the server has a VAPID key configured — null while still loading.
  // Browser permission and server push capability are independent; both must
  // be true for push to actually work end-to-end.
  const [vapidConfigured, setVapidConfigured] = useState(null);

  // Keep pushState in sync if permission changes externally.
  useEffect(() => {
    if (!supported) return;
    setPushState(Notification.permission);
    setStatus(getNotificationStatus());
  }, []);

  // Register service worker once.
  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  }, []);

  // Check server-side push configuration once, independent of browser permission.
  useEffect(() => {
    if (!supported) { setVapidConfigured(false); return; }
    fetch(`${API_BASE}/api/notifications/vapid-public-key`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setVapidConfigured(!!data.publicKey))
      .catch(() => setVapidConfigured(false));
  }, []);

  const subscribe = useCallback(async () => {
    if (!user?.id || !supported) return;

    // Step 1: explicitly request notification permission.
    let permission = Notification.permission;
    if (permission === "default") {
      permission = await Notification.requestPermission();
    }
    setPushState(permission);
    setStatus(getNotificationStatus());

    if (permission !== "granted") {
      // User denied or dismissed — close banner.
      localStorage.setItem("push_banner_dismissed", "1");
      setBannerDismissed(true);
      return;
    }

    // Step 2: fetch VAPID public key and subscribe.
    try {
      const res = await fetch(`${API_BASE}/api/notifications/vapid-public-key`, { credentials: "include" });
      const { publicKey } = await res.json();
      if (!publicKey) throw new Error("No VAPID key");

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      await fetch(`${API_BASE}/api/notifications/push-subscribe`, {
    credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id, subscription: sub.toJSON() }),
      });
    } catch { /* noop */ }

    localStorage.setItem("push_banner_dismissed", "1");
    setBannerDismissed(true);
  }, [user?.id]);

  const dismiss = useCallback(() => {
    localStorage.setItem("push_banner_dismissed", "1");
    setBannerDismissed(true);
  }, []);

  // Sends a real test push through the backend (VAPID) to this user's subscription.
  const sendTestPush = useCallback(async () => {
    if (!user?.id) throw new Error("Not logged in");
    const res = await fetch(`${API_BASE}/api/notifications/test-push`, {
    credentials: "include",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: user.id }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Failed to send test notification");
    return data;
  }, [user?.id]);

  const showBanner =
    supported &&
    !bannerDismissed &&
    pushState !== "granted" &&
    pushState !== "denied";

  return { pushState, status, vapidConfigured, showBanner, subscribe, dismiss, sendTestPush };
}
