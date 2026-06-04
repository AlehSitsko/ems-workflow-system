// Normalize employee role values so UI logic works with different casing.
export function normalizeEmployeeRole(role) {
  return String(role || "")
    .trim()
    .toLowerCase();
}

// Return a readable label for employee roles.
export function getEmployeeRoleLabel(role) {
  const normalizedRole = normalizeEmployeeRole(role);

  switch (normalizedRole) {
    case "driver":
      return "Driver";
    case "emt":
      return "EMT";
    case "paramedic":
      return "Paramedic";
    case "dispatcher":
      return "Dispatcher";
    case "supervisor":
      return "Supervisor";
    case "manager":
      return "Manager";
    case "admin":
      return "Admin";
    case "hr":
      return "HR";
    case "assist":
      return "Assist";
    default:
      return role || "Unknown";
  }
}

// Return CSS modifier class for employee role badges.
export function getEmployeeRoleClass(role) {
  const normalizedRole = normalizeEmployeeRole(role);

  switch (normalizedRole) {
    case "driver":
      return "role-driver";
    case "emt":
      return "role-emt";
    case "paramedic":
      return "role-paramedic";
    case "dispatcher":
      return "role-dispatcher";
    case "supervisor":
      return "role-supervisor";
    case "manager":
      return "role-manager";
    case "admin":
      return "role-admin";
    case "hr":
      return "role-hr";
    case "assist":
      return "role-assist";
    default:
      return "role-unknown";
  }
}