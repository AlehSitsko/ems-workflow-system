import API_BASE from "./config.js";

// The calendar aggregates operational data the caller is allowed to see, so the
// backend scopes results per role — every request carries caller identity (same
// header pattern as tasksApi). The frontend never hides data it was sent.
function authHeaders(currentUser) {
  return {
    "X-User-Role": currentUser?.role || "",
    "X-User-Id": String(currentUser?.id || ""),
    "X-User-Name": currentUser?.display_name || "",
  };
}

// Fetch unified calendar events + per-day operational summaries for an inclusive
// [start, end] date range (YYYY-MM-DD). Returns { start, end, events, days }.
export async function getCalendarEvents(start, end, currentUser) {
  const res = await fetch(
    `${API_BASE}/api/calendar/events?start=${start}&end=${end}`,
    { headers: authHeaders(currentUser) },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to load calendar events");
  return data;
}
