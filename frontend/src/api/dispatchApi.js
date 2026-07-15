import API_BASE from "./config.js";
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
  const res = await fetch(`${BASE}/board?date=${date}`);
  return readJsonOrThrow(res, "Failed to load dispatch board");
}

export async function assignCall(callId, unitId, assignedBy = "") {
  const res = await fetch(`${BASE}/assign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ call_id: callId, unit_id: unitId, assigned_by: assignedBy }),
  });
  return readJsonOrThrow(res, "Failed to assign call");
}

export async function unassignCall(assignmentId) {
  const res = await fetch(`${BASE}/assign/${assignmentId}`, { method: "DELETE" });
  return readJsonOrThrow(res, "Failed to unassign call");
}

export async function completeAssignment(assignmentId) {
  const res = await fetch(`${BASE}/assign/${assignmentId}/complete`, { method: "PATCH" });
  return readJsonOrThrow(res, "Failed to complete assignment");
}

export async function reopenAssignment(assignmentId) {
  const res = await fetch(`${BASE}/assign/${assignmentId}/reopen`, { method: "PATCH" });
  return readJsonOrThrow(res, "Failed to reopen assignment");
}

export async function updateUnitStatus(unitId, status) {
  const res = await fetch(`${BASE}/units/${unitId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  return readJsonOrThrow(res, "Failed to update unit status");
}

export async function updateCallOrder(unitId, callIds) {
  const res = await fetch(`${BASE}/units/${unitId}/call-order`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callIds }),
  });
  return readJsonOrThrow(res, "Failed to update call order");
}
