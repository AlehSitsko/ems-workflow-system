import API_BASE from "./config.js";

const API_BASE_URL = API_BASE;

// Closing the operational day. The backend owns what counts as a loose end and
// whether a day may be closed — this only carries the answer.

async function handle(response, fallback) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || fallback);
    error.status = response.status;
    // A day with unresolved items comes back 409 with the list attached.
    error.looseEnds = data.looseEnds;
    error.requiresAcknowledgement = data.requiresAcknowledgement;
    throw error;
  }
  return data;
}

/** The day's closing report: totals, loose ends, and the sign-off if it exists. */
export async function getOperationalDay(day, headers = {}) {
  const response = await fetch(`${API_BASE_URL}/api/operations/days/${day}`, {
    credentials: "include", headers });
  return handle(response, "Failed to load the operational day");
}

/** Closed days, newest first. */
export async function getClosedDays({ start, end } = {}, headers = {}) {
  const params = new URLSearchParams();
  if (start) params.set("start", start);
  if (end) params.set("end", end);
  const query = params.toString();
  const response = await fetch(
    `${API_BASE_URL}/api/operations/days${query ? `?${query}` : ""}`, {
    credentials: "include", headers });
  return handle(response, "Failed to load closed days");
}

export async function closeOperationalDay(day, body, headers = {}) {
  const response = await fetch(`${API_BASE_URL}/api/operations/days/${day}/close`, {
    credentials: "include",
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return handle(response, "Failed to close the day");
}

export async function reopenOperationalDay(day, headers = {}) {
  const response = await fetch(`${API_BASE_URL}/api/operations/days/${day}/close`, {
    credentials: "include",
    method: "DELETE",
    headers,
  });
  return handle(response, "Failed to reopen the day");
}

/**
 * Counts of work waiting in queues that appear on no board.
 *
 * Scoped server-side to the roles that can act on each queue, so a badge never
 * nags someone about a page they cannot open.
 */
export async function getAttentionCounts(headers = {}) {
  const response = await fetch(`${API_BASE_URL}/api/operations/attention`, {
    credentials: "include", headers });
  return handle(response, "Failed to load attention counts");
}
