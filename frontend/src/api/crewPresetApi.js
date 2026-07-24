import API_BASE from "./config.js";
const API_BASE_URL = API_BASE;

// Fetch all crew presets.
export async function getCrewPresets() {
  const response = await fetch(`${API_BASE_URL}/api/crew-presets`, { credentials: "include" });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to fetch crew presets");
  }

  return data;
}

// Create a new crew preset.
export async function createCrewPreset(presetData) {
  const response = await fetch(`${API_BASE_URL}/api/crew-presets`, {
    credentials: "include",
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

