/**
 * Planned trip end = pickup time + estimated duration.
 *
 * The backend returns `planned_end_time` on every call for display; this mirrors
 * that maths on the client so a form can preview the end as the user types,
 * before anything is saved. Kept identical to Call._compute_planned_end_time.
 */

/**
 * @param {string} pickupTime  "HH:MM"
 * @param {number|string} minutes  estimated duration
 * @returns {{time: string, nextDay: boolean} | null} null when uncomputable
 */
export function computePlannedEnd(pickupTime, minutes) {
  const mins = Number(minutes);
  if (!pickupTime || !Number.isFinite(mins) || mins <= 0) return null;

  const match = /^(\d{1,2}):(\d{2})$/.exec(pickupTime.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;

  const total = h * 60 + m + Math.round(mins);
  const endMinutes = ((total % 1440) + 1440) % 1440;
  const hh = String(Math.floor(endMinutes / 60)).padStart(2, "0");
  const mm = String(endMinutes % 60).padStart(2, "0");
  return { time: `${hh}:${mm}`, nextDay: total >= 1440 };
}
