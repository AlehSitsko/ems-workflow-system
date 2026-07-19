// Shared helpers/constants for the Dispatch Board — extracted from
// DispatchBoardPage.jsx (Phase 1 of its component/hook split, see
// docs/ROADMAP.md Priority 1). Pure functions and constants only, no
// JSX/hooks — used by DispatchBoardPage.jsx and components/dispatch/*.jsx.

export const STATUS_NEXT = {
  available: "en_route",
  en_route: "on_scene",
  on_scene: "transporting",
  transporting: "at_destination",
  at_destination: "available",
  out_of_service: "available",
};

export const STATUS_LABELS = {
  available: "Available",
  en_route: "En Route",
  on_scene: "On Scene",
  transporting: "Transporting",
  at_destination: "At Destination",
  out_of_service: "Out of Service",
};

// Pill foreground (light accent) per status — see the --ems-status-* tokens in
// theme.css. Whole-value usage, so the CSS variables drop straight in.
export const STATUS_COLORS = {
  available:      "var(--ems-status-available)",
  en_route:       "var(--ems-status-en_route)",
  on_scene:       "var(--ems-status-on_scene)",
  transporting:   "var(--ems-status-transporting)",
  at_destination: "var(--ems-status-at_destination)",
  out_of_service: "var(--ems-status-out_of_service)",
};

// Foreground as an rgb triple, for translucent borders/tints on the pill.
export const STATUS_RGB = {
  available:      "var(--ems-status-available-rgb)",
  en_route:       "var(--ems-status-en_route-rgb)",
  on_scene:       "var(--ems-status-on_scene-rgb)",
  transporting:   "var(--ems-status-transporting-rgb)",
  at_destination: "var(--ems-status-at_destination-rgb)",
  out_of_service: "var(--ems-status-out_of_service-rgb)",
};

// Solid pill background per status — deliberately dark so the light foreground
// reads on either a light or dark board.
export const STATUS_BG = {
  available:      "var(--ems-status-available-bg)",
  en_route:       "var(--ems-status-en_route-bg)",
  on_scene:       "var(--ems-status-on_scene-bg)",
  transporting:   "var(--ems-status-transporting-bg)",
  at_destination: "var(--ems-status-at_destination-bg)",
  out_of_service: "var(--ems-status-out_of_service-bg)",
};

// Shift-alert severity → { border, bg } for the unit row, on semantic tokens so
// the tint tracks the theme.
export const SHIFT_SEVERITY_STYLE = {
  minor:    { border: "var(--color-warning)", bg: "rgba(var(--color-warning-rgb), 0.06)" },
  warning:  { border: "var(--color-warning)", bg: "rgba(var(--color-warning-rgb), 0.10)" },
  serious:  { border: "var(--color-danger)",  bg: "rgba(var(--color-danger-rgb), 0.09)" },
  critical: { border: "var(--color-danger)",  bg: "rgba(var(--color-danger-rgb), 0.18)" },
};

// Patient-alert severity → { fg, bg, border }. An object (not a bare colour)
// because callers need a tinted background and border, which token rgba builds
// cleanly where the old hex-suffix concatenation could not.
export const ALERT_SEVERITY_STYLE = {
  info:     { fg: "var(--color-primary)", bg: "rgba(var(--color-primary-rgb), 0.12)", border: "rgba(var(--color-primary-rgb), 0.33)" },
  warning:  { fg: "var(--color-warning)", bg: "rgba(var(--color-warning-rgb), 0.12)", border: "rgba(var(--color-warning-rgb), 0.33)" },
  critical: { fg: "var(--color-danger)",  bg: "rgba(var(--color-danger-rgb), 0.12)",  border: "rgba(var(--color-danger-rgb), 0.33)" },
};

// Call timestamp stages — semantic accent per stage (theme-aware).
export const TS_FIELDS = [
  { key: "dispatched_at",     label: "Dispatched",   color: "var(--color-primary)" },
  { key: "arrived_pickup_at", label: "On Scene",     color: "var(--color-success)" },
  { key: "patient_loaded_at", label: "Transporting", color: "var(--color-warning)" },
  { key: "arrived_dest_at",   label: "At Dest",      color: "var(--color-purple)" },
  { key: "completed_at",      label: "Completed",    color: "var(--color-text-muted)" },
];

// Local operational date (YYYY-MM-DD). Uses local getters — never toISOString,
// which would roll to the previous/next day for users behind/ahead of UTC.
// trip_date / shift_date are local operational dates, so the board compares
// against a local "today".
export function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Serialise a Date as a naive LOCAL "YYYY-MM-DDTHH:MM:SS" — the convention call
// timestamps are stored and read in. toISOString() must not be used here: it
// converts to UTC, and because the result carries no "Z" the reader parses it
// back as local time, shifting the value by the UTC offset on every save.
export function toLocalIsoString(date) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`
    + `T${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`;
}

// Local date part (YYYY-MM-DD) of a stored naive timestamp.
export function localDatePart(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return toLocalIsoString(d).slice(0, 10);
}

// True only for a *real* calendar date in YYYY-MM-DD form — the same meaning the
// backend enforces (utils/operational_dates.parse_operational_date). A shape-only
// regex would accept 2026-02-30 / 2026-99-99, so round-trip through a local Date
// (never Date.parse of the string, which would apply UTC).
export function isIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

// Step a YYYY-MM-DD date by ±N days, timezone-safe (local calendar math, no UTC
// parsing). Correctly rolls across month and year boundaries.
export function addDays(dateStr, delta) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d + delta);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

// Dispatch Board operates in one of three date modes. A future date is Planning
// (assign/prepare, no live lifecycle), today is Live (full operations), a past
// date is History (read-only).
export function boardMode(dateStr, today = todayStr()) {
  if (!dateStr || dateStr === today) return "live";
  return dateStr > today ? "planning" : "history";
}

export const BOARD_MODE_META = {
  planning: { label: "Planning", hint: "Future date — assign and prepare units. Live status changes are disabled." },
  live: { label: "Live", hint: "Today — full dispatch operations." },
  history: { label: "History", hint: "Past date — read-only." },
};

// Assignment edits (assign/unassign/queue/units) are allowed in Planning + Live.
export function canEditAssignments(mode) {
  return mode === "planning" || mode === "live";
}

// Live lifecycle (status transitions, complete/reopen) is Live-only.
export function canUseLiveStatus(mode) {
  return mode === "live";
}

export function minCrewForType(t) {
  const u = (t || "").toUpperCase();
  if (u === "BLS-4" || u === "BLS-6") return 4;
  return 2;
}

export function isAlsUnit(t) { return (t || "").toUpperCase() === "ALS"; }
export function isAlsCall(c) { return (c.service_level || "").toUpperCase() === "ALS"; }
export function isEmergencyCall(c) { return (c.call_type || "").toLowerCase() === "emergency"; }
export function isWillCall(c) { return (c.call_type || "").toLowerCase() === "will_call"; }
export function hasReturnRide(c) {
  const ct = (c.call_type || "").toLowerCase();
  return ct === "return" || ct === "will_call";
}

export function parseReturnInfo(notes) {
  if (!notes) return null;
  const m = notes.match(
    /Return pickup:\s*([^;]+);\s*Return destination:\s*([^;]+);\s*Return time:\s*([^\n]+)/i
  );
  if (!m) return null;
  return { returnPickup: m[1].trim(), returnDestination: m[2].trim(), returnTime: m[3].trim() };
}

// Convert "HH:MM AM/PM" or "HH:MM" to sortable minutes
export function timeToMinutes(t) {
  if (!t) return 99999;
  const ampm = t.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (ampm) {
    let h = parseInt(ampm[1]);
    const min = parseInt(ampm[2]);
    const p = ampm[3].toUpperCase();
    if (p === "PM" && h !== 12) h += 12;
    if (p === "AM" && h === 12) h = 0;
    return h * 60 + min;
  }
  const plain = t.match(/(\d+):(\d+)/);
  if (plain) return parseInt(plain[1]) * 60 + parseInt(plain[2]);
  return 99999;
}

// Expand return ride calls into outbound + return slots, sorted by pickup_time.
// Old-style records embed return info in notes and expand into 2 slots.
// New-style records are already 2 separate Call rows (call_type="return").
export function expandAndSort(calls) {
  const result = [];
  for (const call of calls) {
    const ret = parseReturnInfo(call.notes);
    if (ret) {
      // Old-style: return info embedded in notes — expand into two virtual slots
      result.push({ ...call, _slot: "outbound", _sortTime: timeToMinutes(call.pickup_time) });
      result.push({
        ...call,
        _slot: "return",
        _returnInfo: ret,
        pickup_address: ret.returnPickup || "—",
        dropoff_address: ret.returnDestination || "—",
        pickup_time: ret.returnTime || "",
        _sortTime: timeToMinutes(ret.returnTime || call.appointment_time),
      });
    } else {
      const ct = (call.call_type || "").toLowerCase();
      const slot = ct === "return" ? "return" : ct === "will_call" ? "will_call" : "outbound";
      // Will Call sorts after all scheduled calls (no pickup_time yet).
      const sortTime = ct === "will_call" ? 999999 : timeToMinutes(call.pickup_time);
      result.push({ ...call, _slot: slot, _sortTime: sortTime });
    }
  }
  return result.sort((a, b) => a._sortTime - b._sortTime);
}

// Returns severity level for shift timing: null | "minor" | "warning" | "serious" | "critical"
export function getShiftAlertSeverity(unit) {
  if (!unit.startTime || !unit.shiftDurationHours || !unit.plannedEndTime) return null;
  if (unit.shiftStatus === "completed" || unit.shiftStatus === "cancelled") return null;
  const now = new Date();
  // Local operational date — shift_date is local, so a UTC "today" would drop
  // the alert colouring either side of midnight for anyone off UTC.
  const today = todayStr();
  // Only apply alert coloring for today's units; stale units from past dates stay neutral.
  if (unit.shiftDate && unit.shiftDate !== today) return null;
  const dateStr = unit.shiftDate || today;
  // Detect midnight crossover: if planned end is earlier than start, it's next day.
  let plannedEnd = new Date(`${dateStr}T${unit.plannedEndTime}:00`);
  if (unit.plannedEndTime < unit.startTime) {
    plannedEnd = new Date(plannedEnd.getTime() + 24 * 60 * 60 * 1000);
  }
  const minutesLeft = (plannedEnd - now) / 60000;
  if (minutesLeft > 30) return null;
  if (minutesLeft > 15) return "warning";
  if (minutesLeft > 0)  return "serious";
  const delay = -minutesLeft;
  if (delay < 30)  return "minor";
  if (delay < 60)  return "warning";
  if (delay < 120) return "serious";
  return "critical";
}

export function isoToLocalTime(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d)) return "";
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  } catch { return ""; }
}

export function isoToLocalDate(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d)) return "";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch { return ""; }
}

export function setIsoTime(existingIso, callDate, timeStr) {
  // Keep the timestamp's own date (falling back to the call's trip_date), and
  // write it back in the same naive-local form it was read in.
  const date = existingIso ? localDatePart(existingIso) : (callDate || todayStr());
  if (!date) return existingIso;
  const dt = new Date(`${date}T${timeStr}:00`);
  if (isNaN(dt)) return existingIso;
  return toLocalIsoString(dt);
}
