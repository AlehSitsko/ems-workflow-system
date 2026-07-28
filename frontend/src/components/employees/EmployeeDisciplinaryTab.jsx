import { useCallback, useEffect, useState } from "react";
import { FaPlus, FaTrash, FaGavel, FaCheck, FaUndo } from "react-icons/fa";

import { PageSection } from "../ui/Page";
import { EmptyState, ErrorState, LoadingSkeleton } from "../ui/States";
import StatusBadge from "../ui/StatusBadge";
import {
  getDisciplinaryActions, createDisciplinaryAction,
  setDisciplinaryAcknowledged, deleteDisciplinaryAction,
} from "../../api/employeesApi";
import { formatDate, formatDateTime } from "../../utils/dateDisplay";

/**
 * Disciplinary record for one employee — warnings, suspensions, corrective
 * actions and notes.
 *
 * More sensitive than the rest of the workspace: admin/HR only. The API enforces
 * that; this tab is also hidden from other roles in EmployeeWorkspacePage so it
 * never appears half-working. Append-only like the employment timeline, with one
 * mutable field — acknowledgement — that flips when the employee signs off.
 */

const ACTION_TYPES = [
  ["verbal_warning", "Verbal warning"],
  ["written_warning", "Written warning"],
  ["final_warning", "Final warning"],
  ["suspension", "Suspension"],
  ["corrective_action", "Corrective action"],
  ["note", "Note"],
];
const ACTION_LABEL = Object.fromEntries(ACTION_TYPES.map(([v, l]) => [v, l]));

const SEVERITIES = [
  ["", "—"],
  ["low", "Low"],
  ["medium", "Medium"],
  ["high", "High"],
];
const SEVERITY_TONE = { low: "info", medium: "warning", high: "danger" };
const SEVERITY_LABEL = Object.fromEntries(SEVERITIES.map(([v, l]) => [v, l]));

const EMPTY_FORM = {
  actionType: "written_warning",
  actionDate: "",
  severity: "",
  subject: "",
  description: "",
};

export default function EmployeeDisciplinaryTab({ employeeId }) {
  const [actions, setActions] = useState(null);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setError("");
    getDisciplinaryActions(employeeId)
      .then(setActions)
      .catch((err) => setError(err.message || "Failed to load disciplinary record"));
  }, [employeeId]);

  useEffect(() => {
    setActions(null);
    load();
  }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    setFormError("");
    if (!form.actionDate) {
      setFormError("Action date is required.");
      return;
    }
    setBusy(true);
    try {
      await createDisciplinaryAction(employeeId, {
        actionType: form.actionType,
        actionDate: form.actionDate,
        severity: form.severity,
        subject: form.subject.trim(),
        description: form.description.trim(),
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      load();
    } catch (err) {
      setFormError(err.message || "Could not record the action.");
    } finally {
      setBusy(false);
    }
  };

  const toggleAck = async (action) => {
    setBusy(true);
    try {
      await setDisciplinaryAcknowledged(action.id, !action.acknowledged);
      load();
    } catch (err) {
      setError(err.message || "Could not update the action.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    setBusy(true);
    try {
      await deleteDisciplinaryAction(id);
      load();
    } catch (err) {
      setError(err.message || "Could not delete the action.");
    } finally {
      setBusy(false);
    }
  };

  if (error && actions === null) {
    return <ErrorState message={error} onRetry={load} />;
  }
  if (actions === null) {
    return <LoadingSkeleton rows={3} label="Loading disciplinary record" />;
  }

  return (
    <PageSection
      title="Disciplinary record"
      description="Warnings, suspensions and corrective actions — visible to admin and HR only. Newest first."
    >
      {!showForm && (
        <button
          type="button"
          className="btn btn-sm btn-outline-primary d-inline-flex align-items-center gap-2 mb-3"
          onClick={() => setShowForm(true)}
          disabled={busy}
        >
          <FaPlus /> Record action
        </button>
      )}

      {showForm && (
        <form className="mb-4" onSubmit={submit}>
          <div className="row g-3">
            <div className="col-md-4">
              <label className="form-label fw-semibold" htmlFor="disc-actionType">Action</label>
              <select
                id="disc-actionType" className="form-select"
                value={form.actionType}
                onChange={(e) => setForm((f) => ({ ...f, actionType: e.target.value }))}
                disabled={busy}
              >
                {ACTION_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="col-md-4">
              <label className="form-label fw-semibold" htmlFor="disc-actionDate">Date</label>
              <input
                id="disc-actionDate" type="date" className="form-control"
                value={form.actionDate}
                onChange={(e) => setForm((f) => ({ ...f, actionDate: e.target.value }))}
                disabled={busy}
              />
            </div>
            <div className="col-md-4">
              <label className="form-label fw-semibold" htmlFor="disc-severity">
                Severity <span className="text-secondary fw-normal">(optional)</span>
              </label>
              <select
                id="disc-severity" className="form-select"
                value={form.severity}
                onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value }))}
                disabled={busy}
              >
                {SEVERITIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="col-12">
              <label className="form-label fw-semibold" htmlFor="disc-subject">
                Subject <span className="text-secondary fw-normal">(optional)</span>
              </label>
              <input
                id="disc-subject" type="text" className="form-control"
                value={form.subject}
                onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                disabled={busy}
              />
            </div>
            <div className="col-12">
              <label className="form-label fw-semibold" htmlFor="disc-description">
                Details <span className="text-secondary fw-normal">(optional)</span>
              </label>
              <textarea
                id="disc-description" className="form-control" rows={2}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                disabled={busy}
              />
            </div>
          </div>

          {formError && <div className="alert alert-danger py-2 mt-3 mb-0">{formError}</div>}

          <div className="d-flex gap-2 mt-3">
            <button type="submit" className="btn btn-sm btn-primary" disabled={busy}>
              Record action
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

      {error && actions !== null && (
        <div className="alert alert-danger py-2 mb-3">{error}</div>
      )}

      {actions.length === 0 ? (
        <EmptyState
          variant="empty"
          title="No disciplinary actions on record"
          description="Warnings, suspensions and corrective actions will appear here."
        />
      ) : (
        <div className="entity-list">
          {actions.map((a) => (
            <div key={a.id} className="cert-row">
              <span className="cert-row-icon" aria-hidden="true"><FaGavel /></span>
              <div className="cert-row-body">
                <div className="d-flex align-items-center gap-2 flex-wrap">
                  <strong>{formatDate(a.actionDate)}</strong>
                  <span className="badge text-bg-secondary">{ACTION_LABEL[a.actionType] || a.actionType}</span>
                  {a.severity && (
                    <StatusBadge tone={SEVERITY_TONE[a.severity] || "neutral"} label={SEVERITY_LABEL[a.severity] || a.severity} />
                  )}
                  {a.acknowledged
                    ? <span className="badge text-bg-success">Acknowledged</span>
                    : <span className="badge text-bg-light text-dark">Not acknowledged</span>}
                </div>
                {a.subject && <div className="fw-semibold mt-1">{a.subject}</div>}
                {a.description && <div className="text-secondary small">{a.description}</div>}
                {a.createdByName && (
                  <div className="text-secondary small">
                    Recorded by {a.createdByName}
                    {a.createdAt ? ` · ${formatDateTime(a.createdAt)}` : ""}
                  </div>
                )}
              </div>

              <div className="d-flex gap-2 flex-shrink-0">
                <button
                  type="button"
                  className={`btn btn-sm d-inline-flex align-items-center gap-1 ${a.acknowledged ? "btn-outline-secondary" : "btn-outline-success"}`}
                  onClick={() => toggleAck(a)}
                  disabled={busy}
                  title={a.acknowledged ? "Mark as not acknowledged" : "Mark as acknowledged"}
                >
                  {a.acknowledged ? <FaUndo /> : <FaCheck />}
                  {a.acknowledged ? "Undo" : "Acknowledge"}
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-danger d-inline-flex align-items-center gap-1"
                  onClick={() => remove(a.id)}
                  disabled={busy}
                  aria-label="Delete this disciplinary action"
                  title="Delete this disciplinary action"
                >
                  <FaTrash />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </PageSection>
  );
}
