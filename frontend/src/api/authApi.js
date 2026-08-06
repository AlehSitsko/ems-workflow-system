import API_BASE from "./config.js";
import { setCsrfToken } from "./csrf.js";
const API_BASE_URL = API_BASE;

// The signed-in user is cached here only so the UI can render a name and scope
// its menus without waiting for a round trip. It is **not** the identity: the
// server reads that from an HttpOnly session cookie the page cannot see. Editing
// this key buys nothing — the API ignores it entirely.
const CURRENT_USER_STORAGE_KEY = "ems_current_user";

// =========================
// AUTH FUNCTIONS
// =========================

/**
 * Every authenticated request needs this.
 *
 * `credentials: "include"` sends the session cookie cross-origin — the dev
 * frontend is on :5173 and the API on :5050, so without it the browser omits
 * the cookie and every call comes back 401.
 */
export const withCredentials = { credentials: "include" };

// Send login credentials to the backend. The response sets the session cookie.
export async function loginUser(username, password) {
  const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      username,
      password,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Login failed");
  }

  // Hold the CSRF token so the fetch interceptor can echo it on mutations —
  // the token cookie is unreadable when the API is a different origin.
  setCsrfToken(data.csrfToken);
  return data.user;
}

// Does the backend have zero users yet? (desktop first-run). Never throws — a
// failure just means "assume normal login", so the web app is unaffected.
export async function checkNeedsSetup() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/needs-setup`, { credentials: "include" });
    if (!response.ok) return false;
    const data = await response.json();
    return !!data.needsSetup;
  } catch {
    return false;
  }
}

// Create the first administrator on a fresh (desktop) install and sign them in.
// Mirrors loginUser: the response sets the session cookie and returns the user.
export async function setupFirstAdmin(username, password, displayName) {
  const response = await fetch(`${API_BASE_URL}/api/auth/setup`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, displayName }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Setup failed");
  }
  setCsrfToken(data.csrfToken);
  return data.user;
}

// Change my own password. Returns the updated user (with passwordExpired cleared)
// so the caller can drop any forced-rotation screen. Throws the server's message
// on failure (wrong current password, too weak, or unchanged).
export async function changePassword(currentPassword, newPassword) {
  const response = await fetch(`${API_BASE_URL}/api/auth/change-password`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Could not change the password");
  }
  return data.user;
}

// My active sessions (one per signed-in device), current flagged.
export async function getSessions() {
  const response = await fetch(`${API_BASE_URL}/api/auth/sessions`, { credentials: "include" });
  if (!response.ok) throw new Error("Failed to load sessions");
  return response.json();
}

// Revoke one of my sessions by id. Revoking the current one signs me out here.
export async function revokeSession(id) {
  const response = await fetch(`${API_BASE_URL}/api/auth/sessions/${id}`, {
    method: "DELETE", credentials: "include",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Failed to revoke the session");
  return data; // { current: bool }
}

// Sign out every other device, keeping this one.
export async function revokeOtherSessions() {
  const response = await fetch(`${API_BASE_URL}/api/auth/sessions/revoke-others`, {
    method: "POST", credentials: "include",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Failed to sign out other devices");
  return data; // { revoked: N }
}

/**
 * Who the session cookie belongs to, or null.
 *
 * The cookie outlives a page reload but is unreadable from JavaScript, so the
 * app asks the server on startup instead of trusting its own cached copy.
 */
export async function fetchCurrentUser() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/me`, { credentials: "include" });
    if (!response.ok) return null;
    const data = await response.json();
    setCsrfToken(data.csrfToken);
    return data.user || null;
  } catch {
    // Offline or the API is down — treated as signed out rather than crashing
    // the shell before it renders.
    return null;
  }
}

// Cache the user for rendering. See the note on CURRENT_USER_STORAGE_KEY.
export function saveCurrentUser(user) {
  localStorage.setItem(CURRENT_USER_STORAGE_KEY, JSON.stringify(user));
}

// The cached user, for a first paint before /api/auth/me answers.
export function getCurrentUser() {
  const storedUser = localStorage.getItem(CURRENT_USER_STORAGE_KEY);

  if (!storedUser) {
    return null;
  }

  try {
    return JSON.parse(storedUser);
  } catch (err) {
    console.error("Failed to parse current user:", err);
    localStorage.removeItem(CURRENT_USER_STORAGE_KEY);
    return null;
  }
}

// End the session server-side, then drop the local cache. The cookie is
// HttpOnly, so only the server can clear it.
export async function logoutUser() {
  try {
    await fetch(`${API_BASE_URL}/api/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
  } catch {
    // Even if the call fails, clear locally: the user asked to sign out.
  }
  setCsrfToken(null);
  localStorage.removeItem(CURRENT_USER_STORAGE_KEY);
}

// Drop the local session without calling the server — for when the session is
// already gone (a 401 the server gave us), so there is nothing to log out and a
// POST /logout would only 401 again.
export function clearLocalSession() {
  setCsrfToken(null);
  localStorage.removeItem(CURRENT_USER_STORAGE_KEY);
}

// =========================
// ROLE ACCESS HELPERS
// =========================

// An employee self-service login. This role reaches only the portal — every ops
// helper below returns false for it, and the backend fails closed the same way.
export function isEmployeePortalUser(user) {
  return !!user && user.role === "employee";
}

// Check whether a user has access to the dispatch board.
export function hasDispatchAccess(user) {
  if (!user) return false;
  return (
    user.role === "admin" ||
    user.role === "supervisor" ||
    user.role === "dispatcher"
  );
}

// Check whether a user can start or manage call intake.
export function hasCallIntakeAccess(user) {
  if (!user) {
    return false;
  }

  return (
    user.role === "admin" ||
    user.role === "supervisor" ||
    user.role === "dispatcher"
  );
}

// Check whether a user has access to patient and call-related features.
export function hasPatientAccess(user) {
  if (!user) {
    return false;
  }

  return (
    user.role === "admin" ||
    user.role === "supervisor" ||
    user.role === "dispatcher"
  );
}

// Check whether a user can access employee records.
export function hasEmployeeAccess(user) {
  if (!user) {
    return false;
  }

  return (
    user.role === "admin" ||
    user.role === "supervisor" ||
    user.role === "hr"
  );
}

// Leave review: HR and admin decide; a supervisor gets the read-only overview
// (they may file a request but not approve one, matching the backend).
export function hasLeaveReviewAccess(user) {
  if (!user) {
    return false;
  }

  return (
    user.role === "admin" ||
    user.role === "hr" ||
    user.role === "supervisor"
  );
}

// Check whether a user can access crew planning features.
// Crew Planner shows the day's crew units, which carry the patient order (PHI).
// HR is excluded to match the backend gate on /api/crew-units — leaving HR in
// the nav would only hand them a page that 403s.
export function hasCrewPlannerAccess(user) {
  if (!user) {
    return false;
  }

  return (
    user.role === "admin" ||
    user.role === "supervisor" ||
    user.role === "dispatcher"
  );
}

// Check whether a user can view Fleet. Dispatchers get read-only visibility —
// they need to know which vehicles are available and what is out of service —
// while HR has no operational reason to see the fleet at all.
export function hasFleetAccess(user) {
  if (!user) {
    return false;
  }

  return (
    user.role === "admin" ||
    user.role === "supervisor" ||
    user.role === "dispatcher"
  );
}

// Check whether a user can create/edit/retire fleet records. Dispatchers can
// look but not touch; the frontend gate is a convenience, the backend is the
// enforcement.
export function hasFleetEditAccess(user) {
  if (!user) {
    return false;
  }

  return user.role === "admin" || user.role === "supervisor";
}

// Check whether a user has access to supervisor-only features.
export function hasSupervisorAccess(user) {
  if (!user) {
    return false;
  }

  return user.role === "admin" || user.role === "supervisor";
}

// Check whether a user has admin-only access.
export function hasAdminAccess(user) {
  if (!user) {
    return false;
  }

  return user.role === "admin";
}

// =========================
// USER MANAGEMENT API
// =========================

// Get all application users.
export async function getUsers() {
  const response = await fetch(`${API_BASE_URL}/api/auth/users`, { credentials: "include" });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to load users");
  }

  return data;
}

// Create a new application user.
export async function createUser(userData) {
  const response = await fetch(`${API_BASE_URL}/api/auth/users`, {
    credentials: "include",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(userData),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to create user");
  }

  return data;
}

// Update an existing application user.
export async function updateUser(userId, userData) {
  const response = await fetch(
    `${API_BASE_URL}/api/auth/users/${userId}`,
    {
    credentials: "include",
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(userData),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to update user");
  }

  return data;
}

// Toggle active status for a user account.
export async function toggleUserActive(userId, isActive) {
  const response = await fetch(
    `${API_BASE_URL}/api/auth/users/${userId}/toggle-active`,
    {
    credentials: "include",
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        is_active: isActive,
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to update user status");
  }

  return data;
}