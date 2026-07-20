import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaCheck, FaTimes, FaBan, FaExternalLinkAlt } from "react-icons/fa";

import { PageHeader, PageSection, PageToolbar, ToolbarField } from "../components/ui/Page";
import { EmptyState, ErrorState, LoadingSkeleton } from "../components/ui/States";
import StatusBadge from "../components/ui/StatusBadge";
import { useToast } from "../components/ui/useToast";
import { useConfirm } from "../components/ui/useConfirm";
import {
  getLeaveRequests, decideLeaveRequest, cancelLeaveRequest,
} from "../api/leaveApi";
import { getEmployees } from "../api/employeesApi";
import { describeLeaveType, describeLeaveStatus } from "../utils/taxonomy";

// Reviewing leave from each employee's own workspace works for one request but
// not for the daily question — "what is waiting for me?". This page answers that
// across everyone.
//
// It shows what the API sent for the caller's role: HR and admin see the type
// and reason, a supervisor sees who is away and when. Deciding is HR/admin only,
// matching the backend, so a supervisor gets a read-only overview instead of
// buttons that would 403.

const STATUS_FILTERS = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "denied", label: "Denied" },
  { value: "cancelled", label: "Cancelled" },
  { value: "", label: "All" },
];

export default function LeaveReviewPage({ currentUser }) {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();

  const canDecide = ["admin", "hr"].includes(currentUser?.role);

  const [status, setStatus] = useState("pending");
  const [requests, setRequests] = useState([]);
  const [employees, setEmployees] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    return Promise.all([
      getLeaveRequests(status ? { status } : {}),
      // The leave payload carries an employee id, never a name — names come from
      // the employee list, which these roles can already read.
      getEmployees().catch(() => []),
    ])
      .then(([rows, staff]) => {
        setRequests(rows);
        setEmployees(Object.fromEntries(
          (staff || []).map((e) => [e.id, `${e.firstName} ${e.lastName}`.trim()]),
        ));
      })
      .catch((err) => setError(err.message || "Failed to load leave requests"))
      .finally(() => setLoading(false));
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const nameFor = (id) => employees[id] || `Employee #${id}`;

  const decide = async (row, decision) => {
    const ok = await confirm({
      title: decision === "approved" ? "Approve this leave?" : "Deny this leave?",
      message: decision === "approved"
        ? `${nameFor(row.employeeId)} will be unavailable from ${row.startDate} to ${row.endDate}.`
        : `${nameFor(row.employeeId)} will be expected to work these dates.`,
      confirmLabel: decision === "approved" ? "Approve" : "Deny",
      variant: decision === "approved" ? "primary" : "danger",
    });
    if (!ok) return;

    setBusyId(row.id);
    try {
      const saved = await decideLeaveRequest(row.id, decision);
      toast.success(decision === "approved" ? "Leave approved" : "Leave denied");

      // Approving can leave a shift short-handed. The API says which ones; the
      // dispatcher should hear about it now, not on the day.
      (saved.rosteredShifts || []).forEach((shift) => {
        toast.warning(
          "Shift now short-handed",
          `${nameFor(row.employeeId)} is rostered on Unit ${shift.truckNumber} on ${shift.shiftDate}.`,
        );
      });
      load();
    } catch (err) {
      toast.error("Could not record the decision", err.message);
    } finally {
      setBusyId(null);
    }
  };

  const cancel = async (row) => {
    const ok = await confirm({
      title: "Cancel this request?",
      message: "The record and its review history are kept.",
      confirmLabel: "Cancel request",
      variant: "danger",
    });
    if (!ok) return;

    setBusyId(row.id);
    try {
      await cancelLeaveRequest(row.id);
      toast.success("Request cancelled");
      load();
    } catch (err) {
      toast.error("Could not cancel the request", err.message);
    } finally {
      setBusyId(null);
    }
  };

  const sorted = useMemo(
    () => [...requests].sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [requests],
  );

  const pendingCount = requests.filter((r) => r.status === "pending").length;

  return (
    <div className="page-stack">
      <PageHeader
        title="Leave review"
        description={canDecide
          ? "Requests waiting on a decision, across every employee."
          : "Who is away and when. Decisions are made by HR."}
        count={status === "pending" ? pendingCount : requests.length}
      />

      <PageSection>
        <PageToolbar>
          <ToolbarField label="Status" htmlFor="leaveStatusFilter">
            <select
              id="leaveStatusFilter"
              className="form-select"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {STATUS_FILTERS.map((f) => (
                <option key={f.value || "all"} value={f.value}>{f.label}</option>
              ))}
            </select>
          </ToolbarField>
        </PageToolbar>

        {loading && <LoadingSkeleton rows={4} label="Loading leave requests" />}
        {!loading && error && <ErrorState message={error} onRetry={load} />}

        {!loading && !error && sorted.length === 0 && (
          <EmptyState
            variant="empty"
            title={status === "pending" ? "Nothing waiting for review" : "No leave on record"}
            description={status === "pending"
              ? "Approved and denied requests are still available from the filter above."
              : "Requests filed for any employee will appear here."}
          />
        )}

        {!loading && !error && sorted.length > 0 && (
          <div className="entity-list">
            {sorted.map((row) => {
              const type = describeLeaveType(row.leaveType);
              const state = describeLeaveStatus(row.status);
              const open = row.status === "pending" || row.status === "draft";

              return (
                <div key={row.id} className="cert-row">
                  <div className="cert-row-body">
                    <div className="d-flex align-items-center gap-2 flex-wrap">
                      <strong>{nameFor(row.employeeId)}</strong>
                      <span className="text-secondary">
                        {row.startDate === row.endDate
                          ? row.startDate
                          : `${row.startDate} – ${row.endDate}`}
                      </span>
                      <span className="badge text-bg-secondary" title={type.title}>{type.label}</span>
                      <StatusBadge tone={state.tone} label={state.label} />
                      {row.isPartialDay && (
                        <span className="badge text-bg-light text-dark">
                          {row.startTime}–{row.endTime}
                        </span>
                      )}
                    </div>

                    {/* Only present when the API trusted this role with it. */}
                    {row.reason && (
                      <div className="text-secondary small mt-1">Reason: {row.reason}</div>
                    )}
                    {row.reviewedByName && (
                      <div className="text-secondary small">
                        {state.label} by {row.reviewedByName}
                        {row.reviewNote ? ` — ${row.reviewNote}` : ""}
                      </div>
                    )}
                  </div>

                  <div className="d-flex gap-2 flex-shrink-0">
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1"
                      onClick={() => navigate(`/employees/${row.employeeId}?tab=leave`)}
                      title="Open this employee"
                    >
                      <FaExternalLinkAlt />
                    </button>

                    {canDecide && open && (
                      <>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-success d-inline-flex align-items-center gap-1"
                          onClick={() => decide(row, "approved")}
                          disabled={busyId === row.id}
                        >
                          <FaCheck /> Approve
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger d-inline-flex align-items-center gap-1"
                          onClick={() => decide(row, "denied")}
                          disabled={busyId === row.id}
                        >
                          <FaTimes /> Deny
                        </button>
                      </>
                    )}
                    {canDecide && row.status !== "cancelled" && (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1"
                        onClick={() => cancel(row)}
                        disabled={busyId === row.id}
                      >
                        <FaBan />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </PageSection>
    </div>
  );
}
