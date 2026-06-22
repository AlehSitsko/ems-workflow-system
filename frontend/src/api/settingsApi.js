import API_BASE from "./config.js";

const BASE = `${API_BASE}/api/settings`;

export async function getSettings(userId) {
  const res = await fetch(BASE, {
    headers: { "X-User-Id": String(userId) },
  });
  if (!res.ok) throw new Error("Failed to load settings");
  return res.json();
}

export async function patchSettings(userId, patch) {
  const res = await fetch(BASE, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-User-Id": String(userId),
    },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error("Failed to save settings");
  return res.json();
}
