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
  FaBell,
  FaClock,
  FaMoneyBillWave,
  FaShieldAlt,
} from "react-icons/fa";

import {
  hasPatientAccess,
  hasDispatchAccess,
  hasEmployeeAccess,
  hasCrewPlannerAccess,
  hasSupervisorAccess,
  hasAdminAccess,
} from "../../api/authApi";

const hasPayrollAccess = (user) =>
  user && ["admin", "supervisor", "hr"].includes(user.role);

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
    ],
  },
  {
    title: "Staff",
    items: [
      {
        label: "Employees",
        path: "/employees",
        icon: FaUsers,
        canAccess: hasEmployeeAccess,
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
        label: "Notifications",
        path: "/notifications",
        icon: FaBell,
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