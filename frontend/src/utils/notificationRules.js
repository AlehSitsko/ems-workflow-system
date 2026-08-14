/**
 * Notification engine rules: Event -> (org policy +) user preferences -> delivery.
 *
 * Pure and framework-free so it is easy to test. `resolveDelivery` decides, for one
 * realtime event and a user's preferences, whether to show a visual toast and which
 * sound (if any) to play. Delivery channels today are Visual and Sound; the shape
 * leaves room for Desktop/Email/Push later.
 */

export const CHANNELS = { OFF: "off", VISUAL: "visual", SOUND: "sound" };

// The notification types the engine knows about, grouped by category, each with a
// sensible default channel so a user never has to configure dozens of options.
export const NOTIFICATION_TYPES = {
  "call.created": { category: "Calls", key: "newCall", label: "New call created", default: CHANNELS.SOUND },
  "dispatch.assignment_changed": { category: "Calls", key: "assignmentChanged", label: "Call assignment changed", default: CHANNELS.VISUAL },
  "unit.status_changed": { category: "Calls", key: "unitStatusChanged", label: "Unit status changed", default: CHANNELS.OFF },
};

export const DEFAULT_NOTIFICATION_PREFS = {
  soundEnabled: true,
  volume: 0.5,
  dnd: false, // manual Do Not Disturb
  quietHours: { enabled: false, start: "22:00", end: "07:00" },
  types: {
    newCall: CHANNELS.SOUND,
    assignmentChanged: CHANNELS.VISUAL,
    unitStatusChanged: CHANNELS.OFF,
  },
};

export function inQuietHours(now, quietHours) {
  if (!quietHours?.enabled) return false;
  const toMin = (s) => { const [h, m] = String(s).split(":").map(Number); return h * 60 + m; };
  const cur = now.getHours() * 60 + now.getMinutes();
  const start = toMin(quietHours.start);
  const end = toMin(quietHours.end);
  // A range that wraps past midnight (e.g. 22:00 -> 07:00) is "outside [end, start)".
  return start <= end ? (cur >= start && cur < end) : (cur >= start || cur < end);
}

export function isUrgent(event) {
  const p = event?.payload || {};
  return p.callType === "emergency" || p.priority === "urgent" || p.priority === "high";
}

/**
 * @returns {{ visual: boolean, sound: "none"|"normal"|"urgent" }}
 */
export function resolveDelivery(event, prefs = DEFAULT_NOTIFICATION_PREFS, ctx = {}) {
  const { currentUserId = null, now = new Date() } = ctx;

  // A user is never notified about their own action.
  if (event?.actorUserId != null && event.actorUserId === currentUserId) {
    return { visual: false, sound: "none" };
  }

  const meta = NOTIFICATION_TYPES[event?.type];
  if (!meta) return { visual: false, sound: "none" };

  const channel = prefs?.types?.[meta.key] ?? meta.default;
  if (channel === CHANNELS.OFF) return { visual: false, sound: "none" };

  let sound = "none";
  if (channel === CHANNELS.SOUND && prefs?.soundEnabled) {
    sound = isUrgent(event) ? "urgent" : "normal";
  }
  // DND / quiet hours silence the sound but keep the visual, so nothing is missed.
  if (prefs?.dnd || inQuietHours(now, prefs?.quietHours)) {
    sound = "none";
  }
  return { visual: true, sound };
}
