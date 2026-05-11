const API_BASE_URL = "http://127.0.0.1:5050";

// Fetch all crew presets.
export async function getCrewPresets() {
  const response = await fetch(`${API_BASE_URL}/api/crew-presets`);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to fetch crew presets");
  }

  return data;
}

// Create a new crew preset.
export async function createCrewPreset(presetData) {
  const response = await fetch(`${API_BASE_URL}/api/crew-presets`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(presetData),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to create crew preset");
  }

  return data;
}

// Update an existing crew preset.
export async function updateCrewPreset(presetId, presetData) {
  const response = await fetch(
    `${API_BASE_URL}/api/crew-presets/${presetId}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(presetData),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to update crew preset");
  }

  return data;
}

// Delete an existing crew preset.
export async function deleteCrewPreset(presetId) {
  const response = await fetch(`${API_BASE_URL}/api/crew-presets/${presetId}`, {
    method: "DELETE",
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to delete crew preset");
  }

  return data;
}