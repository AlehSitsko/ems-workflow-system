import API_BASE from "./config.js";
import { getCurrentUser } from "./authApi";

// Employee leave / absence. The backend decides how much of each record the
// caller may see — HR and admin get the full record, scheduling roles get who is
// away and when. Nothing here re-implements that rule; it only renders what
// arrives.

const API_BASE_URL = API_BASE;

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
    // The API names the clashing request on a 409 so the form can point at it.
    error.conflictingRequestId = data.conflictingRequestId;
    throw error;
  }
  return data;
}

/** Leave requests, optionally filtered by employee, status or overlapping range. */
export async function getLeaveRequests({ employeeId, status, start, end } = {}) {
  const params = new URLSearchParams();
  if (employeeId) params.set("employee_id", employeeId);
  if (status) params.set("status", status);
  if (start) params.set("start", start);
  if (end) params.set("end", end);

  const query = params.toString();
  const response = await fetch(
    `${API_BASE_URL}/api/leave-requests${query ? `?${query}` : ""}`,
    { headers: authHeaders() },
  );
  return handle(response, "Failed to load leave requests");
}

/** Employees away on a given day — used by the shift forms to warn early. */
export async function getUnavailableOn(dateIso) {
  const response = await fetch(
    `${API_BASE_URL}/api/leave-requests/unavailable?date=${encodeURIComponent(dateIso)}`,
    { headers: authHeaders() },
  );
  return handle(response, "Failed to load availability");
}

export async function createLeaveRequest(payload) {
  const response = await fetch(`${API_BASE_URL}/api/leave-requests`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  return handle(response, "Failed to create leave request");
}

export async function updateLeaveRequest(id, payload) {
  const response = await fetch(`${API_BASE_URL}/api/leave-requests/${id}`, {
    method: "PUT",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  return handle(response, "Failed to update leave request");
}

/** Approve or deny. Separate from editing because it has staffing consequences. */
export async function decideLeaveRequest(id, status, reviewNote = "") {
  const response = await fetch(`${API_BASE_URL}/api/leave-requests/${id}/decision`, {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify({ status, reviewNote }),
  });
  return handle(response, "Failed to record the decision");
}

export async function cancelLeaveRequest(id) {
  const response = await fetch(`${API_BASE_URL}/api/leave-requests/${id}/cancel`, {
    method: "PATCH",
    headers: jsonHeaders(),
  });
  return handle(response, "Failed to cancel leave request");
}
