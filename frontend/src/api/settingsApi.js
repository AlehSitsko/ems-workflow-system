import API_BASE from "./config.js";

const BASE = `${API_BASE}/api/settings`;

// The session identifies whose settings these are — passing a user id would
// only invite one user to read another's.
export async function getSettings() {
  const res = await fetch(BASE, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to load settings");
  return res.json();
}

export async function patchSettings(patch) {
  const res = await fetch(BASE, {
    credentials: "include",
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error("Failed to save settings");
  return res.json();
}
