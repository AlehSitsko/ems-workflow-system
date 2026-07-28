/**
 * Home dashboard defaults and resolution.
 *
 * The quick-link shortcuts and widget set live here — not inside HomePage — so
 * the dashboard and the settings editor that customises it read the exact same
 * source. Paths only; the label, icon and permission still come from the
 * navigation tree, so a shortcut can never point somewhere the sidebar hides.
 */

// The handful of places a role goes most, in priority order. The user can
// override this per-account (settings.dashboard.quickLinks).
export const QUICK_LINKS_BY_ROLE = {
  admin:      ["/dispatch", "/scheduling-inbox", "/confirmation-round", "/calendar", "/employees"],
  supervisor: ["/dispatch", "/day-closeout", "/crew-planner", "/compliance", "/supervisor"],
  dispatcher: ["/dispatch", "/scheduling-inbox", "/confirmation-round", "/crew-planner", "/calendar"],
  hr:         ["/employees", "/compliance", "/leave", "/payroll", "/tasks"],
};

// The dashboard cards a user may hide. "Needs attention" is the point of the
// page, so it is deliberately absent — it cannot be hidden.
export const HIDEABLE_WIDGETS = [
  ["quickLinks", "Shortcuts"],
  ["todayBoard", "Today's board"],
  ["tasks", "My tasks"],
];

/** The role's default shortcut paths (empty for an unknown role). */
export function roleQuickLinks(role) {
  return QUICK_LINKS_BY_ROLE[role] || [];
}

/**
 * The shortcut paths to show: the user's chosen list when set, else the role
 * default. Never widens access — HomePage still intersects this with the links
 * the user may actually open.
 */
export function resolveQuickLinkPaths(role, dashboardSettings) {
  const custom = dashboardSettings?.quickLinks;
  return Array.isArray(custom) ? custom : roleQuickLinks(role);
}

/** Is a widget hidden by the user's settings? */
export function isWidgetHidden(dashboardSettings, key) {
  return Array.isArray(dashboardSettings?.hiddenWidgets)
    && dashboardSettings.hiddenWidgets.includes(key);
}
