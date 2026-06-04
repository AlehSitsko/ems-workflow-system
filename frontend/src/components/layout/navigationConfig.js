import {
  FaHome,
  FaPhoneAlt,
  FaUserInjured,
  FaClipboardList,
  FaUsers,
  FaAmbulance,
  FaStar,
  FaChartBar,
  FaUserCog,
  FaBookOpen,
} from "react-icons/fa";

import {
  hasPatientAccess,
  hasEmployeeAccess,
  hasCrewPlannerAccess,
  hasSupervisorAccess,
  hasAdminAccess,
} from "../../api/authApi";

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
        label: "Crew Presets",
        path: "/crew-planner",
        icon: FaStar,
        canAccess: hasCrewPlannerAccess,
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
        label: "User Manual",
        path: "/manual",
        icon: FaBookOpen,
        canAccess: () => true,
      },
    ],
  },
];