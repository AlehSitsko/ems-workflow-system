import API_BASE from "./config.js";
import { getCurrentUser } from "./authApi";

const API_BASE_URL = API_BASE;

// Standing transport orders. The template materialises real calls a few weeks
// ahead; the backend decides what may be rewritten, this only carries the answer.

function authHeaders() {
  const user = getCurrentUser();
  return {
    "X-User-Role": user?.role || "",
    "X-User-Id": String(user?.id || ""),
    "X-User-Name": user?.display_name || "",
  };
}

function jsonHeaders() {
  return { ...authHeaders(), "Content-Type": "application/json" };
}

async function handle(response, fallback) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || fallback);
    error.status = response.status;
    throw error;
  }
  return data;
}

export async function getRecurringTrips({ patientId, activeOnly } = {}) {
  const params = new URLSearchParams();
  if (patientId) params.set("patient_id", patientId);
  if (activeOnly) params.set("active", "1");
  const query = params.toString();
  return handle(
    await fetch(`${API_BASE_URL}/api/recurring-trips${query ? `?${query}` : ""}`,
      { headers: authHeaders() }),
    "Failed to load recurring trips");
}

export async function getRecurringTrip(id) {
  return handle(await fetch(`${API_BASE_URL}/api/recurring-trips/${id}`, { headers: authHeaders() }),
    "Failed to load the standing order");
}

export async function createRecurringTrip(payload) {
  return handle(await fetch(`${API_BASE_URL}/api/recurring-trips`, {
    method: "POST", headers: jsonHeaders(), body: JSON.stringify(payload),
  }), "Failed to create the standing order");
}

/** `applyToTouched` re-syncs trips a human already worked — never the default. */
export async function updateRecurringTrip(id, payload) {
  return handle(await fetch(`${API_BASE_URL}/api/recurring-trips/${id}`, {
    method: "PUT", headers: jsonHeaders(), body: JSON.stringify(payload),
  }), "Failed to update the standing order");
}

export async function regenerateRecurringTrip(id) {
  return handle(await fetch(`${API_BASE_URL}/api/recurring-trips/${id}/generate`, {
    method: "POST", headers: jsonHeaders(), body: JSON.stringify({}),
  }), "Failed to extend the schedule");
}

export async function stopRecurringTrip(id) {
  return handle(await fetch(`${API_BASE_URL}/api/recurring-trips/${id}`, {
    method: "DELETE", headers: authHeaders(),
  }), "Failed to stop the standing order");
}
