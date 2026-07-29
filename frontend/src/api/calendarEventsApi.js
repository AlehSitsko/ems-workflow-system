import API_BASE from "./config.js";

const BASE = `${API_BASE}/api/calendar-events`;

async function handle(res, fallback) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data && data.error) || fallback);
  return data;
}

/**
 * Browser URL for the .ics export of the caller's visible events in [start, end].
 * A plain GET the browser downloads (Content-Disposition), so a link carries the
 * session cookie without going through fetch.
 */
export function calendarIcsExportUrl(start, end) {
  const params = new URLSearchParams({ start, end });
  return `${BASE}/export.ics?${params}`;
}

/** Manually created calendar events the caller may see, in [start, end]. */
export async function getCalendarManualEvents(start, end) {
  const params = new URLSearchParams({ start, end });
  return handle(
    await fetch(`${BASE}?${params}`, { credentials: "include" }),
    "Failed to load events",
  );
}

export async function createCalendarEvent(payload) {
  return handle(
    await fetch(BASE, {
      credentials: "include",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
    "Failed to create the event",
  );
}

export async function updateCalendarEvent(id, payload) {
  return handle(
    await fetch(`${BASE}/${id}`, {
      credentials: "include",
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
    "Failed to update the event",
  );
}

export async function deleteCalendarEvent(id) {
  return handle(
    await fetch(`${BASE}/${id}`, { credentials: "include", method: "DELETE" }),
    "Failed to delete the event",
  );
}
