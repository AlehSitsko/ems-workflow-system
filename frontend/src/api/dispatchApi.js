import API_BASE from "./config.js";
const BASE = `${API_BASE}/api/dispatch`;

export async function fetchBoard(date) {
  const res = await fetch(`${BASE}/board?date=${date}`);
  if (!res.ok) throw new Error("Failed to load dispatch board");
  return res.json();
}

export async function assignCall(callId, unitId, assignedBy = "") {
  const res = await fetch(`${BASE}/assign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ call_id: callId, unit_id: unitId, assigned_by: assignedBy }),
  });
  if (!res.ok) throw new Error("Failed to assign call");
  return res.json();
}

export async function unassignCall(assignmentId) {
  const res = await fetch(`${BASE}/assign/${assignmentId}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to unassign call");
  return res.json();
}

export async function completeAssignment(assignmentId) {
  const res = await fetch(`${BASE}/assign/${assignmentId}/complete`, { method: "PATCH" });
  if (!res.ok) throw new Error("Failed to complete assignment");
  return res.json();
}

export async function reopenAssignment(assignmentId) {
  const res = await fetch(`${BASE}/assign/${assignmentId}/reopen`, { method: "PATCH" });
  if (!res.ok) throw new Error("Failed to reopen assignment");
  return res.json();
}

export async function updateUnitStatus(unitId, status) {
  const res = await fetch(`${BASE}/units/${unitId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error("Failed to update unit status");
  return res.json();
}

export async function updateCallOrder(unitId, callIds) {
  const res = await fetch(`${BASE}/units/${unitId}/call-order`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callIds }),
  });
  if (!res.ok) throw new Error("Failed to update call order");
  return res.json();
}
