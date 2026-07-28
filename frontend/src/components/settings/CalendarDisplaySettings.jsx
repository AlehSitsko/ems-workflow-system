import { FaCalendarAlt } from "react-icons/fa";

// Per-user Calendar display preferences (stored in settings.calendar). These are
// display-only — event access is enforced server-side; toggling a source off
// simply hides it from this user's calendar view and day drawer.
const SOURCE_LABELS = [
  ["scheduled_call", "Scheduled calls"],
  ["crew_shift", "Crew shifts"],
  ["patient_birthday", "Patient birthdays"],
  ["employee_birthday", "Employee birthdays"],
  ["certification", "Certification expirations"],
  ["task", "Task due dates"],
  ["vehicle", "Vehicle dates"],
  ["calendar_event", "Calendar events"],
];

function Switch({ id, label, checked, onChange }) {
  return (
    <div className="form-check form-switch">
      <input
        type="checkbox"
        className="form-check-input"
        role="switch"
        id={id}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <label className="form-check-label" htmlFor={id} style={{ fontSize: 14, color: "var(--ems-text-primary)" }}>
        {label}
      </label>
    </div>
  );
}

function CalendarDisplaySettings({ value, onChange }) {
  const sources = value.sources || {};
  const setSource = (key, on) => onChange({ ...value, sources: { ...sources, [key]: on } });
  const set = (patch) => onChange({ ...value, ...patch });

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#6c757d", letterSpacing: 1, marginBottom: 10, textTransform: "uppercase" }}>
        Calendar
      </div>

      <div style={{ padding: "10px 0", borderBottom: "1px solid #2a3347" }}>
        <div className="d-flex align-items-center gap-2 mb-2">
          <FaCalendarAlt style={{ color: "var(--ems-text-secondary)", fontSize: 13 }} />
          <span style={{ fontSize: 14, color: "var(--ems-text-primary)" }}>Event sources</span>
        </div>
        <div style={{ fontSize: 12, color: "#6c757d", marginBottom: 10 }}>
          Choose which event types appear on your calendar. You only ever see
          sources your role is allowed to; this just hides them from your view.
        </div>
        <div className="row g-1">
          {SOURCE_LABELS.map(([key, label]) => (
            <div className="col-md-6" key={key}>
              <Switch
                id={`cal-src-${key}`}
                label={label}
                checked={sources[key] !== false}
                onChange={(on) => setSource(key, on)}
              />
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: "10px 0", borderBottom: "1px solid #2a3347" }}>
        <div className="row g-2 align-items-center">
          <div className="col-md-6">
            <Switch id="cal-weekends" label="Highlight weekends" checked={value.showWeekends !== false} onChange={(on) => set({ showWeekends: on })} />
            <Switch id="cal-holidays" label="Show US holidays" checked={value.showHolidays !== false} onChange={(on) => set({ showHolidays: on })} />
          </div>
          <div className="col-md-6 d-flex flex-column gap-2">
            <div className="d-flex align-items-center gap-2">
              <span style={{ fontSize: 13, color: "var(--ems-text-secondary)", minWidth: 92 }}>Week starts</span>
              <div className="btn-group btn-group-sm">
                <button type="button" className={`btn ${(value.weekStartsOn ?? 0) === 0 ? "btn-primary" : "btn-outline-secondary"}`} onClick={() => set({ weekStartsOn: 0 })}>Sunday</button>
                <button type="button" className={`btn ${value.weekStartsOn === 1 ? "btn-primary" : "btn-outline-secondary"}`} onClick={() => set({ weekStartsOn: 1 })}>Monday</button>
              </div>
            </div>
            <div className="d-flex align-items-center gap-2">
              <span style={{ fontSize: 13, color: "var(--ems-text-secondary)", minWidth: 92 }}>Density</span>
              <div className="btn-group btn-group-sm">
                <button type="button" className={`btn ${(value.density || "comfortable") === "comfortable" ? "btn-primary" : "btn-outline-secondary"}`} onClick={() => set({ density: "comfortable" })}>Comfortable</button>
                <button type="button" className={`btn ${value.density === "compact" ? "btn-primary" : "btn-outline-secondary"}`} onClick={() => set({ density: "compact" })}>Compact</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CalendarDisplaySettings;
