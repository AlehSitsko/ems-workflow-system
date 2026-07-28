import {
  FaHome, FaTh, FaPhoneAlt, FaUserInjured, FaClipboardList, FaCalendarAlt,
  FaTruck, FaTasks, FaUsers, FaAmbulance, FaMoneyBillWave, FaShieldAlt, FaUmbrellaBeach, FaInbox, FaClipboardCheck, FaSyncAlt,
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
// The /audit route is guarded by EmployeeRoute in App.jsx (admin/supervisor/hr).
// This used to allow dispatcher, which put a link in the sidebar that bounced
// the user straight back to the dashboard. Aligned to the guard — the narrower
// of the two — rather than widening the guard to match the menu.
const hasAuditAccess = (user) =>
  !!user && ["admin", "supervisor", "hr"].includes(user.role);
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
    // Taking a call is an action, not a place: it is reached from the header's
    // "Start Taking Call" and from New Call inside Calls & Scheduling, so it is
    // deliberately absent from the menu. The route and its permission are
    // unchanged — `quickAction` records why it has no menu entry.
    path: "/call-form",
    title: "Call Form",
    subtitle: "Create a new EMS call record",
    icon: FaPhoneAlt,
    group: "Operations",
    canAccess: hasPatientAccess,
    width: "standard",
    hidden: true,
    quickAction: true,
    parent: "/calls",
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
    badgeKey: "tasks",   // my overdue / due-today tasks
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
    path: "/recurring-trips",
    title: "Recurring trips",
    subtitle: "Standing transport orders",
    icon: FaSyncAlt,
    group: "Operations",
    canAccess: hasDispatchAccess,
    width: "standard",
  },
  {
    path: "/day-closeout",
    badgeKey: "dayCloseout",
    title: "Day closeout",
    subtitle: "Review and sign off an operational day",
    icon: FaClipboardCheck,
    group: "Operations",
    canAccess: hasDispatchAccess,
    width: "standard",
  },
  {
    path: "/confirmation-round",
    badgeKey: "confirmationRound",
    title: "Confirmation round",
    subtitle: "Ring through a day's trips",
    icon: FaPhoneAlt,
    group: "Operations",
    canAccess: hasDispatchAccess,
    width: "standard",
  },
  {
    path: "/scheduling-inbox",
    badgeKey: "schedulingInbox",
    title: "Scheduling inbox",
    subtitle: "Calls waiting for a trip date",
    icon: FaInbox,
    group: "Operations",
    canAccess: hasDispatchAccess,
    width: "standard",
  },
  {
    path: "/leave",
    badgeKey: "leaveReview",
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
    badgeKey: "compliance",   // active staff with an expired / soon-expiring cert
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
  {
    path: "/reports",
    title: "Reports",
    subtitle: "Call volume, outcomes and service-level mix over a period",
    icon: FaClipboardList,
    group: "Management",
    canAccess: hasSupervisorAccess,
    width: "standard",
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

/**
 * The sidebar's two-level shape.
 *
 * This declares *structure only*. Every node points at a path in ROUTE_METADATA
 * above, and its label, icon, badge and permission are read from there — so a
 * route cannot appear in the menu with a different name or a looser permission
 * than the rest of the app gives it. There is deliberately no second list of
 * pages and no second permission check.
 *
 * A `children` node is a hub: a grouping of pages that belong to one job. Hubs
 * are disclosure controls, not routes, which is why every existing URL keeps
 * working untouched.
 */
export const NAV_SECTIONS = [
  // Dashboard stands alone above the sections — it is the entry point, not a
  // member of a category.
  { title: null, items: [{ path: "/home" }] },

  {
    title: "Operations",
    items: [
      { path: "/dispatch" },
      {
        id: "calls-scheduling",
        label: "Calls & Scheduling",
        icon: FaClipboardList,
        children: [
          { path: "/calls", label: "All Calls" },
          { path: "/scheduling-inbox", label: "Scheduling Inbox" },
          { path: "/recurring-trips", label: "Recurring Trips" },
          { path: "/confirmation-round", label: "Confirmations" },
        ],
      },
      { path: "/day-closeout" },
      { path: "/calendar" },
    ],
  },

  {
    title: "Resources",
    items: [
      { path: "/patients" },
      {
        id: "fleet-crews",
        label: "Fleet & Crews",
        icon: FaTruck,
        children: [
          { path: "/crew-planner", label: "Crew Planner" },
          { path: "/fleet/vehicles", label: "Vehicles" },
        ],
      },
    ],
  },

  {
    title: "Workforce",
    items: [
      {
        id: "workforce-employees",
        label: "Employees",
        icon: FaUsers,
        children: [
          { path: "/employees", label: "Directory" },
          { path: "/compliance", label: "Compliance" },
          { path: "/leave", label: "Leave" },
          { path: "/payroll", label: "Payroll" },
        ],
      },
      // Tasks stays top-level: a task can belong to any employee, module or
      // project, so filing it under Employees would misdescribe it.
      { path: "/tasks" },
    ],
  },

  // Management holds the two analytics surfaces: the Supervisor Dashboard
  // (dispatcher performance, /api/analytics/dispatchers) and Reports (operational
  // volume/outcomes over a date range, /api/reports/*). Both are admin/supervisor.
  {
    title: "Management",
    items: [
      {
        id: "analytics",
        label: "Analytics",
        icon: FaChartBar,
        children: [
          { path: "/supervisor", label: "Supervisor Dashboard" },
          { path: "/reports", label: "Reports" },
        ],
      },
    ],
  },

  {
    title: "Administration",
    items: [{ path: "/users" }, { path: "/audit" }, { path: "/notifications" }],
  },

  { title: "Help", items: [{ path: "/kiosk" }, { path: "/manual" }] },
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

/** Resolve one leaf node against ROUTE_METADATA, or null if the user may not see it. */
function resolveLeaf(node, user) {
  const meta = ROUTE_METADATA.find((r) => r.path === node.path);
  // A nav node pointing at a path with no metadata is a bug, not something to
  // render blind — routeMetadata.test.js fails on it.
  if (!meta || !meta.canAccess(user)) return null;
  return {
    type: "link",
    path: meta.path,
    // The nav may shorten a label inside a hub ("Directory" under Employees)
    // without renaming the page itself.
    label: node.label || meta.title,
    title: meta.title,
    subtitle: meta.subtitle,
    icon: meta.icon,
    badgeKey: meta.badgeKey,
  };
}

/**
 * The sidebar tree for a user: sections → items → children.
 *
 * Filtering is by permission only, and it cascades: a hub whose children are all
 * denied disappears, and a section left with no items disappears with it, so
 * nobody is shown a category header over nothing.
 *
 * A hub reduced to a single child collapses into a plain link to that child —
 * consistently for every hub and every role, since a disclosure control that
 * opens one thing is just a link wearing a costume.
 */
export function getNavigationTree(user) {
  const sections = [];

  NAV_SECTIONS.forEach((section) => {
    const items = [];

    section.items.forEach((item) => {
      if (!item.children) {
        const leaf = resolveLeaf(item, user);
        if (leaf) items.push(leaf);
        return;
      }

      const children = item.children
        .map((child) => resolveLeaf(child, user))
        .filter(Boolean);

      if (children.length === 0) return;
      if (children.length === 1) {
        items.push(children[0]);
        return;
      }

      items.push({
        type: "hub",
        id: item.id,
        label: item.label,
        icon: item.icon,
        children,
        // Child paths are what decides "is this hub the active one".
        paths: children.map((c) => c.path),
        badgeKeys: children.map((c) => c.badgeKey).filter(Boolean),
      });
    });

    if (items.length) sections.push({ title: section.title, items });
  });

  return sections;
}

/**
 * Every navigable page the user may open, flattened — for the command palette,
 * which searches pages rather than browsing them. Same source, same filtering.
 */
export function getNavigationItems(user) {
  return getNavigationTree(user).flatMap((section) =>
    section.items.flatMap((item) =>
      (item.type === "hub" ? item.children : [item]).map((leaf) => ({
        ...leaf,
        group: item.type === "hub" ? item.label : (section.title || "Main"),
      })),
    ),
  );
}

/**
 * The hub a pathname sits in, or null. Detail routes resolve through their
 * `parent`, so /calls/42 is still inside Calls & Scheduling.
 */
export function getActiveHub(pathname, user) {
  const meta = getRouteMetadata(pathname);
  const navPath = meta.parent || meta.path;
  return getNavigationTree(user)
    .flatMap((s) => s.items)
    .find((item) => item.type === "hub" && item.paths.includes(navPath)) || null;
}
