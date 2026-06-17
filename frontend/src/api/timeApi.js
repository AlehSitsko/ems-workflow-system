const API_BASE = "http://127.0.0.1:5050";

export async function getTimeEntries(employeeId, { dateFrom, dateTo } = {}) {
  const params = new URLSearchParams();
  if (dateFrom) params.set("date_from", dateFrom);
  if (dateTo) params.set("date_to", dateTo);
  const res = await fetch(`${API_BASE}/api/employees/${employeeId}/time-entries?${params}`);
  if (!res.ok) throw new Error("Failed to load time entries");
  return res.json();
}

export async function createTimeEntry(employeeId, data) {
  const res = await fetch(`${API_BASE}/api/employees/${employeeId}/time-entries`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create time entry");
  return res.json();
}

export async function updateTimeEntry(entryId, data) {
  const res = await fetch(`${API_BASE}/api/time-entries/${entryId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update time entry");
  return res.json();
}

export async function deleteTimeEntry(entryId) {
  const res = await fetch(`${API_BASE}/api/time-entries/${entryId}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete time entry");
  return res.json();
}

export async function getPayConfig(employeeId) {
  const res = await fetch(`${API_BASE}/api/employees/${employeeId}/pay-config`);
  if (!res.ok) throw new Error("Failed to load pay config");
  return res.json();
}

export async function savePayConfig(employeeId, data) {
  const res = await fetch(`${API_BASE}/api/employees/${employeeId}/pay-config`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to save pay config");
  return res.json();
}

// Kiosk
export async function kioskEmployees() {
  const res = await fetch(`${API_BASE}/api/kiosk/employees`);
  return res.json();
}

export async function kioskStatus(employeeId) {
  const res = await fetch(`${API_BASE}/api/kiosk/status/${employeeId}`);
  return res.json();
}

export async function kioskClockIn(employeeId) {
  const res = await fetch(`${API_BASE}/api/kiosk/clock-in`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employee_id: employeeId }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Clock in failed");
  }
  return res.json();
}

export async function kioskClockOut(employeeId) {
  const res = await fetch(`${API_BASE}/api/kiosk/clock-out`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employee_id: employeeId }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Clock out failed");
  }
  return res.json();
}
