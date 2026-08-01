import API_BASE from "./config.js";

const BASE = `${API_BASE}/api/tenant`;

async function handle(res, fallback) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data && data.error) || fallback);
  return data;
}

// The workspace for the current host, or null when the host is not an org
// subdomain (bare localhost / apex / platform). Public — used by the login screen.
export async function getCurrentTenant() {
  const res = await fetch(`${BASE}/current`, { credentials: "include" });
  if (res.status === 404) return null;
  return handle(res, "Failed to load workspace");
}

// The signed-in admin's own organisation (name, slug, light branding settings).
export async function getMyOrg() {
  return handle(await fetch(`${BASE}/org`, { credentials: "include" }), "Failed to load organisation");
}

export async function updateMyOrg(payload) {
  return handle(
    await fetch(`${BASE}/org`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
    "Failed to update the organisation",
  );
}
