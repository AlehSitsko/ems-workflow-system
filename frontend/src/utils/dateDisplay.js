import { formatTimeForDisplay } from "./timeUtils";

/**
 * Human-readable dates for the UI.
 *
 * Raw ISO timestamps ("2026-07-15T08:15:03") are a storage format, not
 * something a person scans in a list. Everything user-facing goes through here.
 *
 * Operational dates (trip_date, shift_date, expiry dates) are plain local
 * calendar days and are parsed from their parts — never through
 * `new Date("YYYY-MM-DD")`, which is treated as UTC and can show the wrong day.
 */

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "YYYY-MM-DD" -> local Date, or null. Timezone-safe. */
export function parseOperationalDate(iso) {
  if (typeof iso !== "string") return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d] = m.map(Number);
  const date = new Date(y, mo - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "2026-07-15" -> "Jul 15, 2026" */
export function formatDate(iso, { fallback = "—" } = {}) {
  const date = parseOperationalDate(iso);
  if (!date) return fallback;
  return `${MONTHS_SHORT[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

/** An ISO datetime -> "Jul 15, 2026, 8:15 AM" (respects the 12h/24h setting). */
export function formatDateTime(isoDateTime, timeFormat = "12h", { fallback = "—" } = {}) {
  if (typeof isoDateTime !== "string" || !isoDateTime) return fallback;
  const [datePart, timePart] = isoDateTime.split("T");
  const date = formatDate(datePart, { fallback: null });
  if (!date) return fallback;
  if (!timePart) return date;
  const time = formatTimeForDisplay(timePart.slice(0, 5), timeFormat);
  return time ? `${date}, ${time}` : date;
}

/**
 * Whole days from today to an operational date. Negative = in the past.
 * Both sides are normalized to local midnight so a time-of-day never turns
 * "tomorrow" into "in 0 days".
 */
export function daysUntil(iso, today = new Date()) {
  const target = parseOperationalDate(iso);
  if (!target) return null;
  const from = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target - from) / 86400000);
}

/**
 * Relative phrasing for a due date: "Due in 18 days" / "Overdue by 20 days".
 * Returns { label, tone } so callers do not re-derive severity.
 */
export function describeDueDate(iso, { warnWithinDays = 7 } = {}) {
  const days = daysUntil(iso);
  if (days === null) return { label: "Not scheduled", tone: "neutral", days: null };
  if (days < 0) {
    const n = Math.abs(days);
    return { label: `Overdue by ${n} ${n === 1 ? "day" : "days"}`, tone: "danger", days };
  }
  if (days === 0) return { label: "Due today", tone: "warning", days };
  const tone = days <= warnWithinDays ? "warning" : "success";
  return { label: `Due in ${days} ${days === 1 ? "day" : "days"}`, tone, days };
}
