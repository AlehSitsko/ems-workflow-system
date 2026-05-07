const API_BASE_URL = "http://127.0.0.1:5050";

const CURRENT_USER_STORAGE_KEY = "ems_current_user";

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

// Check whether a user has supervisor-level access.
export function hasSupervisorAccess(user) {
  if (!user) {
    return false;
  }

  return user.role === "admin" || user.role === "supervisor";
}