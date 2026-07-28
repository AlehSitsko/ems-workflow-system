import API_BASE from "./config.js";
const API_BASE_URL = API_BASE;

// Fetch all employees from the backend.
export async function getEmployees() {
  const response = await fetch(`${API_BASE_URL}/api/employees`, { credentials: "include" });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to fetch employees");
  }

  return data;
}

// A single employee by id — backs the Employee Workspace.
export async function getEmployee(employeeId) {
  const response = await fetch(`${API_BASE_URL}/api/employees/${employeeId}`, { credentials: "include" });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const err = new Error(data.error || "Failed to fetch employee");
    err.status = response.status;
    throw err;
  }

  return data;
}

// Shifts this employee has been rostered on (newest first), with the role held.
export async function getEmployeeShifts(employeeId, limit = 50) {
  const response = await fetch(`${API_BASE_URL}/api/employees/${employeeId}/shifts?limit=${limit}`, { credentials: "include" });
  const data = await response.json().catch(() => ([]));

  if (!response.ok) {
    throw new Error((data && data.error) || "Failed to fetch employee shifts");
  }

  return Array.isArray(data) ? data : [];
}

// Create a new employee record.
export async function createEmployee(employeeData) {
  const response = await fetch(`${API_BASE_URL}/api/employees`, {
    credentials: "include",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(employeeData),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to create employee");
  }

  return data;
}

// Update an existing employee record.
export async function updateEmployee(employeeId, employeeData) {
  const response = await fetch(`${API_BASE_URL}/api/employees/${employeeId}`, {
    credentials: "include",
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(employeeData),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to update employee");
  }

  return data;
}

// Delete an employee record.
export async function deleteEmployee(employeeId) {
  const response = await fetch(`${API_BASE_URL}/api/employees/${employeeId}`, {
    credentials: "include",
    method: "DELETE",
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to delete employee");
  }

  return data;
}

// ── Employment history ───────────────────────────────────────────────────────

// An employee's employment timeline (newest effective date first).
export async function getEmploymentEvents(employeeId) {
  const response = await fetch(`${API_BASE_URL}/api/employees/${employeeId}/employment`, {
    credentials: "include",
  });
  const data = await response.json().catch(() => ([]));
  if (!response.ok) {
    throw new Error((data && data.error) || "Failed to fetch employment history");
  }
  return Array.isArray(data) ? data : [];
}

// Add an employment event (hire, position/status change, termination, note).
export async function createEmploymentEvent(employeeId, payload) {
  const response = await fetch(`${API_BASE_URL}/api/employees/${employeeId}/employment`, {
    credentials: "include",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Failed to add employment event");
  }
  return data;
}

// Remove a mistaken employment event (the history is append-only, so a
// correction is a delete rather than an edit).
export async function deleteEmploymentEvent(eventId) {
  const response = await fetch(`${API_BASE_URL}/api/employees/employment/${eventId}`, {
    credentials: "include",
    method: "DELETE",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Failed to delete employment event");
  }
  return data;
}