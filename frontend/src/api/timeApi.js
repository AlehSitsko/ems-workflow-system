import API_BASE from "./config.js";

export async function getTimeEntries(employeeId, { dateFrom, dateTo } = {}) {
  const params = new URLSearchParams();
  if (dateFrom) params.set("date_from", dateFrom);
  if (dateTo) params.set("date_to", dateTo);
  const res = await fetch(`${API_BASE}/api/employees/${employeeId}/time-entries?${params}`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load time entries");
  return res.json();
}

export async function createTimeEntry(employeeId, data) {
  const res = await fetch(`${API_BASE}/api/employees/${employeeId}/time-entries`, {
    credentials: "include",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create time entry");
  return res.json();
}

export async function updateTimeEntry(entryId, data) {
  const res = await fetch(`${API_BASE}/api/time-entries/${entryId}`, {
    credentials: "include",
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update time entry");
  return res.json();
}

export async function deleteTimeEntry(entryId) {
  const res = await fetch(`${API_BASE}/api/time-entries/${entryId}`, {
    credentials: "include", method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete time entry");
  return res.json();
}

export async function getPayConfig(employeeId) {
  const res = await fetch(`${API_BASE}/api/employees/${employeeId}/pay-config`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load pay config");
  return res.json();
}

export async function savePayConfig(employeeId, data) {
  const res = await fetch(`${API_BASE}/api/employees/${employeeId}/pay-config`, {
    credentials: "include",
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to save pay config");
  return res.json();
}

// Kiosk
export async function kioskEmployees() {
  // Always resolve to an array: an error response (e.g. a 500) returns a JSON
  // object, and callers render this with .map/.find — a non-array would crash the
  // whole page. Degrade to an empty list instead.
  const res = await fetch(`${API_BASE}/api/kiosk/employees`, { credentials: "include" });
  const data = await res.json().catch(() => []);
  return res.ok && Array.isArray(data) ? data : [];
}

export async function kioskStatus(employeeId) {
  const res = await fetch(`${API_BASE}/api/kiosk/status/${employeeId}`, { credentials: "include" });
  return res.json();
}

export async function kioskVerifyPin(employeeId, pin) {
  const res = await fetch(`${API_BASE}/api/kiosk/verify-pin`, {
    credentials: "include",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employee_id: employeeId, pin }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Invalid PIN");
  }
  return res.json();
}

export async function kioskClockIn(employeeId, pin = null) {
  const res = await fetch(`${API_BASE}/api/kiosk/clock-in`, {
    credentials: "include",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employee_id: employeeId, pin }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Clock in failed");
  }
  return res.json();
}

export async function kioskClockOut(employeeId, pin = null) {
  const res = await fetch(`${API_BASE}/api/kiosk/clock-out`, {
    credentials: "include",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employee_id: employeeId, pin }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Clock out failed");
  }
  return res.json();
}
