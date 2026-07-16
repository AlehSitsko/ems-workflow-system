import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FaEllipsisV } from "react-icons/fa";

/**
 * Entity display primitives — one card foundation instead of a near-identical
 * bespoke card per page.
 */

/** A KPI tile. `to` makes the whole tile a link to the filtered view. */
export function StatCard({ label, value, tone = "neutral", icon, to, loading = false }) {
  const body = (
    <>
      <div className="stat-card-head">
        <span className={`stat-card-value tone-${tone}`}>
          {loading ? <span className="skeleton-line skeleton-line-short" /> : value}
        </span>
        {icon && <span className="stat-card-icon" aria-hidden="true">{icon}</span>}
      </div>
      <div className="stat-card-label">{label}</div>
    </>
  );

  if (to) {
    return <Link to={to} className="stat-card interactive">{body}</Link>;
  }
  return <div className="stat-card">{body}</div>;
}

/** Responsive grid for entity cards: 3 up on desktop, 2 on tablet, 1 on phone. */
export function EntityGrid({ children, columns = 3 }) {
  return <div className={`entity-grid cols-${columns}`}>{children}</div>;
}

/** Vertical list for compact rows. */
export function EntityList({ children }) {
  return <div className="entity-list">{children}</div>;
}

/**
 * The shared card shell. A card is one navigable thing: the whole card is the
 * link, and interactive controls inside it (like the overflow menu) stop the
 * click from bubbling so they do not also navigate.
 */
export function EntityCard({ to, onClick, ariaLabel, className = "", children }) {
  const classes = `entity-card ${className}`.trim();

  if (to) {
    return (
      <Link to={to} className={classes} aria-label={ariaLabel}>
        {children}
      </Link>
    );
  }
  return (
    <div
      className={classes}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={ariaLabel}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter") onClick(e); } : undefined}
    >
      {children}
    </div>
  );
}

/** A labelled value row inside a card — icon, label, value. */
export function EntityField({ icon, label, value }) {
  return (
    <div className="entity-field">
      <span className="entity-field-label">
        {icon && <span className="entity-field-icon" aria-hidden="true">{icon}</span>}
        {label}
      </span>
      <span className="entity-field-value">{value ?? "—"}</span>
    </div>
  );
}

/**
 * Overflow ("kebab") menu.
 *
 * Items may be `disabled` with a `disabledReason`: a permission-blocked action
 * is shown disabled with the reason when knowing it matters, and simply omitted
 * when it does not. Either way the frontend is a convenience — the API is the
 * boundary.
 */
export function OverflowMenu({ items = [], label = "More actions" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") { setOpen(false); triggerRef.current?.focus(); }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!items.length) return null;

  return (
    <div
      className="overflow-menu"
      ref={ref}
      // The card around this is often a link; a click on the menu must not
      // navigate as well.
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
    >
      <button
        type="button"
        ref={triggerRef}
        className="overflow-menu-trigger"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <FaEllipsisV />
      </button>

      {open && (
        <div className="overflow-menu-dropdown" role="menu">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={`overflow-menu-item${item.danger ? " danger" : ""}`}
              disabled={item.disabled}
              title={item.disabled ? item.disabledReason : undefined}
              onClick={() => { setOpen(false); item.onClick?.(); }}
            >
              {item.icon && <span className="overflow-menu-icon" aria-hidden="true">{item.icon}</span>}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** "Showing 1 to 6 of 6" + page controls. */
export function Pagination({ page, perPage, total, onPageChange }) {
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  if (total === 0) return null;

  const first = (page - 1) * perPage + 1;
  const last = Math.min(page * perPage, total);

  return (
    <nav className="pagination-bar" aria-label="Pagination">
      <p className="pagination-summary" aria-live="polite">
        Showing {first} to {last} of {total}
      </p>
      <div className="pagination-controls">
        <button
          type="button"
          className="btn btn-outline-secondary btn-sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
        >
          Previous
        </button>
        <span className="pagination-page" aria-current="page">{page}</span>
        <button
          type="button"
          className="btn btn-outline-secondary btn-sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
        >
          Next
        </button>
      </div>
    </nav>
  );
}

/** Progressive "load more" for endpoints that page by cursor/offset. */
export function LoadMore({ loaded, total, loading, onLoadMore }) {
  if (loaded >= total) return null;
  return (
    <div className="load-more">
      <button
        type="button"
        className="btn btn-outline-secondary"
        onClick={onLoadMore}
        disabled={loading}
      >
        {loading ? "Loading…" : `Load more (${loaded} of ${total})`}
      </button>
    </div>
  );
}

/**
 * Chronological activity feed.
 *
 * Entries render a human date — raw ISO timestamps are for machines, and a
 * feed that reads "2026-07-15T08:15:03" is a feed nobody scans.
 */
export function ActivityTimeline({ entries = [], emptyLabel = "No recorded activity yet." }) {
  if (!entries.length) {
    return <p className="text-muted mb-0">{emptyLabel}</p>;
  }
  return (
    <ol className="activity-timeline">
      {entries.map((entry) => (
        <li className="activity-item" key={entry.id}>
          <span className={`activity-marker tone-${entry.tone || "neutral"}`} aria-hidden="true">
            {entry.icon}
          </span>
          <div className="activity-body">
            <p className="activity-title">{entry.title}</p>
            <p className="activity-meta">
              {entry.timestamp}
              {entry.actor && <> · {entry.actor}</>}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
