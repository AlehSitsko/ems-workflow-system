import API_BASE from "./config.js";
const API_BASE_URL = API_BASE;

// Fetch vehicles. Pass activeOnly = true to filter to active vehicles only.
export async function getVehicles(activeOnly = false) {
  const url = activeOnly
    ? `${API_BASE_URL}/api/vehicles?active=1`
    : `${API_BASE_URL}/api/vehicles`;

  const response = await fetch(url);
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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(vehicleData),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to create vehicle");
  }

  return data;
}

// Update an existing vehicle.
export async function updateVehicle(vehicleId, vehicleData) {
  const response = await fetch(`${API_BASE_URL}/api/vehicles/${vehicleId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(vehicleData),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to update vehicle");
  }

  return data;
}

// Toggle a vehicle's active status.
export async function toggleVehicleActive(vehicleId) {
  const response = await fetch(`${API_BASE_URL}/api/vehicles/${vehicleId}/toggle-active`, {
    method: "PATCH",
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
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to delete vehicle");
  }

  return data;
}
