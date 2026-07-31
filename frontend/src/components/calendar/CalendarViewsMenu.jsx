import { FaChevronDown, FaTimes } from "react-icons/fa";

// Saved calendar views: named presets of the display prefs (sources, week start,
// density, weekend/holiday markers) plus the view mode. A native <details> is the
// dropdown — no click-outside handling, and it is keyboard/screen-reader friendly.
export default function CalendarViewsMenu({ savedViews, onApply, onSaveCurrent, onDelete }) {
  return (
    <details className="calendar-views-menu">
      <summary className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1">
        Views <FaChevronDown size={10} aria-hidden="true" />
      </summary>
      <div className="calendar-views-dropdown" role="menu">
        {savedViews.length === 0 ? (
          <div className="calendar-views-empty">No saved views yet</div>
        ) : (
          savedViews.map((v) => (
            <div key={v.id} className="calendar-views-row">
              <button type="button" className="calendar-views-apply" onClick={() => onApply(v)}>
                {v.name}
              </button>
              <button
                type="button"
                className="calendar-views-delete"
                onClick={() => onDelete(v)}
                aria-label={`Delete view ${v.name}`}
                title="Delete"
              >
                <FaTimes size={11} />
              </button>
            </div>
          ))
        )}
        <hr className="calendar-views-sep" />
        <button type="button" className="calendar-views-save" onClick={onSaveCurrent}>
          + Save current view…
        </button>
      </div>
    </details>
  );
}
