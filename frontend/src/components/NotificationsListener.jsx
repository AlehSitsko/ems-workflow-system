import { useEffect, useRef, useState } from "react";
import { useToast } from "./ui/useToast";
import { useOrgEvents } from "../hooks/useOrgEvents";
import { getSettings } from "../api/settingsApi";
import { resolveDelivery, DEFAULT_NOTIFICATION_PREFS, NOTIFICATION_TYPES } from "../utils/notificationRules";
import { playNotificationSound } from "../utils/notificationSound";

// Broadcast so the listener re-reads preferences right after the settings screen
// saves them (no page reload needed).
export const PREFS_CHANGED_EVENT = "ems:notification-prefs-changed";

function titleFor(event) {
  return NOTIFICATION_TYPES[event?.type]?.label || "Update";
}

function detailFor(event) {
  const p = event?.payload || {};
  if (event?.type === "call.created") {
    const route = [p.pickup, p.dropoff].filter(Boolean).join(" → ");
    return route || (p.serviceLevel ? `${p.serviceLevel} call` : "");
  }
  return "";
}

/**
 * App-wide notification engine: turns the org's realtime events into a visual
 * toast and/or a sound, according to the user's preferences — and never for the
 * user's own action. Renders nothing.
 */
export default function NotificationsListener({ currentUser }) {
  const toast = useToast();
  const [prefs, setPrefs] = useState(DEFAULT_NOTIFICATION_PREFS);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  async function loadPrefs() {
    try {
      const s = await getSettings();
      if (s?.realtimeNotifications) {
        setPrefs({ ...DEFAULT_NOTIFICATION_PREFS, ...s.realtimeNotifications });
      }
    } catch { /* keep defaults */ }
  }

  useEffect(() => { loadPrefs(); }, []);
  useEffect(() => {
    const handler = () => loadPrefs();
    window.addEventListener(PREFS_CHANGED_EVENT, handler);
    return () => window.removeEventListener(PREFS_CHANGED_EVENT, handler);
  }, []);

  const deliver = (event) => {
    const { visual, sound } = resolveDelivery(event, prefsRef.current, {
      currentUserId: currentUser?.id,
    });
    if (visual) toast.info(titleFor(event), detailFor(event));
    if (sound !== "none") playNotificationSound(sound, prefsRef.current.volume);
  };

  useOrgEvents({
    "call.created": deliver,
    "dispatch.assignment_changed": deliver,
    "unit.status_changed": deliver,
  });

  return null;
}
