import { useCallback, useEffect, useState } from "react";
import { FaPlus, FaTrash, FaBriefcase } from "react-icons/fa";

import { PageSection } from "../ui/Page";
import { EmptyState, ErrorState, LoadingSkeleton } from "../ui/States";
import StatusBadge from "../ui/StatusBadge";
import {
  getEmploymentEvents, createEmploymentEvent, deleteEmploymentEvent,
} from "../../api/employeesApi";
import { formatDate, formatDateTime } from "../../utils/dateDisplay";

/**
 * Employment history for one employee — a timeline of hires, position and status
 * changes, terminations, rehires and notes.
 *
 * The Employee record holds the *current* position and status; this shows how it
 * got there. It is append-only by intent: a correction removes the wrong entry
 * rather than editing it, so there is no edit control, only add and delete.
 *
 * Self-contained (like the Documents and Time & Pay tabs): it owns its data so
 * the workspace page does not grow another loader. The surrounding route already
 * gates this to admin/supervisor/HR, and the API enforces the same.
 */

const EVENT_TYPES = [
  ["hired", "Hired", "success"],
  ["position_change", "Position change", "info"],
  ["status_change", "Status change", "info"],
  ["pay_change", "Pay change", "info"],
  ["rehired", "Rehired", "success"],
  ["terminated", "Terminated", "danger"],
  ["note", "Note", "neutral"],
];
const EVENT_LABEL = Object.fromEntries(EVENT_TYPES.map(([v, l]) => [v, l]));
const EVENT_TONE = Object.fromEntries(EVENT_TYPES.map(([v, , t]) => [v, t]));

const EMPLOYMENT_TYPES = [
  ["", "—"],
  ["full_time", "Full-time"],
  ["part_time", "Part-time"],
  ["per_diem", "Per diem"],
  ["contract", "Contract"],
];
const EMPLOYMENT_TYPE_LABEL = Object.fromEntries(EMPLOYMENT_TYPES.map(([v, l]) => [v, l]));

const STATUSES = [
  ["", "—"],
  ["active", "Active"],
  ["on_leave", "On leave"],
  ["inactive", "Inactive"],
  ["terminated", "Terminated"],
];

const EMPTY_FORM = {
  eventType: "position_change",
  effectiveDate: "",
  title: "",
  employmentType: "",
  status: "",
  note: "",
};

export default function EmployeeEmploymentTab({ employeeId, currentUser }) {
  const [events, setEvents] = useState(null);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  // The route is already role-gated to admin/supervisor/HR, so anyone who can
  // see this tab can manage it; kept explicit for clarity.
  const canManage = ["admin", "supervisor", "hr"].includes(currentUser?.role);

  const load = useCallback(() => {
    setError("");
    getEmploymentEvents(employeeId)
      .then(setEvents)
      .catch((err) => setError(err.message || "Failed to load employment history"));
  }, [employeeId]);

  useEffect(() => {
    setEvents(null);
    load();
  }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    setFormError("");
    if (!form.effectiveDate) {
      setFormError("Effective date is required.");
      return;
    }
    setBusy(true);
    try {
      await createEmploymentEvent(employeeId, {
        eventType: form.eventType,
        effectiveDate: form.effectiveDate,
        title: form.title.trim(),
        employmentType: form.employmentType,
        status: form.status,
        note: form.note.trim(),
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      load();
    } catch (err) {
      setFormError(err.message || "Could not add the event.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    setBusy(true);
    try {
      await deleteEmploymentEvent(id);
      load();
    } catch (err) {
      setError(err.message || "Could not delete the event.");
    } finally {
      setBusy(false);
    }
  };

  if (error && events === null) {
    return <ErrorState message={error} onRetry={load} />;
  }
  if (events === null) {
    return <LoadingSkeleton rows={3} label="Loading employment history" />;
  }

  return (
    <PageSection
      title="Employment history"
      description="Hires, position and status changes, terminations and rehires — newest first."
    >
      {canManage && !showForm && (
        <button
          type="button"
          className="btn btn-sm btn-outline-primary d-inline-flex align-items-center gap-2 mb-3"
          onClick={() => setShowForm(true)}
          disabled={busy}
        >
          <FaPlus /> Add event
        </button>
      )}

      {showForm && (
        <form className="mb-4" onSubmit={submit}>
          <div className="row g-3">
            <div className="col-md-4">
              <label className="form-label fw-semibold" htmlFor="emp-eventType">Event</label>
              <select
                id="emp-eventType" className="form-select"
                value={form.eventType}
                onChange={(e) => setForm((f) => ({ ...f, eventType: e.target.value }))}
                disabled={busy}
              >
                {EVENT_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="col-md-4">
              <label className="form-label fw-semibold" htmlFor="emp-effectiveDate">Effective date</label>
              <input
                id="emp-effectiveDate" type="date" className="form-control"
                value={form.effectiveDate}
                onChange={(e) => setForm((f) => ({ ...f, effectiveDate: e.target.value }))}
                disabled={busy}
              />
            </div>
            <div className="col-md-4">
              <label className="form-label fw-semibold" htmlFor="emp-title">
                Position / title <span className="text-secondary fw-normal">(optional)</span>
              </label>
              <input
                id="emp-title" type="text" className="form-control"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                disabled={busy}
              />
            </div>
            <div className="col-md-4">
              <label className="form-label fw-semibold" htmlFor="emp-employmentType">
                Employment type <span className="text-secondary fw-normal">(optional)</span>
              </label>
              <select
                id="emp-employmentType" className="form-select"
                value={form.employmentType}
                onChange={(e) => setForm((f) => ({ ...f, employmentType: e.target.value }))}
                disabled={busy}
              >
                {EMPLOYMENT_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="col-md-4">
              <label className="form-label fw-semibold" htmlFor="emp-status">
                Status <span className="text-secondary fw-normal">(optional)</span>
              </label>
              <select
                id="emp-status" className="form-select"
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                disabled={busy}
              >
                {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="col-12">
              <label className="form-label fw-semibold" htmlFor="emp-note">
                Note <span className="text-secondary fw-normal">(optional)</span>
              </label>
              <input
                id="emp-note" type="text" className="form-control"
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                disabled={busy}
              />
            </div>
          </div>

          {formError && <div className="alert alert-danger py-2 mt-3 mb-0">{formError}</div>}

          <div className="d-flex gap-2 mt-3">
            <button type="submit" className="btn btn-sm btn-primary" disabled={busy}>
              Add event
            </button>
            <button
              type="button" className="btn btn-sm btn-outline-secondary"
              onClick={() => { setShowForm(false); setFormError(""); setForm(EMPTY_FORM); }}
              disabled={busy}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {error && events !== null && (
        <div className="alert alert-danger py-2 mb-3">{error}</div>
      )}

      {events.length === 0 ? (
        <EmptyState
          variant="empty"
          title="No employment history yet"
          description="Add a hire, position change, termination or note to build the timeline."
        />
      ) : (
        <div className="entity-list">
          {events.map((ev) => (
            <div key={ev.id} className="cert-row">
              <span className="cert-row-icon" aria-hidden="true"><FaBriefcase /></span>
              <div className="cert-row-body">
                <div className="d-flex align-items-center gap-2 flex-wrap">
                  <strong>{formatDate(ev.effectiveDate)}</strong>
                  <StatusBadge tone={EVENT_TONE[ev.eventType] || "neutral"} label={EVENT_LABEL[ev.eventType] || ev.eventType} />
                  {ev.title && <span className="badge text-bg-secondary">{ev.title}</span>}
                  {ev.employmentType && (
                    <span className="badge text-bg-light text-dark">
                      {EMPLOYMENT_TYPE_LABEL[ev.employmentType] || ev.employmentType}
                    </span>
                  )}
                  {ev.status && <span className="badge text-bg-light text-dark text-capitalize">{ev.status.replace(/_/g, " ")}</span>}
                </div>
                {ev.note && <div className="text-secondary small mt-1">{ev.note}</div>}
                {ev.createdByName && (
                  <div className="text-secondary small">
                    Recorded by {ev.createdByName}
                    {ev.createdAt ? ` · ${formatDateTime(ev.createdAt)}` : ""}
                  </div>
                )}
              </div>

              {canManage && (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-danger d-inline-flex align-items-center gap-1 flex-shrink-0"
                  onClick={() => remove(ev.id)}
                  disabled={busy}
                  aria-label="Delete this employment event"
                  title="Delete this employment event"
                >
                  <FaTrash />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </PageSection>
  );
}
