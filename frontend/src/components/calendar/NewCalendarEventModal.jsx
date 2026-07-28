import { useState } from "react";

import EntityDrawer from "../ui/EntityDrawer";
import { createCalendarEvent } from "../../api/calendarEventsApi";

// Create a manual calendar event. Personal is open to everyone; broadcasting to
// a role or the whole company is admin/supervisor only, and the API enforces
// that too — this just hides the options the caller may not use.

const CATEGORIES = [
  ["", "None"],
  ["meeting", "Meeting"],
  ["reminder", "Reminder"],
  ["training", "Training"],
  ["time_off", "Time off"],
  ["other", "Other"],
];

const ROLES = ["admin", "supervisor", "dispatcher", "hr"];

export default function NewCalendarEventModal({ open, onClose, onCreated, currentUser, defaultDate }) {
  const canBroadcast = ["admin", "supervisor"].includes(currentUser?.role);

  const [form, setForm] = useState({
    title: "", eventDate: defaultDate || "", allDay: true,
    startTime: "", endTime: "", category: "", description: "",
    visibility: "personal", visibleToRole: "dispatcher",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const submit = async () => {
    setError("");
    if (!form.title.trim() || !form.eventDate) {
      setError("Title and date are required.");
      return;
    }
    setBusy(true);
    try {
      await createCalendarEvent({
        title: form.title.trim(),
        eventDate: form.eventDate,
        allDay: form.allDay,
        startTime: form.allDay ? "" : form.startTime,
        endTime: form.allDay ? "" : form.endTime,
        category: form.category,
        description: form.description.trim(),
        visibility: form.visibility,
        visibleToRole: form.visibility === "role" ? form.visibleToRole : "",
      });
      onCreated?.();
      onClose?.();
      // Reset for next time.
      setForm({
        title: "", eventDate: defaultDate || "", allDay: true,
        startTime: "", endTime: "", category: "", description: "",
        visibility: "personal", visibleToRole: "dispatcher",
      });
    } catch (err) {
      setError(err.message || "Could not create the event.");
    } finally {
      setBusy(false);
    }
  };

  const footer = (
    <div className="d-flex gap-2">
      <button type="button" className="btn btn-primary" onClick={submit} disabled={busy}>
        {busy ? "Saving…" : "Create event"}
      </button>
      <button type="button" className="btn btn-outline-secondary" onClick={onClose} disabled={busy}>
        Cancel
      </button>
    </div>
  );

  return (
    <EntityDrawer open={open} onClose={onClose} onCloseRequested={onClose}
                  title="New calendar event" subtitle="Meeting, reminder or time off" footer={footer}>
      <div className="d-flex flex-column gap-3">
        <div>
          <label className="form-label fw-semibold" htmlFor="ce-title">Title</label>
          <input id="ce-title" className="form-control" value={form.title}
                 onChange={(e) => set({ title: e.target.value })} disabled={busy} />
        </div>

        <div className="row g-2">
          <div className="col-7">
            <label className="form-label fw-semibold" htmlFor="ce-date">Date</label>
            <input id="ce-date" type="date" className="form-control" value={form.eventDate}
                   onChange={(e) => set({ eventDate: e.target.value })} disabled={busy} />
          </div>
          <div className="col-5">
            <label className="form-label fw-semibold" htmlFor="ce-category">Category</label>
            <select id="ce-category" className="form-select" value={form.category}
                    onChange={(e) => set({ category: e.target.value })} disabled={busy}>
              {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>

        <div className="form-check form-switch">
          <input id="ce-allday" className="form-check-input" type="checkbox" role="switch"
                 checked={form.allDay} onChange={(e) => set({ allDay: e.target.checked })} disabled={busy} />
          <label className="form-check-label" htmlFor="ce-allday">All day</label>
        </div>

        {!form.allDay && (
          <div className="row g-2">
            <div className="col-6">
              <label className="form-label fw-semibold" htmlFor="ce-start">Start</label>
              <input id="ce-start" type="time" className="form-control" value={form.startTime}
                     onChange={(e) => set({ startTime: e.target.value })} disabled={busy} />
            </div>
            <div className="col-6">
              <label className="form-label fw-semibold" htmlFor="ce-end">End</label>
              <input id="ce-end" type="time" className="form-control" value={form.endTime}
                     onChange={(e) => set({ endTime: e.target.value })} disabled={busy} />
            </div>
          </div>
        )}

        <div>
          <label className="form-label fw-semibold" htmlFor="ce-visibility">Visibility</label>
          <select id="ce-visibility" className="form-select" value={form.visibility}
                  onChange={(e) => set({ visibility: e.target.value })} disabled={busy}>
            <option value="personal">Personal — only me</option>
            {canBroadcast && <option value="role">A role — everyone with a role</option>}
            {canBroadcast && <option value="company">Company — everyone</option>}
          </select>
          {!canBroadcast && (
            <div className="form-text">Only admins and supervisors can share with others.</div>
          )}
        </div>

        {form.visibility === "role" && (
          <div>
            <label className="form-label fw-semibold" htmlFor="ce-role">Which role</label>
            <select id="ce-role" className="form-select" value={form.visibleToRole}
                    onChange={(e) => set({ visibleToRole: e.target.value })} disabled={busy}>
              {ROLES.map((r) => <option key={r} value={r} className="text-capitalize">{r}</option>)}
            </select>
          </div>
        )}

        <div>
          <label className="form-label fw-semibold" htmlFor="ce-desc">Details <span className="text-secondary fw-normal">(optional)</span></label>
          <textarea id="ce-desc" className="form-control" rows={2} value={form.description}
                    onChange={(e) => set({ description: e.target.value })} disabled={busy} />
        </div>

        {error && <div className="alert alert-danger py-2 mb-0">{error}</div>}
      </div>
    </EntityDrawer>
  );
}
