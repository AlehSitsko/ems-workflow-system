import API_BASE from "./config.js";
import { getCurrentUser } from "./authApi";

const API_BASE_URL = API_BASE;

// Fleet is role-scoped on the backend (admin/supervisor manage, dispatcher
// read-only, HR no access), so every request must carry caller identity.
// Read from the stored session here rather than threading currentUser through
// every call site.
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

// Fetch a single vehicle (backs the Vehicle Workspace deep link).
export async function getVehicle(vehicleId) {
  const response = await fetch(`${API_BASE_URL}/api/vehicles/${vehicleId}`, {
    headers: authHeaders(),
  });
  const data = await response.json();

  if (!response.ok) {
    const error = new Error(data.error || "Failed to fetch vehicle");
    error.status = response.status;
    throw error;
  }

  return data;
}

// Fetch vehicles. Pass activeOnly = true to filter to active vehicles only.
export async function getVehicles(activeOnly = false) {
  const url = activeOnly
    ? `${API_BASE_URL}/api/vehicles?active=1`
    : `${API_BASE_URL}/api/vehicles`;

  const response = await fetch(url, { headers: authHeaders() });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to fetch vehicles");
  }

  return data;
}

// Create a new vehicle.
export async function createVehicle(vehicleData) {
  const response = await fetch(`${API_BASE_URL}/api/vehicles`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(vehicleData),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to create vehicle");
  }

  return data;
}


// Toggle a vehicle's active status.
export async function toggleVehicleActive(vehicleId) {
  const response = await fetch(`${API_BASE_URL}/api/vehicles/${vehicleId}/toggle-active`, {
    method: "PATCH",
    headers: authHeaders(),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to update vehicle status");
  }

  return data;
}

// Delete a vehicle.
export async function deleteVehicle(vehicleId) {
  const response = await fetch(`${API_BASE_URL}/api/vehicles/${vehicleId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to delete vehicle");
  }

  return data;
}
