import API_BASE from "./config.js";

const API_BASE_URL = API_BASE;

// Fleet is role-scoped on the backend (admin/supervisor manage, dispatcher
// read-only, HR no access), so every request must carry caller identity.
// Read from the stored session here rather than threading currentUser through
// every call site.
// Identity travels in the session cookie (see api/authApi.js), which every
// request sends via `credentials: "include"`. Nothing about the caller is
// asserted here — the server would ignore it if it were.
function authHeaders() {
  return {};
}

function jsonHeaders() {
  return { ...authHeaders(), "Content-Type": "application/json" };
}

// Fetch a single vehicle (backs the Vehicle Workspace deep link).
export async function getVehicle(vehicleId) {
  const response = await fetch(`${API_BASE_URL}/api/vehicles/${vehicleId}`, {
    credentials: "include",
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

  const response = await fetch(url, {
    credentials: "include", headers: authHeaders() });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to fetch vehicles");
  }

  return data;
}

// Create a new vehicle.
export async function createVehicle(vehicleData) {
  const response = await fetch(`${API_BASE_URL}/api/vehicles`, {
    credentials: "include",
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
    credentials: "include",
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
    credentials: "include",
    method: "DELETE",
    headers: authHeaders(),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to delete vehicle");
  }

  return data;
}

// Update an existing vehicle (admin/supervisor — the API enforces it).
export async function updateVehicle(vehicleId, vehicleData) {
  const response = await fetch(`${API_BASE_URL}/api/vehicles/${vehicleId}`, {
    credentials: "include",
    method: "PUT",
    headers: jsonHeaders(),
    body: JSON.stringify(vehicleData),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Failed to update vehicle");
  return data;
}

// ── Odometer ────────────────────────────────────────────────────────────────

export async function getOdometerHistory(vehicleId) {
  const response = await fetch(`${API_BASE_URL}/api/vehicles/${vehicleId}/odometer`, {
    credentials: "include",
    headers: authHeaders(),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Failed to load odometer history");
  return data;
}

// `correction: true` records a reading below the current one as a deliberate
// correction; without it the API rejects a backwards reading.
export async function addOdometerReading(vehicleId, reading) {
  const response = await fetch(`${API_BASE_URL}/api/vehicles/${vehicleId}/odometer`, {
    credentials: "include",
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(reading),
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || "Failed to record reading");
    error.status = response.status;
    error.currentOdometer = data.currentOdometer;
    throw error;
  }
  return data;
}

// ── Maintenance ─────────────────────────────────────────────────────────────

export async function getMaintenanceRecords(vehicleId) {
  const response = await fetch(`${API_BASE_URL}/api/vehicles/${vehicleId}/maintenance`, {
    credentials: "include",
    headers: authHeaders(),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Failed to load maintenance records");
  return data;
}

export async function createMaintenanceRecord(vehicleId, record) {
  const response = await fetch(`${API_BASE_URL}/api/vehicles/${vehicleId}/maintenance`, {
    credentials: "include",
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(record),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Failed to create maintenance record");
  return data;
}

export async function updateMaintenanceRecord(recordId, patch) {
  const response = await fetch(`${API_BASE_URL}/api/vehicles/maintenance/${recordId}`, {
    credentials: "include",
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify(patch),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Failed to update maintenance record");
  return data;
}

// ── Shift history ───────────────────────────────────────────────────────────

// Shifts this vehicle actually worked, via the real vehicle_id link.
export async function getVehicleShifts(vehicleId, limit = 50) {
  const response = await fetch(`${API_BASE_URL}/api/vehicles/${vehicleId}/shifts?limit=${limit}`, {
    credentials: "include",
    headers: authHeaders(),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Failed to load shift history");
  return data;
}

// ── Retire / restore ────────────────────────────────────────────────────────

// Retire rather than delete: shifts, maintenance and odometer history must keep
// a valid vehicle reference.
export async function retireVehicle(vehicleId, reason) {
  const response = await fetch(`${API_BASE_URL}/api/vehicles/${vehicleId}/retire`, {
    credentials: "include",
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ reason }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Failed to retire vehicle");
  return data;
}

export async function unretireVehicle(vehicleId) {
  const response = await fetch(`${API_BASE_URL}/api/vehicles/${vehicleId}/unretire`, {
    credentials: "include",
    method: "POST",
    headers: jsonHeaders(),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Failed to restore vehicle");
  return data;
}
