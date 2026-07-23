import { NavLink } from "react-router-dom";
import { FaChevronDown } from "react-icons/fa";

/**
 * The pieces the sidebar's two-level navigation is built from.
 *
 * Structure and permissions arrive already resolved from routeMetadata — nothing
 * here decides what a user may see, it only decides how it looks.
 */

/** A waiting-work count. Absent at zero: "nothing waiting" reads better as no badge. */
function NavBadge({ count, collapsed }) {
  if (!count) return null;
  if (collapsed) return <span className="sidebar-badge-dot" />;
  return <span className="sidebar-badge">{count > 99 ? "99+" : count}</span>;
}

/** One navigable page. `depth` indents it under a hub. */
export function SidebarLink({ item, collapsed, depth = 0, badge = 0, onNavigate }) {
  const Icon = item.icon;
  const label = item.label;

  return (
    <NavLink
      to={item.path}
      end={item.path === "/home"}
      className={({ isActive }) =>
        `sidebar-link${depth ? " sidebar-link-child" : ""}${isActive ? " active" : ""}`
      }
      // Collapsed hides the label, so it has to survive as the tooltip and the
      // accessible name.
      title={collapsed ? `${label}${badge ? ` — ${badge} waiting` : ""}` : undefined}
      aria-label={badge ? `${label}, ${badge} waiting` : (collapsed ? label : undefined)}
      onClick={onNavigate}
    >
      <span className="sidebar-link-icon">
        <Icon />
        {collapsed && <NavBadge count={badge} collapsed />}
      </span>
      <span className="sidebar-link-label">{label}</span>
      {!collapsed && <NavBadge count={badge} collapsed={false} />}
    </NavLink>
  );
}

/**
 * A parent with a submenu.
 *
 * It is a real <button>, not a hovered div: hover cannot be used on a touch
 * screen and cannot be reached from a keyboard. Expansion is an accordion — one
 * open hub at a time keeps the sidebar short, which is the point of having hubs.
 */
export function SidebarHub({
  hub, collapsed, expanded, containsActive, badgeFor, onToggle, onNavigate,
}) {
  const Icon = hub.icon;
  const submenuId = `sidebar-hub-${hub.id}`;
  // A closed hub still has to show that something inside it needs attention.
  const rolledUpBadge = hub.children.reduce((sum, child) => sum + badgeFor(child), 0);

  return (
    <div className={`sidebar-hub${expanded ? " expanded" : ""}`}>
      <button
        type="button"
        className={`sidebar-link sidebar-hub-toggle${containsActive ? " contains-active" : ""}`}
        onClick={() => onToggle(hub.id)}
        aria-expanded={collapsed ? undefined : expanded}
        aria-controls={collapsed ? undefined : submenuId}
        title={collapsed ? `${hub.label}${rolledUpBadge ? ` — ${rolledUpBadge} waiting` : ""}` : undefined}
        aria-label={rolledUpBadge ? `${hub.label}, ${rolledUpBadge} waiting` : hub.label}
      >
        <span className="sidebar-link-icon">
          <Icon />
          <NavBadge count={collapsed ? rolledUpBadge : 0} collapsed />
        </span>
        <span className="sidebar-link-label">{hub.label}</span>
        {!expanded && <NavBadge count={rolledUpBadge} collapsed={false} />}
        <FaChevronDown className="sidebar-hub-chevron" aria-hidden="true" />
      </button>

      {/* Collapsed to a rail there is no room for child labels, so the submenu
          is not rendered at all; pressing the parent expands the sidebar and
          opens it (see Sidebar). That beats a flyout that has to be re-solved
          for touch, keyboard and screen readers. */}
      {!collapsed && expanded && (
        <div className="sidebar-submenu" id={submenuId} role="group" aria-label={hub.label}>
          {hub.children.map((child) => (
            <SidebarLink
              key={child.path}
              item={child}
              collapsed={false}
              depth={1}
              badge={badgeFor(child)}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** One titled section. The title is a quiet label, never a control. */
export function SidebarSection({ section, children }) {
  return (
    <div className="sidebar-group">
      {section.title && <div className="sidebar-group-title">{section.title}</div>}
      {children}
    </div>
  );
}
