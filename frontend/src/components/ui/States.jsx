import { FaExclamationTriangle, FaInbox, FaLock, FaRedo, FaSearch } from "react-icons/fa";

/**
 * The four states every data surface has to be able to show.
 *
 * These were previously re-invented per page (20 ad-hoc `alert-danger` blocks,
 * 11 hand-rolled empty states, 9 bare "Loading..." strings), which is how
 * "nothing here" and "your filters matched nothing" and "we failed to load"
 * ended up looking identical. Keeping them apart is the point: they need
 * different words and different recovery actions.
 */

/**
 * Nothing to show. `variant` distinguishes the reasons, because "add your first
 * vehicle" and "no vehicle matches this filter" are different problems.
 *   "empty"      — the collection is genuinely empty
 *   "no-results" — filters/search excluded everything
 *   "forbidden"  — the user may not see this
 */
export function EmptyState({
  variant = "empty",
  title,
  description,
  icon,
  action,
}) {
  const fallbackIcon = {
    empty: <FaInbox />,
    "no-results": <FaSearch />,
    forbidden: <FaLock />,
  }[variant] || <FaInbox />;

  return (
    <div className="state-panel" role="status">
      <span className="state-icon" aria-hidden="true">{icon || fallbackIcon}</span>
      <h3 className="state-title">{title}</h3>
      {description && <p className="state-description">{description}</p>}
      {action && <div className="state-action">{action}</div>}
    </div>
  );
}

/**
 * Loading failed. Always says what failed and offers a way out — a dead end
 * with no retry is how users end up reloading the whole app.
 */
export function ErrorState({ title = "Couldn't load this", message, onRetry }) {
  return (
    <div className="state-panel error" role="alert">
      <span className="state-icon" aria-hidden="true"><FaExclamationTriangle /></span>
      <h3 className="state-title">{title}</h3>
      {message && <p className="state-description">{message}</p>}
      {onRetry && (
        <div className="state-action">
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onRetry}>
            <FaRedo aria-hidden="true" /> Try again
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Placeholder shaped like the content that is coming, so the layout does not
 * jump when it arrives.
 *
 * `aria-busy` + a polite live region means a screen reader is told the region is
 * loading rather than just hearing nothing.
 */
export function LoadingSkeleton({ variant = "list", rows = 3, label = "Loading" }) {
  const items = Array.from({ length: rows }, (_, i) => i);

  return (
    <div className={`skeleton skeleton-${variant}`} aria-busy="true" aria-live="polite" aria-label={label}>
      {items.map((i) => (
        <div className="skeleton-item" key={i}>
          <div className="skeleton-line skeleton-line-title" />
          <div className="skeleton-line skeleton-line-body" />
          <div className="skeleton-line skeleton-line-short" />
        </div>
      ))}
      <span className="visually-hidden">{label}…</span>
    </div>
  );
}
