import {
  FaHome,
  FaPhoneAlt,
  FaUserInjured,
  FaClipboardList,
  FaUsers,
  FaAmbulance,
  FaChartBar,
  FaUserCog,
  FaBookOpen,
  FaTh,
  FaCog,
  FaClock,
  FaMoneyBillWave,
  FaShieldAlt,
  FaHistory,
  FaTasks,
  FaCalendarAlt,
  FaTruck,
  FaUmbrellaBeach,
  FaInbox,
} from "react-icons/fa";

import {
  hasPatientAccess,
  hasDispatchAccess,
  hasEmployeeAccess,
  hasLeaveReviewAccess,
  hasCrewPlannerAccess,
  hasSupervisorAccess,
  hasAdminAccess,
  hasFleetAccess,
} from "../../api/authApi";

const hasPayrollAccess = (user) =>
  user && ["admin", "supervisor", "hr"].includes(user.role);

const hasTaskAccess = (user) =>
  user && ["admin", "supervisor", "hr", "dispatcher"].includes(user.role);

export const navigationGroups = [
  {
    title: "Main",
    items: [
      {
        label: "Dashboard",
        path: "/home",
        icon: FaHome,
        canAccess: () => true,
      },
    ],
  },
  {
    title: "Operations",
    items: [
      {
        label: "Dispatch Board",
        path: "/dispatch",
        icon: FaTh,
        canAccess: hasDispatchAccess,
      },
      {
        label: "Call Form",
        path: "/call-form",
        icon: FaPhoneAlt,
        canAccess: hasPatientAccess,
      },
      {
        label: "Scheduling Inbox",
        path: "/scheduling-inbox",
        icon: FaInbox,
        canAccess: hasDispatchAccess,
      },
      {
        label: "Patients",
        path: "/patients",
        icon: FaUserInjured,
        canAccess: hasPatientAccess,
      },
      {
        label: "Calls",
        path: "/calls",
        icon: FaClipboardList,
        canAccess: hasPatientAccess,
      },
      {
        label: "Calendar",
        path: "/calendar",
        icon: FaCalendarAlt,
        canAccess: () => true,
      },
    ],
  },
  {
    title: "Fleet",
    items: [
      {
        label: "Vehicles",
        path: "/fleet/vehicles",
        icon: FaTruck,
        canAccess: hasFleetAccess,
      },
    ],
  },
  {
    title: "Staff",
    items: [
      {
        label: "Tasks",
        path: "/tasks",
        icon: FaTasks,
        canAccess: hasTaskAccess,
      },
      {
        label: "Employees",
        path: "/employees",
        icon: FaUsers,
        canAccess: hasEmployeeAccess,
      },
      {
        label: "Leave",
        path: "/leave",
        icon: FaUmbrellaBeach,
        canAccess: hasLeaveReviewAccess,
      },
      {
        label: "Crew Planner",
        path: "/crew-planner",
        icon: FaAmbulance,
        canAccess: hasCrewPlannerAccess,
      },
      {
        label: "Payroll",
        path: "/payroll",
        icon: FaMoneyBillWave,
        canAccess: hasPayrollAccess,
      },
      {
        label: "Compliance",
        path: "/compliance",
        icon: FaShieldAlt,
        canAccess: hasPayrollAccess,
      },
    ],
  },
  {
    title: "Management",
    items: [
      {
        label: "Supervisor Dashboard",
        path: "/supervisor",
        icon: FaChartBar,
        canAccess: hasSupervisorAccess,
      },
    ],
  },
  {
    title: "Administration",
    items: [
      {
        label: "Users",
        path: "/users",
        icon: FaUserCog,
        canAccess: hasAdminAccess,
      },
      {
        label: "Audit Log",
        path: "/audit",
        icon: FaHistory,
        canAccess: (user) => user && ["admin", "supervisor", "hr", "dispatcher"].includes(user.role),
      },
    ],
  },
  {
    title: "Help",
    items: [
      {
        label: "Kiosk",
        path: "/kiosk",
        icon: FaClock,
        canAccess: () => true,
      },
      {
        label: "Settings",
        path: "/notifications",
        icon: FaCog,
        canAccess: () => true,
      },
      {
        label: "User Manual",
        path: "/manual",
        icon: FaBookOpen,
        canAccess: () => true,
      },
    ],
  },
];