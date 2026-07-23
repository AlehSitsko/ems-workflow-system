import { forwardRef } from "react";
import { Link } from "react-router-dom";
import { FaBars, FaPhoneAlt } from "react-icons/fa";

import { hasCallIntakeAccess } from "../../api/authApi";
import NotificationBell from "./NotificationBell";
import UserMenu from "./UserMenu";
import ThemeControl from "./ThemeControl";
import CommandPalette from "./CommandPalette";

/**
 * The one header every page inside the shell renders.
 *
 * Title/subtitle come from routeMetadata — a page never declares its own
 * chrome, and the product name is never shown here (it already lives in the
 * sidebar).
 *
 * The hamburger exists on mobile only: on desktop the sidebar is permanent and
 * its collapse control lives in the sidebar footer, so a second control here
 * would be a duplicate.
 */
const AppHeader = forwardRef(function AppHeader(
  {
    meta,
    currentUser,
    onLogout,
    notifications,
    unreadCount,
    markRead,
    markAllRead,
    isMobile,
    mobileNavOpen,
    onToggleMobileNav,
    sidebarId,
    breadcrumb,
  },
  hamburgerRef,
) {
  return (
    <header className="app-header">
      <div className="app-header-left">
        {isMobile && (
          <button
            type="button"
            ref={hamburgerRef}
            className="app-header-menu-button"
            onClick={onToggleMobileNav}
            aria-label={mobileNavOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={mobileNavOpen}
            aria-controls={sidebarId}
          >
            <FaBars />
          </button>
        )}

        <div className="app-header-titles">
          {/* Only for pages nested inside a hub — on a top-level page it would
              be a line of chrome restating the title. It never replaces the
              title, it says where the title sits. */}
          {breadcrumb && (
            <p className="app-header-breadcrumb">
              {breadcrumb.map((crumb, i) => (
                <span key={crumb}>
                  {i > 0 && <span className="app-header-breadcrumb-sep" aria-hidden="true"> / </span>}
                  {crumb}
                </span>
              ))}
            </p>
          )}
          <h1 className="app-header-title">{meta.title}</h1>
          {meta.subtitle && <p className="app-header-subtitle">{meta.subtitle}</p>}
        </div>
      </div>

      {/* Global search / command palette — the trigger lives here; the overlay
          it opens is rendered in a portal-like fixed layer by the component. */}
      <div className="app-header-center">
        <CommandPalette currentUser={currentUser} />
      </div>

      <div className="app-header-right">
        {hasCallIntakeAccess(currentUser) && (
          <Link to="/call-form" className="btn app-header-call-button">
            <FaPhoneAlt />
            <span className="app-header-call-label">Start Taking Call</span>
          </Link>
        )}

        <NotificationBell
          notifications={notifications}
          unreadCount={unreadCount}
          markRead={markRead}
          markAllRead={markAllRead}
        />

        <ThemeControl />

        <UserMenu currentUser={currentUser} onLogout={onLogout} />
      </div>
    </header>
  );
});

export default AppHeader;
