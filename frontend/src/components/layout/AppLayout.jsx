import React from "react";

import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import { useNotifications } from "../../hooks/useNotifications";

function AppLayout({ currentUser, onLogout, children }) {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications(currentUser);

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
    </div>
  );
}

export default AppLayout;