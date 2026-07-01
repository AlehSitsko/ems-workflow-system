import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  FaBars,
  FaPhoneAlt,
  FaSearch,
  FaSignOutAlt,
  FaSun,
  FaMoon,
  FaCog,
  FaChevronDown,
} from "react-icons/fa";

import { hasCallIntakeAccess } from "../../api/authApi";
import NotificationBell from "./NotificationBell";
import { useTheme } from "../../context/useTheme";

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

function UserMenu({ currentUser, onLogout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  const userInitials = currentUser?.display_name
    ? currentUser.display_name
        .split(" ")
        .map((p) => p[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "U";

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const action = (fn) => () => { setOpen(false); fn(); };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: open ? "var(--ems-bg-surface-2, rgba(255,255,255,0.07))" : "transparent",
          border: "1px solid " + (open ? "var(--ems-border)" : "transparent"),
          borderRadius: 10,
          padding: "5px 10px 5px 5px",
          cursor: "pointer",
          transition: "all 0.15s",
        }}
        aria-label="User menu"
      >
        <div className="topbar-user-avatar">{userInitials}</div>
        <div className="topbar-user-info" style={{ textAlign: "left" }}>
          <div className="topbar-user-name">{currentUser?.display_name || "User"}</div>
          <div className="topbar-user-role">{currentUser?.role || "unknown"}</div>
        </div>
        <FaChevronDown
          style={{
            fontSize: 10,
            color: "var(--ems-text-muted)",
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 0.15s",
          }}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            minWidth: 210,
            background: "var(--ems-bg-surface)",
            border: "1px solid var(--ems-border)",
            borderRadius: 12,
            boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
            zIndex: 2000,
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div style={{ padding: "12px 16px 10px", borderBottom: "1px solid var(--ems-border)" }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: "var(--ems-text-primary)" }}>
              {currentUser?.display_name || "User"}
            </div>
            <div style={{ fontSize: 12, color: "var(--ems-text-muted)", marginTop: 1, textTransform: "capitalize" }}>
              {currentUser?.role || "unknown"}
            </div>
          </div>

          {/* Items */}
          <div style={{ padding: "6px 0" }}>
            <MenuItem
              icon={<FaCog />}
              label="Settings"
              onClick={action(() => navigate("/notifications"))}
            />
            <MenuItem
              icon={theme === "light" ? <FaMoon /> : <FaSun />}
              label={theme === "light" ? "Dark mode" : "Light mode"}
              onClick={action(toggleTheme)}
            />
          </div>

          <div style={{ borderTop: "1px solid var(--ems-border)", padding: "6px 0" }}>
            <MenuItem
              icon={<FaSignOutAlt />}
              label="Log out"
              danger
              onClick={action(onLogout)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon, label, onClick, danger }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        padding: "8px 16px",
        background: hovered ? "var(--ems-bg-surface-2, rgba(255,255,255,0.06))" : "transparent",
        border: "none",
        cursor: "pointer",
        fontSize: 13,
        color: danger
          ? (hovered ? "#f1707a" : "#dc3545")
          : (hovered ? "var(--ems-text-primary)" : "var(--ems-text-secondary)"),
        textAlign: "left",
        transition: "all 0.1s",
      }}
    >
      <span style={{ fontSize: 13, width: 16, display: "flex", justifyContent: "center" }}>{icon}</span>
      {label}
    </button>
  );
}

function Topbar({ currentUser, onLogout, notifications = [], unreadCount = 0, markRead, markAllRead }) {
  const location = useLocation();

  const currentPage = pageTitles[location.pathname] || {
    title: "EMS Workflow System",
    subtitle: "Operational management platform",
  };

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

        <NotificationBell
          notifications={notifications}
          unreadCount={unreadCount}
          markRead={markRead}
          markAllRead={markAllRead}
        />

        <UserMenu currentUser={currentUser} onLogout={onLogout} />
      </div>
    </header>
  );
}

export default Topbar;
