import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import Sidebar from "./Sidebar";
import { useAttentionCounts } from "../../hooks/useAttentionCounts";
import AppHeader from "./AppHeader";
import PageContainer from "./PageContainer";
import PushNotificationBanner from "./PushNotificationBanner";
import { useNotifications } from "../../hooks/useNotifications";
import { usePushNotifications } from "../../hooks/usePushNotifications";
import { useIsMobileNav } from "../../hooks/useMediaQuery";
import { useUserSettings } from "../../context/useUserSettings";
import { getRouteMetadata } from "../../config/routeMetadata";

const SIDEBAR_ID = "app-sidebar";

/**
 * The single shell every page inside the app renders into: sidebar, header and
 * the content area. Pages supply only their content — the chrome (title,
 * subtitle, width mode, navigation) is derived from routeMetadata, so a page
 * cannot drift from the rest of the app.
 *
 * Login and the kiosk deliberately render outside this shell.
 */
function AppShell({ currentUser, onLogout, children }) {
  const location = useLocation();
  const meta = getRouteMetadata(location.pathname);

  const { notifications, unreadCount, markRead, markAllRead } = useNotifications(currentUser);
  const { showBanner, subscribe, dismiss } = usePushNotifications(currentUser);

  const isMobile = useIsMobileNav();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const hamburgerRef = useRef(null);

  const { settings, updateSettings } = useUserSettings();
  const collapsed = !!settings?.ui?.sidebarCollapsed;

  // Persisted per user, so the layout a user chose survives a reload and
  // follows them between sessions.
  const toggleCollapse = useCallback(() => {
    updateSettings({ ui: { sidebarCollapsed: !collapsed } });
  }, [collapsed, updateSettings]);

  const closeMobileNav = useCallback(() => {
    setMobileNavOpen(false);
    // Send focus back where it came from, or the user is dropped at the top of
    // the document with no idea where they are.
    hamburgerRef.current?.focus();
  }, []);

  // Navigating away closes the overlay — otherwise it stays over the page the
  // user just asked for.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  // Leaving the mobile breakpoint (rotate/resize) must not strand an open
  // overlay on a desktop layout that already shows the sidebar.
  useEffect(() => {
    if (!isMobile) setMobileNavOpen(false);
  }, [isMobile]);

  // Work sitting in queues that appear on no board — surfaced as badges so it
  // cannot accumulate unnoticed.
  const { counts: attentionCounts } = useAttentionCounts(currentUser);

  return (
    <div className={`app-shell${collapsed && !isMobile ? " sidebar-collapsed" : ""}`}>
      <Sidebar
        id={SIDEBAR_ID}
        currentUser={currentUser}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapse}
        isMobile={isMobile}
        mobileOpen={mobileNavOpen}
        onCloseMobile={closeMobileNav}
        attentionCounts={attentionCounts}
      />

      <div className="app-main">
        <AppHeader
          ref={hamburgerRef}
          meta={meta}
          currentUser={currentUser}
          onLogout={onLogout}
          notifications={notifications}
          unreadCount={unreadCount}
          markRead={markRead}
          markAllRead={markAllRead}
          isMobile={isMobile}
          mobileNavOpen={mobileNavOpen}
          onToggleMobileNav={() => setMobileNavOpen((v) => !v)}
          sidebarId={SIDEBAR_ID}
        />

        <main className="app-content" id="main-content">
          <PageContainer width={meta.width}>{children}</PageContainer>
        </main>
      </div>

      {showBanner && (
        <PushNotificationBanner onEnable={subscribe} onDismiss={dismiss} />
      )}
    </div>
  );
}

export default AppShell;
