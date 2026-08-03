import API_BASE from "./config.js";

// Unlike most API modules, Tasks needs caller identity on every request —
// the backend scopes list/detail results per role (dispatcher sees only
// their own tasks, hr sees only HR-typed tasks), not just a binary route gate.
// Identity travels in the session cookie, sent by `credentials: "include"`.
// The caller no longer asserts a role — the server would ignore it.
function authHeaders() {
  return {};
}

function jsonHeaders(currentUser) {
  return { ...authHeaders(currentUser), "Content-Type": "application/json" };
}

function buildQuery(params) {
  const query = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, value);
    }
  });
  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

export async function getTasks(filters, currentUser) {
  const res = await fetch(`${API_BASE}/api/tasks${buildQuery(filters)}`, {
    credentials: "include",
    headers: authHeaders(currentUser),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to load tasks");
  return data;
}

export async function getTaskSummary(currentUser) {
  const res = await fetch(`${API_BASE}/api/tasks/summary`, {
    credentials: "include",
    headers: authHeaders(currentUser),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to load task summary");
  return data;
}

export async function createTask(taskData, currentUser) {
  const res = await fetch(`${API_BASE}/api/tasks`, {
    credentials: "include",
    method: "POST",
    headers: jsonHeaders(currentUser),
    body: JSON.stringify(taskData),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to create task");
  return data;
}

// One task by id — used by the /tasks/:taskId deep link so a shared or bookmarked
// link opens that task even when it isn't in the current filtered list.
export async function getTask(taskId, currentUser) {
  const res = await fetch(`${API_BASE}/api/tasks/${taskId}`, {
    credentials: "include",
    headers: jsonHeaders(currentUser),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to load task");
  return data;
}

export async function updateTask(taskId, taskData, currentUser) {
  const res = await fetch(`${API_BASE}/api/tasks/${taskId}`, {
    credentials: "include",
    method: "PUT",
    headers: jsonHeaders(currentUser),
    body: JSON.stringify(taskData),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to update task");
  return data;
}

export async function updateTaskStatus(taskId, status, currentUser) {
  const res = await fetch(`${API_BASE}/api/tasks/${taskId}/status`, {
    credentials: "include",
    method: "PATCH",
    headers: jsonHeaders(currentUser),
    body: JSON.stringify({ status }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to update status");
  return data;
}

export async function assignTask(taskId, assignedToEmployeeId, currentUser) {
  const res = await fetch(`${API_BASE}/api/tasks/${taskId}/assign`, {
    credentials: "include",
    method: "PATCH",
    headers: jsonHeaders(currentUser),
    body: JSON.stringify({ assigned_to_employee_id: assignedToEmployeeId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to assign task");
  return data;
}

export async function archiveTask(taskId, currentUser) {
  const res = await fetch(`${API_BASE}/api/tasks/${taskId}`, {
    credentials: "include",
    method: "DELETE",
    headers: authHeaders(currentUser),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to archive task");
  return data;
}

export async function getTaskComments(taskId, currentUser) {
  const res = await fetch(`${API_BASE}/api/tasks/${taskId}/comments`, {
    credentials: "include",
    headers: authHeaders(currentUser),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to load comments");
  return data;
}

export async function createTaskComment(taskId, commentText, currentUser) {
  const res = await fetch(`${API_BASE}/api/tasks/${taskId}/comments`, {
    credentials: "include",
    method: "POST",
    headers: jsonHeaders(currentUser),
    body: JSON.stringify({ comment_text: commentText }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to add comment");
  return data;
}

export async function getTaskActivity(taskId, currentUser) {
  const res = await fetch(`${API_BASE}/api/tasks/${taskId}/activity`, {
    credentials: "include",
    headers: authHeaders(currentUser),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to load activity");
  return data;
}
