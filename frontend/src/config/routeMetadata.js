import {
  FaHome, FaTh, FaPhoneAlt, FaUserInjured, FaClipboardList, FaCalendarAlt,
  FaTruck, FaTasks, FaUsers, FaAmbulance, FaMoneyBillWave, FaShieldAlt, FaUmbrellaBeach, FaInbox,
  FaChartBar, FaUserCog, FaHistory, FaCog, FaBookOpen, FaClock,
} from "react-icons/fa";

import {
  hasPatientAccess, hasDispatchAccess, hasEmployeeAccess, hasCrewPlannerAccess,
  hasLeaveReviewAccess,
  hasSupervisorAccess, hasAdminAccess, hasFleetAccess, hasFleetEditAccess,
} from "../api/authApi";

/**
 * Centralized route metadata.
 *
 * The AppShell header reads the current page's title/subtitle/icon from here, so
 * a page component never re-declares its own chrome and every page gets the same
 * header treatment for free. The sidebar builds its groups from the same source,
 * which is what stops navigation and header titles from drifting apart.
 *
 * `canAccess` mirrors the route guards in App.jsx — it decides what a user is
 * *shown*. It is never the security boundary: the API enforces access
 * server-side (see utils/auth_utils.py and tests/test_security.py).
 *
 * `width`:
 *   "standard" — dashboards, forms, entity lists, workspaces, admin pages
 *   "wide"     — dense operational surfaces that should use the full viewport
 */

const anyUser = () => true;
const hasTaskAccess = (user) =>
  !!user && ["admin", "supervisor", "hr", "dispatcher"].includes(user.role);
const hasAuditAccess = hasTaskAccess;
const hasPayrollAccess = (user) =>
  !!user && ["admin", "supervisor", "hr"].includes(user.role);

/**
 * One entry per route. `group` drives the sidebar section; `hidden` keeps a
 * route out of the sidebar while still giving it header metadata (detail pages,
 * login, kiosk).
 */
export const ROUTE_METADATA = [
  {
    path: "/home",
    title: "Dashboard",
    subtitle: "Overview of today's operations",
    icon: FaHome,
    group: "Main",
    canAccess: anyUser,
    width: "standard",
  },

  // ── Operations ───────────────────────────────────────────────────────────
  {
    path: "/dispatch",
    title: "Dispatch Board",
    subtitle: "Assign calls to units and track status",
    icon: FaTh,
    group: "Operations",
    canAccess: hasDispatchAccess,
    width: "wide",
  },
  {
    path: "/call-form",
    title: "Call Form",
    subtitle: "Create a new EMS call record",
    icon: FaPhoneAlt,
    group: "Operations",
    canAccess: hasPatientAccess,
    width: "standard",
  },
  {
    path: "/patients",
    title: "Patients",
    subtitle: "Search, review, and manage patient records",
    icon: FaUserInjured,
    group: "Operations",
    canAccess: hasPatientAccess,
    width: "standard",
  },
  {
    path: "/patients/new",
    title: "Add patient",
    subtitle: "Create a patient record",
    icon: FaUserInjured,
    group: "Operations",
    canAccess: hasPatientAccess,
    width: "standard",
    hidden: true,
    parent: "/patients",
  },
  {
    path: "/patients/:patientId/edit",
    title: "Edit patient",
    subtitle: "Update the patient record",
    icon: FaUserInjured,
    group: "Operations",
    canAccess: hasPatientAccess,
    width: "standard",
    hidden: true,
    parent: "/patients",
  },
  {
    // Detail route: reached from the list, not a sidebar entry. The workspace
    // renders its own entity header, so the shell header stays generic.
    path: "/patients/:patientId",
    title: "Patient",
    subtitle: "Patient record and history",
    icon: FaUserInjured,
    group: "Operations",
    canAccess: hasPatientAccess,
    width: "standard",
    hidden: true,
    parent: "/patients",
  },
  {
    path: "/calls",
    title: "Calls",
    subtitle: "Review saved call records and call history",
    icon: FaClipboardList,
    group: "Operations",
    canAccess: hasPatientAccess,
    width: "standard",
  },
  {
    path: "/calendar",
    title: "Calendar",
    subtitle: "View calls, crew shifts, and daily readiness",
    icon: FaCalendarAlt,
    group: "Operations",
    canAccess: anyUser,
    width: "wide",
  },

  // ── Fleet ────────────────────────────────────────────────────────────────
  {
    path: "/fleet/vehicles",
    title: "Vehicles",
    subtitle: "Manage EMS vehicles and equipment",
    icon: FaTruck,
    group: "Fleet",
    canAccess: hasFleetAccess,
    width: "standard",
  },
  {
    // Declared before ":vehicleId" so the literal wins the match — otherwise the
    // create form would resolve as a vehicle named "new".
    path: "/fleet/vehicles/new",
    title: "Add vehicle",
    subtitle: "Register a physical vehicle",
    icon: FaTruck,
    group: "Fleet",
    // Editing the fleet is admin/supervisor; the API enforces it too.
    canAccess: hasFleetEditAccess,
    width: "standard",
    hidden: true,
    parent: "/fleet/vehicles",
  },
  {
    path: "/fleet/vehicles/:vehicleId/edit",
    title: "Edit vehicle",
    subtitle: "Update the physical vehicle record",
    icon: FaTruck,
    group: "Fleet",
    canAccess: hasFleetEditAccess,
    width: "standard",
    hidden: true,
    parent: "/fleet/vehicles",
  },
  {
    // Detail route: reachable from the list, not a sidebar entry. The workspace
    // renders its own entity header, so the shell header stays generic.
    path: "/fleet/vehicles/:vehicleId",
    title: "Vehicle",
    subtitle: "Vehicle details and history",
    icon: FaTruck,
    group: "Fleet",
    canAccess: hasFleetAccess,
    width: "standard",
    hidden: true,
    parent: "/fleet/vehicles",
  },

  // ── Staff ────────────────────────────────────────────────────────────────
  {
    path: "/tasks",
    title: "Tasks",
    subtitle: "Assign and track staff work",
    icon: FaTasks,
    group: "Staff",
    canAccess: hasTaskAccess,
    width: "standard",
  },
  {
    path: "/calls/:callId",
    title: "Call",
    subtitle: "Trip details and confirmation",
    icon: FaPhoneAlt,
    group: "Operations",
    canAccess: hasDispatchAccess,
    width: "standard",
    hidden: true,
    parent: "/calls",
  },
  {
    path: "/scheduling-inbox",
    title: "Scheduling inbox",
    subtitle: "Calls waiting for a trip date",
    icon: FaInbox,
    group: "Operations",
    canAccess: hasDispatchAccess,
    width: "standard",
  },
  {
    path: "/leave",
    title: "Leave review",
    subtitle: "Approve, deny and track employee absence",
    icon: FaUmbrellaBeach,
    group: "Staff",
    canAccess: hasLeaveReviewAccess,
    width: "standard",
  },
  {
    path: "/employees",
    title: "Employees",
    subtitle: "Manage employee records and certifications",
    icon: FaUsers,
    group: "Staff",
    canAccess: hasEmployeeAccess,
    width: "standard",
  },
  {
    // Declared before ":employeeId" so the literal wins the match.
    path: "/employees/new",
    title: "Add employee",
    subtitle: "Create an employee record",
    icon: FaUsers,
    group: "Staff",
    canAccess: hasEmployeeAccess,
    width: "standard",
    hidden: true,
    parent: "/employees",
  },
  {
    path: "/employees/:employeeId/edit",
    title: "Edit employee",
    subtitle: "Update the employee record",
    icon: FaUsers,
    group: "Staff",
    canAccess: hasEmployeeAccess,
    width: "standard",
    hidden: true,
    parent: "/employees",
  },
  {
    // Detail route: reached from the list, not a sidebar entry. The workspace
    // renders its own entity header, so the shell header stays generic.
    path: "/employees/:employeeId",
    title: "Employee",
    subtitle: "Employee record and history",
    icon: FaUsers,
    group: "Staff",
    canAccess: hasEmployeeAccess,
    width: "standard",
    hidden: true,
    parent: "/employees",
  },
  {
    path: "/crew-planner",
    title: "Crew Planner",
    subtitle: "Plan unit assignments for the day",
    icon: FaAmbulance,
    group: "Staff",
    canAccess: hasCrewPlannerAccess,
    width: "wide",
  },
  {
    path: "/payroll",
    title: "Payroll",
    subtitle: "Manage pay periods and export payroll",
    icon: FaMoneyBillWave,
    group: "Staff",
    canAccess: hasPayrollAccess,
    width: "standard",
  },
  {
    path: "/compliance",
    title: "Compliance",
    subtitle: "Track certifications and compliance status",
    icon: FaShieldAlt,
    group: "Staff",
    canAccess: hasPayrollAccess,
    width: "standard",
  },

  // ── Management ───────────────────────────────────────────────────────────
  {
    path: "/supervisor",
    title: "Supervisor Dashboard",
    subtitle: "Review performance and call quality analytics",
    icon: FaChartBar,
    group: "Management",
    canAccess: hasSupervisorAccess,
    width: "wide",
  },

  // ── Administration ───────────────────────────────────────────────────────
  {
    path: "/users",
    title: "Users",
    subtitle: "Manage system user accounts and roles",
    icon: FaUserCog,
    group: "Administration",
    canAccess: hasAdminAccess,
    width: "standard",
  },
  {
    path: "/audit",
    title: "Audit Log",
    subtitle: "View system activity and event history",
    icon: FaHistory,
    group: "Administration",
    canAccess: hasAuditAccess,
    width: "standard",
  },
  {
    path: "/notifications",
    title: "Settings",
    subtitle: "Your personal preferences and notifications",
    icon: FaCog,
    group: "Administration",
    canAccess: anyUser,
    width: "standard",
  },

  // ── Help ─────────────────────────────────────────────────────────────────
  {
    path: "/kiosk",
    title: "Kiosk",
    subtitle: "Employee clock in and out",
    icon: FaClock,
    group: "Help",
    canAccess: anyUser,
    width: "standard",
  },
  {
    path: "/manual",
    title: "User Manual",
    subtitle: "How to use the system",
    icon: FaBookOpen,
    group: "Help",
    canAccess: anyUser,
    width: "standard",
  },
];

// Sidebar section order. Groups render in this order; anything not listed is
// appended, so adding a group can't silently make a route disappear.
export const GROUP_ORDER = [
  "Main", "Operations", "Fleet", "Staff", "Management", "Administration", "Help",
];

const FALLBACK = {
  title: "EMS Workflow System",
  subtitle: "",
  icon: FaHome,
  width: "standard",
};

/** Does a concrete pathname match a metadata path pattern (`/x/:id`)? */
function pathMatches(pattern, pathname) {
  if (pattern === pathname) return true;
  if (!pattern.includes(":")) return false;
  const p = pattern.split("/").filter(Boolean);
  const a = pathname.split("/").filter(Boolean);
  if (p.length !== a.length) return false;
  return p.every((seg, i) => seg.startsWith(":") || seg === a[i]);
}

/**
 * Metadata for a pathname. Exact routes win over parameterized ones, so
 * `/fleet/vehicles` never resolves to `/fleet/vehicles/:vehicleId`.
 */
export function getRouteMetadata(pathname) {
  const exact = ROUTE_METADATA.find((r) => r.path === pathname);
  if (exact) return exact;
  const param = ROUTE_METADATA.find((r) => pathMatches(r.path, pathname));
  return param || FALLBACK;
}

/** Sidebar groups the user may see, in GROUP_ORDER, with empty groups dropped. */
export function getNavigationGroups(user) {
  const visible = ROUTE_METADATA.filter((r) => !r.hidden && r.canAccess(user));
  const groups = [];
  const ordered = [
    ...GROUP_ORDER,
    ...[...new Set(visible.map((r) => r.group))].filter((g) => !GROUP_ORDER.includes(g)),
  ];
  ordered.forEach((name) => {
    const items = visible.filter((r) => r.group === name);
    if (items.length) groups.push({ title: name, items });
  });
  return groups;
}
