import API_BASE from "./config.js";
import { getCurrentUser } from "./authApi";

// The backend fails closed on these routes: anonymous gets 401, a forbidden role
// gets 403. Every request must therefore carry caller identity. Read it from the
// stored session rather than threading currentUser through every call site.
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

const API_BASE_URL = API_BASE;

// Shift timing alerts for a day (near-end / overdue shifts).
export async function getShiftAlerts(date) {
  const response = await fetch(
    `${API_BASE_URL}/api/crew-units/alerts?date=${date}`,
    { headers: authHeaders() },
  );
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to load shift alerts");
  }

  return data;
}

// Fetch crew units from backend.
// Optional shiftDate filters units by day.
export async function getCrewUnits(shiftDate = "") {
  const params = new URLSearchParams();

  if (shiftDate) {
    params.append("shift_date", shiftDate);
  }

  const queryString = params.toString();

  const url = queryString
    ? `${API_BASE_URL}/api/crew-units?${queryString}`
    : `${API_BASE_URL}/api/crew-units`;

  const response = await fetch(url, { headers: authHeaders() });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to fetch crew units");
  }

  return data;
}

// Create a new crew unit.
export async function createCrewUnit(unitData) {
  const response = await fetch(`${API_BASE_URL}/api/crew-units`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(unitData),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to create crew unit");
  }

  return data;
}

// Update an existing crew unit.
export async function updateCrewUnit(unitId, unitData) {
  const response = await fetch(`${API_BASE_URL}/api/crew-units/${unitId}`, {
    method: "PUT",
    headers: jsonHeaders(),
    body: JSON.stringify(unitData),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to update crew unit");
  }

  return data;
}

// Convert a day unit to night crew.
export async function makeNightCrew(unitId, payload) {
  const response = await fetch(`${API_BASE_URL}/api/crew-units/${unitId}/make-night`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Failed to create night crew");
  return data;
}

// Delete an existing crew unit.
export async function deleteCrewUnit(unitId) {
  const response = await fetch(`${API_BASE_URL}/api/crew-units/${unitId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to delete crew unit");
  }

  return data;
}