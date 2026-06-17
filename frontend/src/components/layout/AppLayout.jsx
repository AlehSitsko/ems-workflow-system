import React from "react";

import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import PushNotificationBanner from "./PushNotificationBanner";
import { useNotifications } from "../../hooks/useNotifications";
import { usePushNotifications } from "../../hooks/usePushNotifications";

function AppLayout({ currentUser, onLogout, children }) {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications(currentUser);
  const { showBanner, subscribe, dismiss } = usePushNotifications(currentUser);

  return (
    <div className="app-shell">
      <Sidebar currentUser={currentUser} />

      <div className="app-main">
        <Topbar
          currentUser={currentUser}
          onLogout={onLogout}
          notifications={notifications}
          unreadCount={unreadCount}
          markRead={markRead}
          markAllRead={markAllRead}
        />

        <main className="app-content">
          {children}
        </main>
      </div>

      {showBanner && (
        <PushNotificationBanner onEnable={subscribe} onDismiss={dismiss} />
      )}
    </div>
  );
}

export default AppLayout;