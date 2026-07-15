import { forwardRef } from "react";
import { Link } from "react-router-dom";
import { FaBars, FaPhoneAlt } from "react-icons/fa";

import { hasCallIntakeAccess } from "../../api/authApi";
import NotificationBell from "./NotificationBell";
import UserMenu from "./UserMenu";
import ThemeControl from "./ThemeControl";

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
          <h1 className="app-header-title">{meta.title}</h1>
          {meta.subtitle && <p className="app-header-subtitle">{meta.subtitle}</p>}
        </div>
      </div>

      {/* Center slot is reserved for the Global Search / command palette trigger.
          It is intentionally empty until that is real — a disabled search box
          that does nothing is worse than no search box. */}
      <div className="app-header-center" />

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
