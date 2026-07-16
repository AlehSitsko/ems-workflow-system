import { useCallback, useEffect } from "react";
import { Link, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { FaChevronLeft } from "react-icons/fa";

import { useConfirm } from "../ui/useConfirm";

/**
 * EntityWorkspace — the standard full-page layout for a complex entity.
 *
 * Use this (not a drawer) when an entity has multiple tabs, documents, history,
 * analytics or related records. See docs/UI_STANDARD.md for the
 * Drawer vs Modal vs Full Page decision rules.
 *
 * What it provides:
 *   * a canonical, shareable URL per entity, with the active tab in `?tab=`
 *     so a deep link lands on the right tab and browser back/forward work;
 *   * back-to-list that restores the list's filters/search (the list passes its
 *     own query string via location state; a direct deep link falls back to the
 *     bare list URL);
 *   * loading / error / not-found / permission states, so callers never invent
 *     their own;
 *   * unsaved-changes protection.
 *
 * Unsaved-changes caveat: this guards the workspace's own back link and tab
 * switches, plus a full page unload. It cannot block navigation from the
 * sidebar, because react-router's useBlocker needs a data router and this app
 * still mounts a component <HashRouter>. Migrating to createHashRouter is
 * tracked in TODO.md.
 */
export default function EntityWorkspace({
  backTo,
  backLabel = "Back",
  title,
  subtitle,
  icon,
  badges,
  actions,
  tabs = [],
  loading = false,
  error = null,
  notFound = false,
  canView = true,
  dirty = false,
  children,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const confirm = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();

  // The list page hands its query string over so "back" returns to the same
  // filters/search/page the user left.
  const listSearch = location.state?.listSearch || "";
  const backHref = `${backTo}${listSearch}`;

  const activeTab = searchParams.get("tab") || tabs[0]?.key;

  // Warn on reload/close while there are unsaved edits.
  useEffect(() => {
    if (!dirty) return undefined;
    const handler = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const confirmDiscard = useCallback(async () => {
    if (!dirty) return true;
    return confirm({
      title: "Discard unsaved changes?",
      message: "Your changes on this tab have not been saved.",
      variant: "warning",
      confirmLabel: "Discard",
    });
  }, [dirty, confirm]);

  const handleTabChange = async (key) => {
    if (key === activeTab) return;
    if (!(await confirmDiscard())) return;
    // replace: switching tabs shouldn't stack history entries, but the tab
    // still lives in the URL so the view stays shareable.
    setSearchParams({ tab: key }, { replace: true });
  };

  const handleBack = async (e) => {
    e.preventDefault();
    if (!(await confirmDiscard())) return;
    navigate(backHref);
  };

  const backLink = (
    <Link to={backHref} onClick={handleBack} className="workspace-back">
      <FaChevronLeft aria-hidden="true" /> {backLabel}
    </Link>
  );

  if (!canView) {
    return (
      <div className="page-stack">
        {backLink}
        <section className="content-panel">
          <div className="empty-state">
            <h5>Not available</h5>
            <p>You don&apos;t have permission to view this record.</p>
          </div>
        </section>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="page-stack">
        {backLink}
        <section className="content-panel"><p className="text-muted mb-0">Loading…</p></section>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="page-stack">
        {backLink}
        <section className="content-panel">
          <div className="empty-state">
            <h5>Not found</h5>
            <p>This record doesn&apos;t exist, or it has been removed.</p>
          </div>
        </section>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-stack">
        {backLink}
        <section className="content-panel">
          <div className="alert alert-danger mb-0" role="alert">{error}</div>
        </section>
      </div>
    );
  }

  return (
    <div className="page-stack">
      {backLink}

      <div className="workspace-header">
        {icon && <span className="workspace-icon">{icon}</span>}
        <div className="workspace-identity">
          {/* Name, identifier, capability and status stay four separate things —
              gluing them into one title would lose all four meanings. */}
          <h2 className="workspace-title">{title}</h2>
          {subtitle && <p className="workspace-subtitle">{subtitle}</p>}
          {badges && <span className="workspace-badges">{badges}</span>}
        </div>
        {actions && <div className="workspace-actions">{actions}</div>}
      </div>

      {tabs.length > 0 && (
        <div className="workspace-tabs" role="tablist" aria-label={`${title} sections`}>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
              disabled={tab.disabled}
              // The reason lives in the tooltip/accessible name, not as a "soon"
              // word glued inside the label.
              title={tab.disabledReason || undefined}
              aria-description={tab.disabled ? tab.disabledReason : undefined}
              className={`workspace-tab${activeTab === tab.key ? " active" : ""}`}
              onClick={() => handleTabChange(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      <div className="workspace-body">
        {typeof children === "function" ? children(activeTab) : children}
      </div>
    </div>
  );
}
