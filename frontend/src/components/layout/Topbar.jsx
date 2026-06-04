import React from "react";
import { Link } from "react-router-dom";
import {
  FaBars,
  FaBell,
  FaPhoneAlt,
  FaSearch,
  FaSignOutAlt,
} from "react-icons/fa";

import { hasCallIntakeAccess } from "../../api/authApi";

function Topbar({ currentUser, onLogout }) {
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
          <h1 className="topbar-title">Dashboard</h1>
          <p className="topbar-subtitle">Overview of today's operations</p>
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

        <button type="button" className="topbar-icon-button">
          <FaBell />
          <span className="topbar-notification-badge">3</span>
        </button>

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