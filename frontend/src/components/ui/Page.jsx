import { FaSearch, FaTimes } from "react-icons/fa";

/**
 * Standard page composition pieces.
 *
 * Every list page is: PageHeader -> PageToolbar (filters) -> results ->
 * footer. Previously each page hand-rolled its own `content-panel-header`
 * (18 files did), which is why titles, counts and primary actions sat in
 * slightly different places on every screen.
 */

/**
 * Page title block. The count is deliberately part of the header rather than
 * floating above the results — "6 vehicles" is information about the page.
 */
export function PageHeader({ title, description, count, actions }) {
  return (
    <header className="page-header">
      <div className="page-header-text">
        {/* h1 belongs to the app header; a page's own title is the next level
            down, so the heading order stays valid. */}
        <h2 className="page-header-title">{title}</h2>
        {description && <p className="page-header-description">{description}</p>}
        {count != null && (
          <p className="page-header-count" aria-live="polite">{count}</p>
        )}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </header>
  );
}

/** A titled card section. Use inside pages and workspace tabs. */
export function PageSection({ title, description, actions, children, className = "" }) {
  return (
    <section className={`page-section ${className}`.trim()}>
      {(title || actions) && (
        <div className="page-section-header">
          <div>
            {title && <h3 className="page-section-title">{title}</h3>}
            {description && <p className="page-section-description">{description}</p>}
          </div>
          {actions && <div className="page-section-actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * Filter/search bar. Controls inside share one height so the row reads as a
 * single band rather than a pile of mismatched inputs.
 */
export function PageToolbar({ children, onClear, canClear = false }) {
  return (
    <div className="page-toolbar" role="search">
      {children}
      {onClear && (
        <button
          type="button"
          className="btn btn-outline-secondary page-toolbar-clear"
          onClick={onClear}
          disabled={!canClear}
          // Disabled only when there is genuinely nothing to clear — a control
          // that is always disabled would be decoration.
          title={canClear ? "Clear all filters" : "No filters applied"}
        >
          <FaTimes aria-hidden="true" /> Clear
        </button>
      )}
    </div>
  );
}

/** One labelled control in a toolbar. */
export function ToolbarField({ label, htmlFor, children, grow = false }) {
  return (
    <div className={`toolbar-field${grow ? " grow" : ""}`}>
      <label className="toolbar-label" htmlFor={htmlFor}>{label}</label>
      {children}
    </div>
  );
}

/** Text search input with an affordance to clear it. */
export function SearchInput({ id, value, onChange, placeholder = "Search", label }) {
  return (
    <div className="search-input">
      <FaSearch className="search-input-icon" aria-hidden="true" />
      <input
        id={id}
        type="search"
        className="form-control"
        value={value}
        placeholder={placeholder}
        aria-label={label || placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
