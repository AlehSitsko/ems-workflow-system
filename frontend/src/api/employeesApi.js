import API_BASE from "./config.js";
const API_BASE_URL = API_BASE;

// Fetch all employees from the backend.
export async function getEmployees() {
  const response = await fetch(`${API_BASE_URL}/api/employees`);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to fetch employees");
  }

  return data;
}

// Create a new employee record.
export async function createEmployee(employeeData) {
  const response = await fetch(`${API_BASE_URL}/api/employees`, {
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
    method: "DELETE",
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to delete employee");
  }

  return data;
}