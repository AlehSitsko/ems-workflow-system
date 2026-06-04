import React from "react";

import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

function AppLayout({ currentUser, onLogout, children }) {
  return (
    <div className="app-shell">
      <Sidebar currentUser={currentUser} />

      <div className="app-main">
        <Topbar currentUser={currentUser} onLogout={onLogout} />

        <main className="app-content">
          {children}
        </main>
      </div>
    </div>
  );
}

export default AppLayout;