import { useEffect, useRef } from "react";
import { NavLink } from "react-router-dom";
import { FaChevronLeft, FaStarOfLife, FaTimes } from "react-icons/fa";

import { getNavigationGroups } from "../../config/routeMetadata";
import { APP_VERSION } from "../../config/appInfo";

/**
 * Primary navigation.
 *
 * Desktop: a permanent landmark, optionally collapsed to icons (the collapse
 * control lives in the footer — there is deliberately no second control for it
 * in the header).
 *
 * Mobile: an off-canvas dialog over the content. It traps focus, closes on
 * Escape / outside click / Close / route change, and hands focus back to the
 * hamburger that opened it.
 *
 * Groups and permissions come from routeMetadata, so navigation cannot drift
 * from the router or from the header's titles.
 */
function Sidebar({
  currentUser,
  collapsed = false,
  onToggleCollapse,
  isMobile = false,
  mobileOpen = false,
  onCloseMobile,
  attentionCounts = {},
  id = "app-sidebar",
}) {
  const asideRef = useRef(null);
  const closeButtonRef = useRef(null);

  const groups = getNavigationGroups(currentUser);

  // Mobile only: Escape closes, focus is trapped inside, and the page behind
  // must not scroll.
  useEffect(() => {
    if (!isMobile || !mobileOpen) return undefined;

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseMobile?.();
        return;
      }
      if (e.key !== "Tab") return;

      const focusables = asideRef.current?.querySelectorAll(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables?.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobile, mobileOpen, onCloseMobile]);

  // Collapsed only applies on desktop; an off-canvas panel is always full width.
  const isCollapsed = collapsed && !isMobile;

  const classes = [
    "app-sidebar",
    isCollapsed ? "collapsed" : "",
    isMobile ? "mobile" : "",
    isMobile && mobileOpen ? "open" : "",
  ].filter(Boolean).join(" ");

  return (
    <>
      {isMobile && mobileOpen && (
        <div className="sidebar-scrim" onClick={onCloseMobile} aria-hidden="true" />
      )}

      <aside
        id={id}
        ref={asideRef}
        className={classes}
        aria-label="Main navigation"
        aria-hidden={isMobile && !mobileOpen ? "true" : undefined}
        {...(isMobile && mobileOpen ? { role: "dialog", "aria-modal": "true" } : {})}
      >
        <div className="sidebar-brand">
          <div className="sidebar-brand-icon">
            <FaStarOfLife />
          </div>
          {!isCollapsed && (
            <div className="sidebar-brand-text">
              <div className="sidebar-brand-title">EMS Workflow</div>
              <div className="sidebar-brand-subtitle">System</div>
            </div>
          )}
          {isMobile && (
            <button
              type="button"
              ref={closeButtonRef}
              className="sidebar-close"
              onClick={onCloseMobile}
              aria-label="Close navigation"
            >
              <FaTimes />
            </button>
          )}
        </div>

        <nav className="sidebar-nav">
          {groups.map((group) => (
            <div className="sidebar-group" key={group.title}>
              {!isCollapsed && <div className="sidebar-group-title">{group.title}</div>}

              {group.items.map((item) => {
                const Icon = item.icon;
                // Only ever shown when there is something to act on.
                const waiting = item.badgeKey ? attentionCounts[item.badgeKey] || 0 : 0;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}
                    // Collapsed shows icons only, so the label has to survive as
                    // a tooltip and as the accessible name.
                    title={isCollapsed
                      ? `${item.title}${waiting ? ` — ${waiting} waiting` : ""}`
                      : undefined}
                    aria-label={waiting
                      ? `${item.title}, ${waiting} waiting`
                      : (isCollapsed ? item.title : undefined)}
                    onClick={isMobile ? onCloseMobile : undefined}
                  >
                    <span className="sidebar-link-icon">
                      <Icon />
                      {/* Collapsed hides the label, so the count becomes a dot —
                          the point still lands: something is waiting here. */}
                      {waiting > 0 && isCollapsed && <span className="sidebar-badge-dot" />}
                    </span>
                    <span className="sidebar-link-label">{item.title}</span>
                    {waiting > 0 && !isCollapsed && (
                      <span className="sidebar-badge">{waiting > 99 ? "99+" : waiting}</span>
                    )}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          {!isMobile && (
            <button
              type="button"
              className="sidebar-collapse-button"
              onClick={onToggleCollapse}
              aria-pressed={collapsed}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <span className="sidebar-link-icon">
                <FaChevronLeft className="sidebar-collapse-chevron" />
              </span>
              <span className="sidebar-collapse-text">Collapse</span>
            </button>
          )}
          {!isCollapsed && (
            <div className="sidebar-version">
              © {new Date().getFullYear()} EMS Workflow System
              <br />v{APP_VERSION}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
