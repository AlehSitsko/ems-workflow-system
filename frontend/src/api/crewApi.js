const API_BASE_URL = "http://127.0.0.1:5050";

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

  const response = await fetch(url);
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
    headers: {
      "Content-Type": "application/json",
    },
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
    headers: {
      "Content-Type": "application/json",
    },
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
    headers: { "Content-Type": "application/json" },
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
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to delete crew unit");
  }

  return data;
}