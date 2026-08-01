import API_BASE from "./config.js";

// Platform super-admin console — cross-org management. These only work when the
// signed-in user is a platform admin on the platform host (the backend enforces
// both); the UI simply hides the console otherwise.
const BASE = `${API_BASE}/api/platform`;

async function handle(res, fallback) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data && data.error) || fallback);
  return data;
}

export async function listOrgs() {
  return handle(await fetch(`${BASE}/orgs`, { credentials: "include" }), "Failed to load organisations");
}

export async function createOrg(payload) {
  return handle(
    await fetch(`${BASE}/orgs`, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
    "Failed to create the organisation",
  );
}

export async function updateOrg(id, payload) {
  return handle(
    await fetch(`${BASE}/orgs/${id}`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
    "Failed to update the organisation",
  );
}

export async function resetOrgAdmin(id, username, newPassword) {
  return handle(
    await fetch(`${BASE}/orgs/${id}/reset-admin`, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, newPassword }),
    }),
    "Failed to reset the admin password",
  );
}
