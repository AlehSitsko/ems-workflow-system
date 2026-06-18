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

export function usePushNotifications(user) {
  const [pushState, setPushState] = useState(() => {
    if (!supported) return "unsupported";
    return Notification.permission; // "default" | "granted" | "denied"
  });
  const [bannerDismissed, setBannerDismissed] = useState(
    () => localStorage.getItem("push_banner_dismissed") === "1"
  );

  // Keep pushState in sync if permission changes externally.
  useEffect(() => {
    if (!supported) return;
    setPushState(Notification.permission);
  }, []);

  // Register service worker once.
  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  const subscribe = useCallback(async () => {
    if (!user?.id || !supported) return;

    // Step 1: explicitly request notification permission.
    let permission = Notification.permission;
    if (permission === "default") {
      permission = await Notification.requestPermission();
    }
    setPushState(permission);

    if (permission !== "granted") {
      // User denied or dismissed — close banner.
      localStorage.setItem("push_banner_dismissed", "1");
      setBannerDismissed(true);
      return;
    }

    // Step 2: fetch VAPID public key and subscribe.
    try {
      const res = await fetch(`${API_BASE}/api/notifications/vapid-public-key`);
      const { publicKey } = await res.json();
      if (!publicKey) throw new Error("No VAPID key");

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      await fetch(`${API_BASE}/api/notifications/push-subscribe`, {
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

  const showBanner =
    supported &&
    !bannerDismissed &&
    pushState !== "granted" &&
    pushState !== "denied";

  return { pushState, showBanner, subscribe, dismiss };
}
