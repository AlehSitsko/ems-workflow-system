// Time-of-day utilities. Internal storage/wire format is always 24-hour "HH:MM".
// UI display format (12h vs 24h) is a per-user preference — see UserSettingsContext.

const TIME_24_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const TIME_12_RE = /^(0?[1-9]|1[0-2]):([0-5]\d)\s*([AaPp][Mm])$/;

// True only for a strict 24-hour "HH:MM" string (00:00–23:59).
export function isValidTime(value) {
  if (!value) return false;
  return TIME_24_RE.test(String(value).trim());
}

// Tolerant parse of legacy/alternate time formats into strict 24h "HH:MM".
// Accepts "07:00", "7:00", "2:30 PM", "14:30". Returns null if unparseable —
// callers should fall back to the original value rather than crash.
export function normalizeTimeValue(value) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const ampm = raw.match(TIME_12_RE);
  if (ampm) {
    return convert12hTo24h(ampm[1], ampm[2], ampm[3]);
  }

  const plain = raw.match(/^(\d{1,2}):(\d{1,2})$/);
  if (plain) {
    const h = parseInt(plain[1], 10);
    const m = parseInt(plain[2], 10);
    if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  return null;
}

// Minutes since midnight, or null if the value can't be parsed as a time.
export function parseTimeToMinutes(value) {
  const norm = normalizeTimeValue(value);
  if (!norm) return null;
  const [h, m] = norm.split(":").map(Number);
  return h * 60 + m;
}

// hour: 1-12, minute: 0-59, period: "AM"|"PM" -> 24h "HH:MM", or null if invalid.
export function convert12hTo24h(hour, minute, period) {
  let h = parseInt(hour, 10);
  const m = parseInt(minute, 10);
  const p = String(period || "").toUpperCase();
  if (isNaN(h) || isNaN(m) || h < 1 || h > 12 || m < 0 || m > 59) return null;
  if (p === "AM") h = h === 12 ? 0 : h;
  else if (p === "PM") h = h === 12 ? 12 : h + 12;
  else return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// 24h "HH:MM" -> { hour: "1"-"12", minute: "00"-"59", period: "AM"|"PM" }, or null.
export function convert24hTo12h(value) {
  const norm = normalizeTimeValue(value);
  if (!norm) return null;
  const [hStr, minute] = norm.split(":");
  const h24 = parseInt(hStr, 10);
  const period = h24 >= 12 ? "PM" : "AM";
  const hour = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
  return { hour: String(hour), minute, period };
}

// Formats a stored time value for display per the user's time format preference.
// Tolerant of legacy/malformed values — returns the original string rather than crashing.
export function formatTimeForDisplay(value, timeFormat = "12h") {
  if (!value) return "";
  if (String(value).toLowerCase() === "will_call") return "Will Call";

  const norm = normalizeTimeValue(value);
  if (!norm) return String(value);
  if (timeFormat === "24h") return norm;

  const parts = convert24hTo12h(norm);
  if (!parts) return norm;
  return `${parts.hour}:${parts.minute} ${parts.period}`;
}
