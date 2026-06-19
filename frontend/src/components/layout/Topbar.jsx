import React from "react";
import { Link, useLocation } from "react-router-dom";
import {
  FaBars,
  FaPhoneAlt,
  FaSearch,
  FaSignOutAlt,
  FaSun,
  FaMoon,
} from "react-icons/fa";

import { hasCallIntakeAccess } from "../../api/authApi";
import NotificationBell from "./NotificationBell";
import { useTheme } from "../../context/ThemeContext";

const pageTitles = {
  "/home": {
    title: "Dashboard",
    subtitle: "Overview of today's operations",
  },
  "/call-form": {
    title: "Call Form",
    subtitle: "Start and document EMS call intake",
  },
  "/patients": {
    title: "Patients",
    subtitle: "Search, review, and manage patient records",
  },
  "/calls": {
    title: "Calls",
    subtitle: "Review saved call records and call history",
  },
  "/employees": {
    title: "Employees",
    subtitle: "Manage staff records, certifications, and HR information",
  },
  "/crew-planner": {
    title: "Crew Planner",
    subtitle: "Create and manage unit assignments",
  },
  "/supervisor": {
    title: "Supervisor Dashboard",
    subtitle: "Review dispatcher analytics and call quality",
  },
  "/users": {
    title: "User Management",
    subtitle: "Create and manage system user accounts",
  },
  "/notifications": {
    title: "Notification Settings",
    subtitle: "Configure which alerts you receive",
  },
  "/manual": {
    title: "User Manual",
    subtitle: "Workflow instructions and system usage notes",
  },
};

function Topbar({ currentUser, onLogout, notifications = [], unreadCount = 0, markRead, markAllRead }) {
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();

  const currentPage = pageTitles[location.pathname] || {
    title: "EMS Workflow System",
    subtitle: "Operational management platform",
  };

  const userInitials = currentUser?.display_name
    ? currentUser.display_name
        .split(" ")
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "U";

  return (
    <header className="app-topbar">
      <div className="topbar-left">
        <button type="button" className="topbar-menu-button">
          <FaBars />
        </button>

        <div>
          <h1 className="topbar-title">{currentPage.title}</h1>
          <p className="topbar-subtitle">{currentPage.subtitle}</p>
        </div>
      </div>

      <div className="topbar-right">
        <div className="topbar-search">
          <input
            type="text"
            className="form-control"
            placeholder="Search patients, calls, units..."
            disabled
          />
          <FaSearch className="topbar-search-icon" />
        </div>

        {hasCallIntakeAccess(currentUser) && (
          <Link to="/call-form" className="btn btn-danger topbar-call-button">
            <FaPhoneAlt />
            <span>Start Taking Call</span>
          </Link>
        )}

        <button
          type="button"
          className="topbar-icon-button"
          onClick={toggleTheme}
          title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
        >
          {theme === "light" ? <FaMoon style={{ fontSize: 15 }} /> : <FaSun style={{ fontSize: 15 }} />}
        </button>

        <NotificationBell
          notifications={notifications}
          unreadCount={unreadCount}
          markRead={markRead}
          markAllRead={markAllRead}
        />

        <div className="topbar-user">
          <div className="topbar-user-avatar">{userInitials}</div>

          <div className="topbar-user-info">
            <div className="topbar-user-name">
              {currentUser?.display_name || "User"}
            </div>

            <div className="topbar-user-role">
              {currentUser?.role || "unknown"}
            </div>
          </div>
        </div>

        <button
          type="button"
          className="btn btn-outline-secondary btn-sm topbar-logout-button"
          onClick={onLogout}
        >
          <FaSignOutAlt />
          <span>Logout</span>
        </button>
      </div>
    </header>
  );
}

export default Topbar;
