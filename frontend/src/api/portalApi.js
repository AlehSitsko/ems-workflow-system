import API_BASE from "./config.js";

const BASE = `${API_BASE}/api/portal`;

// Employee self-service. Every call is about the signed-in employee's own record;
// the server resolves "me" from the session, so none of these takes an id.

async function handle(res, fallback) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data && data.error) || fallback);
  return data;
}

export async function getMyProfile() {
  return handle(await fetch(`${BASE}/me`, { credentials: "include" }), "Failed to load your profile");
}

export async function getMySchedule() {
  return handle(await fetch(`${BASE}/me/schedule`, { credentials: "include" }), "Failed to load your schedule");
}

export async function getMyTasks() {
  return handle(await fetch(`${BASE}/me/tasks`, { credentials: "include" }), "Failed to load your tasks");
}

export async function updateMyTask(taskId, status) {
  const res = await fetch(`${BASE}/me/tasks/${taskId}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  return handle(res, "Failed to update the task");
}

export async function getMyLeave() {
  return handle(await fetch(`${BASE}/me/leave`, { credentials: "include" }), "Failed to load your leave");
}

export async function requestLeave(payload) {
  const res = await fetch(`${BASE}/me/leave`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handle(res, "Failed to submit your request");
}

// ── Clock in / out ───────────────────────────────────────────────────────────

export async function getMyClock() {
  return handle(await fetch(`${BASE}/me/clock`, { credentials: "include" }), "Failed to load your clock status");
}

export async function clockIn() {
  return handle(await fetch(`${BASE}/me/clock/in`, { method: "POST", credentials: "include" }), "Failed to clock in");
}

export async function clockOut() {
  return handle(await fetch(`${BASE}/me/clock/out`, { method: "POST", credentials: "include" }), "Failed to clock out");
}

// ── Hours ────────────────────────────────────────────────────────────────────

export async function getMyHours() {
  return handle(await fetch(`${BASE}/me/hours`, { credentials: "include" }), "Failed to load your hours");
}

// ── Documents ────────────────────────────────────────────────────────────────

export async function getMyDocuments() {
  return handle(await fetch(`${BASE}/me/documents`, { credentials: "include" }), "Failed to load your documents");
}

/** Browser URL for downloading one of my own document files (a plain GET). */
export function myDocumentFileUrl(docId) {
  return `${BASE}/me/documents/${docId}/file`;
}
