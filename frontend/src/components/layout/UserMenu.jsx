import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaChevronDown, FaCog, FaSignOutAlt } from "react-icons/fa";

// Extracted from Topbar so the header is composition rather than one long file.
// Styling moved to App.css (design tokens) instead of inline style objects.

function MenuItem({ icon, label, onClick, danger }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`user-menu-item${danger ? " danger" : ""}`}
      role="menuitem"
    >
      <span className="user-menu-item-icon">{icon}</span>
      {label}
    </button>
  );
}

export default function UserMenu({ currentUser, onLogout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const triggerRef = useRef(null);
  const navigate = useNavigate();

  const initials = (currentUser?.display_name || "User")
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map((p) => p[0].toUpperCase()).join("") || "U";

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const action = (fn) => () => { setOpen(false); fn(); };

  return (
    <div ref={ref} className="user-menu">
      <button
        type="button"
        ref={triggerRef}
        className={`user-menu-trigger${open ? " open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-label="User menu"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="user-menu-avatar" aria-hidden="true">{initials}</span>
        <span className="user-menu-identity">
          <span className="user-menu-name">{currentUser?.display_name || "User"}</span>
          <span className="user-menu-role">{currentUser?.role || "unknown"}</span>
        </span>
        <FaChevronDown className={`user-menu-chevron${open ? " open" : ""}`} aria-hidden="true" />
      </button>

      {open && (
        <div className="user-menu-dropdown" role="menu">
          <div className="user-menu-header">
            <div className="user-menu-name">{currentUser?.display_name || "User"}</div>
            <div className="user-menu-role">{currentUser?.role || "unknown"}</div>
            {currentUser?.organization?.name && (
              <div className="user-menu-org">{currentUser.organization.name}</div>
            )}
          </div>

          <div className="user-menu-section">
            <MenuItem
              icon={<FaCog />}
              label="Settings"
              onClick={action(() => navigate("/notifications"))}
            />
          </div>

          <div className="user-menu-section bordered">
            <MenuItem icon={<FaSignOutAlt />} label="Log out" danger onClick={action(onLogout)} />
          </div>
        </div>
      )}
    </div>
  );
}
