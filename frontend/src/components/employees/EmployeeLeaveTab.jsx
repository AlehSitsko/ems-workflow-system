import { useState } from "react";
import { FaPlus, FaCheck, FaTimes, FaBan } from "react-icons/fa";

import { PageSection } from "../ui/Page";
import { EmptyState } from "../ui/States";
import StatusBadge from "../ui/StatusBadge";
import { describeLeaveType, describeLeaveStatus, LEAVE_TYPES, LEAVE_TYPE_LABELS } from "../../utils/taxonomy";

/**
 * Leave / absence for one employee.
 *
 * What is shown here is whatever the API chose to send: for HR and admin that
 * includes the type, reason and review trail, and for a supervisor only the
 * dates and whether they block scheduling. This component never decides what to
 * hide — it renders the fields that arrived and omits the ones that did not, so
 * a UI change can't widen the disclosure.
 */
export default function EmployeeLeaveTab({
  requests,
  employeeName,
  canFile,
  canDecide,
  onCreate,
  onDecide,
  onCancel,
  busy,
}) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    leaveType: "vacation", startDate: "", endDate: "", reason: "",
  });
  const [formError, setFormError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setFormError("");
    if (!form.startDate) {
      setFormError("Start date is required.");
      return;
    }
    try {
      await onCreate({
        leaveType: form.leaveType,
        startDate: form.startDate,
        endDate: form.endDate || form.startDate,
        reason: form.reason.trim(),
      });
      setForm({ leaveType: "vacation", startDate: "", endDate: "", reason: "" });
      setShowForm(false);
    } catch (err) {
      setFormError(err.message || "Could not file the request.");
    }
  };

  const dateRange = (r) =>
    r.startDate === r.endDate ? r.startDate : `${r.startDate} – ${r.endDate}`;

  return (
    <PageSection
      title="Leave & absence"
      description={`Time ${employeeName} is unavailable. Approved leave blocks crew scheduling.`}
    >
      {canFile && !showForm && (
        <button
          type="button"
          className="btn btn-sm btn-outline-primary d-inline-flex align-items-center gap-2 mb-3"
          onClick={() => setShowForm(true)}
          disabled={busy}
        >
          <FaPlus /> File a request
        </button>
      )}

      {showForm && (
        <form className="mb-4" onSubmit={submit}>
          <div className="row g-3">
            <div className="col-md-4">
              <label className="form-label fw-semibold" htmlFor="leaveType">Type</label>
              <select
                id="leaveType"
                className="form-select"
                value={form.leaveType}
                onChange={(e) => setForm((f) => ({ ...f, leaveType: e.target.value }))}
                disabled={busy}
              >
                {LEAVE_TYPES.map((t) => (
                  <option key={t} value={t}>{LEAVE_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div className="col-md-4">
              <label className="form-label fw-semibold" htmlFor="leaveStart">First day</label>
              <input
                id="leaveStart" type="date" className="form-control"
                value={form.startDate}
                onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                disabled={busy}
              />
            </div>
            <div className="col-md-4">
              <label className="form-label fw-semibold" htmlFor="leaveEnd">
                Last day <span className="text-secondary fw-normal">(same day if blank)</span>
              </label>
              <input
                id="leaveEnd" type="date" className="form-control"
                value={form.endDate}
                onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                disabled={busy}
              />
            </div>
            <div className="col-12">
              <label className="form-label fw-semibold" htmlFor="leaveReason">
                Reason <span className="text-secondary fw-normal">(visible to HR only)</span>
              </label>
              <input
                id="leaveReason" type="text" className="form-control"
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                disabled={busy}
              />
            </div>
          </div>

          {formError && <div className="alert alert-danger py-2 mt-3 mb-0">{formError}</div>}

          <div className="d-flex gap-2 mt-3">
            <button type="submit" className="btn btn-sm btn-primary" disabled={busy}>
              Submit request
            </button>
            <button
              type="button" className="btn btn-sm btn-outline-secondary"
              onClick={() => { setShowForm(false); setFormError(""); }}
              disabled={busy}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {requests.length === 0 ? (
        <EmptyState
          variant="empty"
          title="No leave on record"
          description="Vacation, sick days and other absences will appear here."
        />
      ) : (
        <div className="entity-list">
          {requests.map((r) => {
            const type = describeLeaveType(r.leaveType);
            const status = describeLeaveStatus(r.status);
            const open = r.status === "pending" || r.status === "draft";

            return (
              <div key={r.id} className="cert-row">
                <div className="cert-row-body">
                  <div className="d-flex align-items-center gap-2 flex-wrap">
                    <strong>{dateRange(r)}</strong>
                    <span className="badge text-bg-secondary" title={type.title}>{type.label}</span>
                    <StatusBadge tone={status.tone} label={status.label} />
                    {r.isPartialDay && (
                      <span className="badge text-bg-light text-dark">
                        {r.startTime}–{r.endTime}
                      </span>
                    )}
                    {r.blocksScheduling && (
                      <span className="badge text-bg-warning">Blocks scheduling</span>
                    )}
                  </div>

                  {/* Present only for roles the API trusts with it. */}
                  {r.reason && <div className="text-secondary small mt-1">Reason: {r.reason}</div>}
                  {r.privateNotes && (
                    <div className="text-secondary small">HR notes: {r.privateNotes}</div>
                  )}
                  {r.reviewedByName && (
                    <div className="text-secondary small">
                      {status.label} by {r.reviewedByName}
                      {r.reviewNote ? ` — ${r.reviewNote}` : ""}
                    </div>
                  )}
                </div>

                {canDecide && (
                  <div className="d-flex gap-2 flex-shrink-0">
                    {open && (
                      <>
                        <button
                          type="button" className="btn btn-sm btn-outline-success d-inline-flex align-items-center gap-1"
                          onClick={() => onDecide(r.id, "approved")} disabled={busy}
                        >
                          <FaCheck /> Approve
                        </button>
                        <button
                          type="button" className="btn btn-sm btn-outline-danger d-inline-flex align-items-center gap-1"
                          onClick={() => onDecide(r.id, "denied")} disabled={busy}
                        >
                          <FaTimes /> Deny
                        </button>
                      </>
                    )}
                    {r.status !== "cancelled" && (
                      <button
                        type="button" className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1"
                        onClick={() => onCancel(r.id)} disabled={busy}
                      >
                        <FaBan /> Cancel
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </PageSection>
  );
}
