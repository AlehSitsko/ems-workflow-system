import { NavLink } from "react-router-dom";

/**
 * Local navigation for the pages of one hub.
 *
 * Rendered by the shell above the page, so a hub is a layout rather than a
 * rewrite: every page inside it stays a self-contained component with its own
 * route, directly openable and bookmarkable. Nothing was merged into a monolith
 * to make the grouping appear.
 *
 * Tabs come from the same navigation tree the sidebar uses, already filtered by
 * permission, so a tab can never open something the sidebar would have hidden.
 */
export default function ModuleTabs({ hub, badgeFor, actions }) {
  if (!hub) return null;

  return (
    <div className="module-tabs">
      <nav className="module-tabs-list" aria-label={`${hub.label} sections`}>
        {hub.children.map((child) => {
          const waiting = badgeFor ? badgeFor(child) : 0;
          return (
            <NavLink
              key={child.path}
              to={child.path}
              className={({ isActive }) => `module-tab${isActive ? " active" : ""}`}
              aria-label={waiting ? `${child.label}, ${waiting} waiting` : undefined}
            >
              {child.label}
              {waiting > 0 && (
                <span className="module-tab-badge">{waiting > 99 ? "99+" : waiting}</span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {actions && <div className="module-tabs-actions">{actions}</div>}
    </div>
  );
}
