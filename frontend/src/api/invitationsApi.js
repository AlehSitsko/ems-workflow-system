import API_BASE from "./config.js";

// Mutations carry the CSRF header automatically via the global fetch interceptor
// (see api/csrf.js); the session cookie travels with credentials: "include".
const BASE = `${API_BASE}/api/invitations`;

async function readOrThrow(res, fallback) {
  let data;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) throw new Error((data && data.error) || fallback);
  return data;
}

// ── Admin ────────────────────────────────────────────────────────────────────
export async function listInvitations() {
  const res = await fetch(BASE, { credentials: "include" });
  return readOrThrow(res, "Failed to load invitations");
}

export async function createInvitation({ email, role, displayName }) {
  const res = await fetch(BASE, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, role, display_name: displayName }),
  });
  return readOrThrow(res, "Failed to create invitation");
}

export async function revokeInvitation(id) {
  const res = await fetch(`${BASE}/${id}/revoke`, { method: "POST", credentials: "include" });
  return readOrThrow(res, "Failed to revoke invitation");
}

// ── Public (no session yet) ──────────────────────────────────────────────────
export async function validateInvitation(token) {
  const res = await fetch(`${BASE}/accept/${encodeURIComponent(token)}`, { credentials: "include" });
  return readOrThrow(res, "This invitation link is invalid.");
}

export async function acceptInvitation({ token, username, password, displayName }) {
  const res = await fetch(`${BASE}/accept`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, username, password, display_name: displayName }),
  });
  return readOrThrow(res, "Failed to accept invitation");
}
