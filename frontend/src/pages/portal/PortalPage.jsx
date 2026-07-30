import { useCallback, useEffect, useState } from "react";
import { FaCalendarAlt, FaTasks, FaUmbrellaBeach, FaIdBadge } from "react-icons/fa";

import { PageSection } from "../../components/ui/Page";
import { EmptyState, ErrorState, LoadingSkeleton } from "../../components/ui/States";
import StatusBadge from "../../components/ui/StatusBadge";
import { formatDate } from "../../utils/dateDisplay";
import {
  getMyProfile, getMySchedule, getMyTasks, updateMyTask, getMyLeave, requestLeave,
} from "../../api/portalApi";

const TABS = [
  ["schedule", "My Schedule", FaCalendarAlt],
  ["tasks", "My Tasks", FaTasks],
  ["leave", "My Leave", FaUmbrellaBeach],
  ["profile", "My Profile", FaIdBadge],
];

const WORKER_STATUSES = ["In Progress", "Waiting", "Done"];
const LEAVE_TYPES = ["vacation", "sick", "personal", "unpaid", "bereavement", "training", "other"];

const leaveTone = (status) => (
  { approved: "success", denied: "danger", cancelled: "neutral", pending: "warning" }[status] || "info"
);
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");

export default function PortalPage({ currentUser }) {
  const [tab, setTab] = useState("schedule");

  return (
    <div className="page-stack">
      <div className="mb-3">
        <h2 className="mb-1" style={{ color: "var(--ems-text-primary)" }}>
          Hi, {currentUser?.display_name?.split(" ")[0] || "there"}
        </h2>
        <p className="text-secondary mb-0">Your schedule, tasks and time off in one place.</p>
      </div>

      <ul className="nav nav-pills gap-1 mb-3 flex-wrap">
        {TABS.map(([key, label, Icon]) => (
          <li className="nav-item" key={key}>
            <button
              type="button"
              className={`nav-link d-inline-flex align-items-center gap-2 ${tab === key ? "active" : ""}`}
              onClick={() => setTab(key)}
            >
              <Icon aria-hidden="true" /> {label}
            </button>
          </li>
        ))}
      </ul>

      {tab === "schedule" && <ScheduleTab />}
      {tab === "tasks" && <TasksTab />}
      {tab === "leave" && <LeaveTab />}
      {tab === "profile" && <ProfileTab />}
    </div>
  );
}

/** Small hook: load once, expose {data, error, reload}. */
function useLoad(loader) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const reload = useCallback(() => {
    setError("");
    setData(null);
    loader().then(setData).catch((e) => setError(e.message || "Failed to load"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(reload, [reload]);
  return { data, error, reload, setError };
}

function ScheduleTab() {
  const { data, error, reload } = useLoad(getMySchedule);
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (data === null) return <LoadingSkeleton rows={3} label="Loading your schedule" />;

  return (
    <PageSection title="Upcoming & recent shifts" description="The days you are rostered on, newest first.">
      {data.length === 0 ? (
        <EmptyState variant="empty" title="No shifts on record" description="You are not currently rostered on any unit." />
      ) : (
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead className="table-light">
              <tr><th>Date</th><th>Unit</th><th>Role</th><th>Hours</th><th>Status</th></tr>
            </thead>
            <tbody>
              {data.map((s) => (
                <tr key={s.id}>
                  <td>{formatDate(s.shiftDate)}</td>
                  <td>{s.truckNumber} <span className="text-secondary">· {s.unitType}</span></td>
                  <td>{s.role || "—"}</td>
                  <td>{s.startTime}{s.endTime ? `–${s.endTime}` : ""}</td>
                  <td className="text-capitalize">{s.shiftStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageSection>
  );
}

function TasksTab() {
  const { data, error, reload, setError } = useLoad(getMyTasks);
  const [busy, setBusy] = useState(false);

  const setStatus = async (task, status) => {
    setBusy(true);
    try {
      await updateMyTask(task.id, status);
      reload();
    } catch (e) {
      setError(e.message || "Could not update the task");
    } finally {
      setBusy(false);
    }
  };

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (data === null) return <LoadingSkeleton rows={3} label="Loading your tasks" />;

  return (
    <PageSection title="Assigned to me" description="Move a task along as you work it; your supervisor closes it out.">
      {data.length === 0 ? (
        <EmptyState variant="empty" title="No tasks assigned" description="Nothing is on your plate right now." />
      ) : (
        <div className="entity-list">
          {data.map((t) => (
            <div key={t.id} className="cert-row">
              <div className="cert-row-body">
                <div className="d-flex align-items-center gap-2 flex-wrap">
                  <strong>{t.title}</strong>
                  <StatusBadge tone={t.status === "Done" ? "success" : "info"} label={t.status} />
                  {t.due_date && <span className="text-secondary small">due {formatDate(t.due_date)}</span>}
                </div>
                {t.description && <div className="text-secondary small">{t.description}</div>}
              </div>
              <div className="btn-group btn-group-sm flex-shrink-0" role="group" aria-label={`Update ${t.title}`}>
                {WORKER_STATUSES.map((s) => (
                  <button
                    key={s} type="button"
                    className={`btn ${t.status === s ? "btn-primary" : "btn-outline-secondary"}`}
                    disabled={busy || t.status === s}
                    onClick={() => setStatus(t, s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </PageSection>
  );
}

function LeaveTab() {
  const { data, error, reload, setError } = useLoad(getMyLeave);
  const [form, setForm] = useState({ leaveType: "vacation", startDate: "", endDate: "", reason: "" });
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setFormError("");
    if (!form.startDate) { setFormError("A start date is required."); return; }
    setBusy(true);
    try {
      await requestLeave({ ...form, endDate: form.endDate || form.startDate });
      setForm({ leaveType: "vacation", startDate: "", endDate: "", reason: "" });
      reload();
    } catch (err) {
      setFormError(err.message || "Could not submit your request.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageSection title="Request time off" description="Submitted as pending for HR to review.">
        <form className="row g-2 align-items-end" onSubmit={submit}>
          <div className="col-sm-3">
            <label className="form-label small" htmlFor="lv-type">Type</label>
            <select id="lv-type" className="form-select form-select-sm" value={form.leaveType}
              onChange={(e) => setForm((f) => ({ ...f, leaveType: e.target.value }))} disabled={busy}>
              {LEAVE_TYPES.map((t) => <option key={t} value={t}>{cap(t)}</option>)}
            </select>
          </div>
          <div className="col-sm-3">
            <label className="form-label small" htmlFor="lv-start">From</label>
            <input id="lv-start" type="date" className="form-control form-control-sm" value={form.startDate}
              onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} disabled={busy} />
          </div>
          <div className="col-sm-3">
            <label className="form-label small" htmlFor="lv-end">To</label>
            <input id="lv-end" type="date" className="form-control form-control-sm" value={form.endDate}
              min={form.startDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} disabled={busy} />
          </div>
          <div className="col-sm-3">
            <button type="submit" className="btn btn-primary btn-sm w-100" disabled={busy}>
              {busy ? "Submitting…" : "Request"}
            </button>
          </div>
          <div className="col-12">
            <input type="text" className="form-control form-control-sm" placeholder="Reason (optional)"
              value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} disabled={busy} />
          </div>
          {formError && <div className="col-12"><div className="alert alert-danger py-2 mb-0">{formError}</div></div>}
        </form>
      </PageSection>

      <PageSection title="My requests" description="Everything you have filed, newest first.">
        {error && <ErrorState message={error} onRetry={reload} />}
        {!error && data === null && <LoadingSkeleton rows={2} label="Loading your leave" />}
        {data && data.length === 0 && (
          <EmptyState variant="empty" title="No leave requests" description="You have not requested any time off yet." />
        )}
        {data && data.length > 0 && (
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead className="table-light">
                <tr><th>Type</th><th>Dates</th><th>Status</th></tr>
              </thead>
              <tbody>
                {data.map((r) => (
                  <tr key={r.id}>
                    <td className="text-capitalize">{r.leaveType}</td>
                    <td>{formatDate(r.startDate)}{r.endDate !== r.startDate ? ` – ${formatDate(r.endDate)}` : ""}</td>
                    <td><StatusBadge tone={leaveTone(r.status)} label={cap(r.status)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageSection>
    </>
  );
}

const CERTS = [["cpr", "CPR"], ["evoc", "EVOC"], ["emt", "EMT"], ["paramedic", "Paramedic"]];

function ProfileTab() {
  const { data, error, reload } = useLoad(getMyProfile);
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (data === null) return <LoadingSkeleton rows={3} label="Loading your profile" />;

  const Field = ({ label, value }) => (
    <div className="col-sm-6 col-lg-4 mb-2">
      <div className="text-secondary small text-uppercase">{label}</div>
      <div style={{ color: "var(--ems-text-primary)" }}>{value || "—"}</div>
    </div>
  );

  return (
    <>
      <PageSection title="My details" description="Ask HR to update anything that is out of date.">
        <div className="row">
          <Field label="Name" value={`${data.firstName} ${data.lastName}`} />
          <Field label="Employee #" value={data.employeeNumber} />
          <Field label="Role" value={data.role} />
          <Field label="Qualification" value={data.qualification} />
          <Field label="Hire date" value={data.hireDate && formatDate(data.hireDate)} />
          <Field label="Phone" value={data.phone} />
          <Field label="Email" value={data.email} />
          <Field label="Status" value={cap(data.status)} />
        </div>
      </PageSection>

      <PageSection title="My certifications" description="Renewal is tracked by HR; check the dates below.">
        <div className="table-responsive">
          <table className="table table-sm align-middle mb-0">
            <thead className="table-light"><tr><th>Certification</th><th>Held</th><th>Expires</th></tr></thead>
            <tbody>
              {CERTS.map(([key, label]) => {
                const c = data[key] || {};
                return (
                  <tr key={key}>
                    <td>{label}</td>
                    <td>{c.hasLicense ? "Yes" : "—"}</td>
                    <td>{c.expirationDate ? formatDate(c.expirationDate) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </PageSection>
    </>
  );
}
