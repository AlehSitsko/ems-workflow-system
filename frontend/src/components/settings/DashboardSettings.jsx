import { FaThLarge, FaArrowUp, FaArrowDown, FaUndo } from "react-icons/fa";

import { HIDEABLE_WIDGETS } from "../../config/dashboardDefaults";

// Per-user Home dashboard preferences (settings.dashboard). Lets a user hide
// dashboard cards and pick / reorder their shortcut tiles. Paths only — the
// label and permission still come from the nav tree, so this can never surface a
// link the user may not open.

const MAX_LINKS = 8;

function Switch({ id, label, checked, onChange, disabled }) {
  return (
    <div className="form-check form-switch">
      <input
        type="checkbox"
        className="form-check-input"
        role="switch"
        id={id}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <label className="form-check-label" htmlFor={id} style={{ fontSize: 14, color: "var(--ems-text-primary)" }}>
        {label}
      </label>
    </div>
  );
}

/**
 * @param value        {quickLinks: string[]|null, hiddenWidgets: string[]}
 * @param allowedLinks nav items the user may open: [{path, title, subtitle, icon}]
 * @param roleDefaults the role's default shortcut paths (used when quickLinks is null)
 * @param onChange     (nextValue) => void
 */
function DashboardSettings({ value, allowedLinks, roleDefaults, onChange }) {
  const hidden = value.hiddenWidgets || [];
  const selected = Array.isArray(value.quickLinks) ? value.quickLinks : roleDefaults;
  const isCustom = Array.isArray(value.quickLinks);

  const byPath = new Map(allowedLinks.map((l) => [l.path, l]));
  const selectedItems = selected.map((p) => byPath.get(p)).filter(Boolean);
  const restItems = allowedLinks.filter((l) => !selected.includes(l.path));

  const setWidgetShown = (key, shown) => {
    const next = shown ? hidden.filter((k) => k !== key) : [...new Set([...hidden, key])];
    onChange({ ...value, hiddenWidgets: next });
  };

  // Editing shortcuts always writes an explicit list (materialising the role
  // default on first edit), so what the user sees is what gets saved.
  const baseList = () => (isCustom ? [...value.quickLinks] : [...roleDefaults]).filter((p) => byPath.has(p));

  const toggleLink = (path, include) => {
    const list = baseList();
    const next = include
      ? (list.includes(path) ? list : [...list, path])
      : list.filter((p) => p !== path);
    onChange({ ...value, quickLinks: next });
  };

  const move = (path, dir) => {
    const list = baseList();
    const i = list.indexOf(path);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    onChange({ ...value, quickLinks: list });
  };

  const resetLinks = () => onChange({ ...value, quickLinks: null });

  const atCap = selectedItems.length >= MAX_LINKS;

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#6c757d", letterSpacing: 1, marginBottom: 10, textTransform: "uppercase" }}>
        Dashboard
      </div>

      {/* Widgets */}
      <div style={{ padding: "10px 0", borderBottom: "1px solid #2a3347" }}>
        <div className="d-flex align-items-center gap-2 mb-2">
          <FaThLarge style={{ color: "var(--ems-text-secondary)", fontSize: 13 }} />
          <span style={{ fontSize: 14, color: "var(--ems-text-primary)" }}>Cards</span>
        </div>
        <div style={{ fontSize: 12, color: "#6c757d", marginBottom: 10 }}>
          Hide cards you don&apos;t use. &quot;Needs attention&quot; is always shown — it is the point of the page.
        </div>
        <div className="row g-1">
          {HIDEABLE_WIDGETS.map(([key, label]) => (
            <div className="col-md-6" key={key}>
              <Switch
                id={`dash-widget-${key}`}
                label={label}
                checked={!hidden.includes(key)}
                onChange={(shown) => setWidgetShown(key, shown)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Shortcuts */}
      <div style={{ padding: "10px 0", borderBottom: "1px solid #2a3347" }}>
        <div className="d-flex align-items-center justify-content-between mb-2">
          <span style={{ fontSize: 14, color: "var(--ems-text-primary)" }}>Shortcuts</span>
          {isCustom && (
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1"
              onClick={resetLinks}
            >
              <FaUndo /> Reset to default
            </button>
          )}
        </div>
        <div style={{ fontSize: 12, color: "#6c757d", marginBottom: 10 }}>
          Choose up to {MAX_LINKS} shortcut tiles and their order. Off by default it uses your role&apos;s set.
        </div>

        <div className="entity-list">
          {selectedItems.map((item, idx) => (
            <div key={item.path} className="cert-row">
              <div className="cert-row-body d-flex align-items-center gap-2">
                {item.icon && <item.icon style={{ color: "var(--ems-text-secondary)" }} aria-hidden="true" />}
                <span style={{ color: "var(--ems-text-primary)" }}>{item.title}</span>
              </div>
              <div className="d-flex gap-1 flex-shrink-0">
                <button
                  type="button" className="btn btn-sm btn-outline-secondary"
                  onClick={() => move(item.path, -1)} disabled={idx === 0}
                  aria-label={`Move ${item.title} up`} title="Move up"
                >
                  <FaArrowUp />
                </button>
                <button
                  type="button" className="btn btn-sm btn-outline-secondary"
                  onClick={() => move(item.path, 1)} disabled={idx === selectedItems.length - 1}
                  aria-label={`Move ${item.title} down`} title="Move down"
                >
                  <FaArrowDown />
                </button>
                <button
                  type="button" className="btn btn-sm btn-outline-danger"
                  onClick={() => toggleLink(item.path, false)}
                  aria-label={`Remove ${item.title} from shortcuts`} title="Remove"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>

        {restItems.length > 0 && (
          <div className="mt-3">
            <div style={{ fontSize: 12, color: "#6c757d", marginBottom: 6 }}>Add a shortcut</div>
            <div className="d-flex flex-wrap gap-2">
              {restItems.map((item) => (
                <button
                  key={item.path}
                  type="button"
                  className="btn btn-sm btn-outline-primary d-inline-flex align-items-center gap-1"
                  onClick={() => toggleLink(item.path, true)}
                  disabled={atCap}
                  title={atCap ? `Remove one first — up to ${MAX_LINKS}` : `Add ${item.title}`}
                >
                  {item.icon && <item.icon aria-hidden="true" />} {item.title}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default DashboardSettings;
