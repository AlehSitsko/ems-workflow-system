import React, { useState } from "react";
import { NavLink } from "react-router-dom";
import { FaChevronLeft, FaStarOfLife } from "react-icons/fa";

import { navigationGroups } from "./navigationConfig";

function Sidebar({ currentUser }) {
  const [collapsed, setCollapsed] = useState(false);

  const getNavLinkClass = ({ isActive }) =>
    `sidebar-link${isActive ? " active" : ""}`;

  const visibleGroups = navigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.canAccess(currentUser)),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <aside className={`app-sidebar${collapsed ? " collapsed" : ""}`}>
      <div className="sidebar-brand">
        <div className="sidebar-brand-icon">
          <FaStarOfLife />
        </div>
        {!collapsed && (
          <div>
            <div className="sidebar-brand-title">EMS Workflow</div>
            <div className="sidebar-brand-subtitle">System</div>
          </div>
        )}
      </div>

      <nav className="sidebar-nav">
        {visibleGroups.map((group) => (
          <div className="sidebar-group" key={group.title}>
            <div className="sidebar-group-title">{group.title}</div>

            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={`${group.title}-${item.label}`}
                  to={item.path}
                  className={getNavLinkClass}
                  title={collapsed ? item.label : undefined}
                >
                  <span className="sidebar-link-icon">
                    <Icon />
                  </span>
                  <span className="sidebar-link-label">{item.label}</span>
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <button
          type="button"
          className="sidebar-collapse-button"
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <span className="sidebar-link-icon">
            <FaChevronLeft className="sidebar-collapse-chevron" />
          </span>
          <span className="sidebar-collapse-text">Collapse</span>
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;
