import { FaStarOfLife, FaSignOutAlt } from "react-icons/fa";

// The employee portal's own shell — deliberately not the ops AppShell. There is
// no operational sidebar because an employee has no operational surface; just a
// slim top bar with who they are and a way out.
export default function PortalLayout({ currentUser, onLogout, children }) {
  return (
    <div className="portal-shell" style={{ minHeight: "100vh", background: "var(--ems-bg, #0f1420)" }}>
      <header
        className="d-flex align-items-center justify-content-between px-3 py-2"
        style={{ borderBottom: "1px solid var(--ems-border, #2a3347)", background: "var(--ems-surface, #151b2b)" }}
      >
        <div className="d-flex align-items-center gap-2">
          <FaStarOfLife style={{ color: "var(--ems-danger, #e5484d)" }} aria-hidden="true" />
          <strong style={{ color: "var(--ems-text-primary)" }}>EMS Workflow</strong>
          <span className="text-secondary d-none d-sm-inline">Employee Portal</span>
        </div>
        <div className="d-flex align-items-center gap-3">
          <span style={{ color: "var(--ems-text-secondary)" }}>{currentUser?.display_name}</span>
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-2"
            onClick={onLogout}
          >
            <FaSignOutAlt aria-hidden="true" /> Sign out
          </button>
        </div>
      </header>

      <main className="container py-4" style={{ maxWidth: 920 }}>
        {children}
      </main>
    </div>
  );
}
