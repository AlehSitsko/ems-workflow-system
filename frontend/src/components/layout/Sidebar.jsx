import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { FaChevronLeft, FaStarOfLife, FaTimes } from "react-icons/fa";

import { getNavigationTree, getRouteMetadata } from "../../config/routeMetadata";
import { SidebarSection, SidebarLink, SidebarHub } from "./SidebarNav";
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
 * Structure and permissions come from routeMetadata, so navigation cannot drift
 * from the router or from the header's titles.
 *
 * Two levels: sections hold links and hubs, and a hub holds the pages of one
 * job. Only one hub is open at a time, and the hub containing the current page
 * opens itself — so after a reload the sidebar shows where you are rather than
 * where you last clicked.
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

  const location = useLocation();
  // Collapsed only applies on desktop; an off-canvas panel is always full width.
  const isCollapsed = collapsed && !isMobile;
  const sections = useMemo(() => getNavigationTree(currentUser), [currentUser]);

  // Which hub the current page belongs to. Detail routes resolve through their
  // parent, so /calls/42 still counts as being inside Calls & Scheduling.
  const activeHubId = useMemo(() => {
    const meta = getRouteMetadata(location.pathname);
    const navPath = meta.parent || meta.path;
    const hub = sections
      .flatMap((s) => s.items)
      .find((item) => item.type === "hub" && item.paths.includes(navPath));
    return hub ? hub.id : null;
  }, [location.pathname, sections]);

  const [openHubId, setOpenHubId] = useState(activeHubId);

  // The active route always wins over whatever was open before: landing on a
  // page whose section is closed would leave the user unable to see where they
  // are. Submenu state is deliberately not persisted — it is derived from the
  // route, so there is nothing stale to restore for the next user or role.
  useEffect(() => {
    if (activeHubId) setOpenHubId(activeHubId);
  }, [activeHubId]);

  const toggleHub = (hubId) => {
    // Collapsed to a rail there is no room for a submenu, so opening a hub
    // expands the sidebar first. One predictable behaviour beats a flyout that
    // has to be re-solved for touch and keyboard.
    if (isCollapsed) {
      onToggleCollapse?.();
      setOpenHubId(hubId);
      return;
    }
    setOpenHubId((current) => (current === hubId ? null : hubId));
  };

  const badgeFor = (item) => (item.badgeKey ? attentionCounts[item.badgeKey] || 0 : 0);

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
          {sections.map((section, index) => (
            <SidebarSection key={section.title || `section-${index}`} section={section}>
              {section.items.map((item) => (
                item.type === "hub" ? (
                  <SidebarHub
                    key={item.id}
                    hub={item}
                    collapsed={isCollapsed}
                    expanded={openHubId === item.id}
                    containsActive={activeHubId === item.id}
                    badgeFor={badgeFor}
                    onToggle={toggleHub}
                    onNavigate={isMobile ? onCloseMobile : undefined}
                  />
                ) : (
                  <SidebarLink
                    key={item.path}
                    item={item}
                    collapsed={isCollapsed}
                    badge={badgeFor(item)}
                    onNavigate={isMobile ? onCloseMobile : undefined}
                  />
                )
              ))}
            </SidebarSection>
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
