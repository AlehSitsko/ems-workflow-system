import API_BASE from "./config.js";

// The backend fails closed on these routes: anonymous gets 401, a forbidden role
// gets 403. Every request must therefore carry caller identity. Read it from the
// stored session rather than threading currentUser through every call site.
// Identity travels in the session cookie (see api/authApi.js), which every
// request sends via `credentials: "include"`. Nothing about the caller is
// asserted here — the server would ignore it if it were.
function authHeaders() {
  return {};
}

function jsonHeaders() {
  return { ...authHeaders(), "Content-Type": "application/json" };
}

const BASE = `${API_BASE}/api/dispatch`;

// The backend enforces the Planning/Live/History date rules and answers with a
// specific reason (e.g. "Cross-date assignment is not allowed…", "…is a past
// (history) date"). Surface that message instead of a generic failure string —
// the operator needs to know *why* the board refused the action.
async function readJsonOrThrow(res, fallback) {
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    throw new Error((data && data.error) || fallback);
  }
  return data;
}

export async function fetchBoard(date) {
  const res = await fetch(`${BASE}/board?date=${date}`, {
    credentials: "include", headers: authHeaders() });
  return readJsonOrThrow(res, "Failed to load dispatch board");
}

export async function assignCall(callId, unitId, assignedBy = "", expectedAssignmentId = undefined) {
  // expected_assignment_id is the active assignment the caller saw for this call
  // (null when it looked unassigned). The backend refuses with 409 if it no longer
  // matches — so a stale second dispatcher can't silently overwrite the first.
  const body = { call_id: callId, unit_id: unitId, assigned_by: assignedBy };
  if (expectedAssignmentId !== undefined) body.expected_assignment_id = expectedAssignmentId;
  const res = await fetch(`${BASE}/assign`, {
    credentials: "include",
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(body),
  });
  return readJsonOrThrow(res, "Failed to assign call");
}

export async function unassignCall(assignmentId) {
  const res = await fetch(`${BASE}/assign/${assignmentId}`, {
    credentials: "include", method: "DELETE", headers: authHeaders() });
  return readJsonOrThrow(res, "Failed to unassign call");
}

export async function completeAssignment(assignmentId) {
  const res = await fetch(`${BASE}/assign/${assignmentId}/complete`, {
    credentials: "include", method: "PATCH", headers: authHeaders() });
  return readJsonOrThrow(res, "Failed to complete assignment");
}

export async function reopenAssignment(assignmentId) {
  const res = await fetch(`${BASE}/assign/${assignmentId}/reopen`, {
    credentials: "include", method: "PATCH", headers: authHeaders() });
  return readJsonOrThrow(res, "Failed to reopen assignment");
}

export async function updateUnitStatus(unitId, status) {
  const res = await fetch(`${BASE}/units/${unitId}/status`, {
    credentials: "include",
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify({ status }),
  });
  return readJsonOrThrow(res, "Failed to update unit status");
}

export async function updateCallOrder(unitId, callIds) {
  const res = await fetch(`${BASE}/units/${unitId}/call-order`, {
    credentials: "include",
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify({ callIds }),
  });
  return readJsonOrThrow(res, "Failed to update call order");
}
