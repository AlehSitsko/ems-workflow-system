import API_BASE from "./config.js";
const API_BASE_URL = API_BASE;

const CURRENT_USER_STORAGE_KEY = "ems_current_user";

// =========================
// AUTH FUNCTIONS
// =========================

// Send login credentials to the backend.
export async function loginUser(username, password) {
  const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
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

  return data.user;
}

// Save current user to localStorage.
export function saveCurrentUser(user) {
  localStorage.setItem(CURRENT_USER_STORAGE_KEY, JSON.stringify(user));
}

// Read current user from localStorage.
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

// Remove current user from localStorage.
export function logoutUser() {
  localStorage.removeItem(CURRENT_USER_STORAGE_KEY);
}

// =========================
// ROLE ACCESS HELPERS
// =========================

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
  const response = await fetch(`${API_BASE_URL}/api/auth/users`);

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to load users");
  }

  return data;
}

// Create a new application user.
export async function createUser(userData) {
  const response = await fetch(`${API_BASE_URL}/api/auth/users`, {
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