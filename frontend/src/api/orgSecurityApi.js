import API_BASE from "./config.js";

const BASE = `${API_BASE}/api/org`;

async function readOrThrow(res, fallback) {
  let data;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) throw new Error((data && data.error) || fallback);
  return data;
}

export async function getOrgSecurity() {
  const res = await fetch(`${BASE}/security`, { credentials: "include" });
  return readOrThrow(res, "Failed to load organisation security");
}

export async function generateRecoveryCodes() {
  const res = await fetch(`${BASE}/recovery-codes`, { method: "POST", credentials: "include" });
  return readOrThrow(res, "Failed to generate recovery codes");
}

export async function grantOwnership(userId) {
  const res = await fetch(`${BASE}/owners`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  return readOrThrow(res, "Failed to grant ownership");
}

// Public — the recovery-code holder has no session yet.
export async function redeemRecovery({ code, username, newPassword }) {
  const res = await fetch(`${BASE}/recovery/redeem`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, username, newPassword }),
  });
  return readOrThrow(res, "Recovery failed");
}
