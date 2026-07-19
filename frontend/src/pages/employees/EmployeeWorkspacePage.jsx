import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FaPen, FaIdBadge, FaCertificate, FaCalendarAlt } from "react-icons/fa";

import EntityWorkspace from "../../components/workspace/EntityWorkspace";
import { PageSection } from "../../components/ui/Page";
import { EntityField, ActivityTimeline } from "../../components/ui/Entity";
import { EmptyState, ErrorState, LoadingSkeleton } from "../../components/ui/States";
import StatusBadge from "../../components/ui/StatusBadge";
import { EmployeeAvatar } from "../../components/taxonomy/TaxonomyBadges";
import DocumentsTab from "../../components/DocumentsTab";
import TimePayTab from "../../components/TimePayTab";
import { useUserSettings } from "../../context/useUserSettings";
import { hasEmployeeAccess } from "../../api/authApi";
import { getEmployee, getEmployeeShifts } from "../../api/employeesApi";
import { getTasks } from "../../api/tasksApi";
import { getAuditLog } from "../../api/auditApi";
import { getEmployeeRoleClass, getEmployeeRoleLabel } from "../../utils/employeeRoleUtils";
import { describeQualification, ADMIN_ROLES } from "../../utils/taxonomy";

const ADMIN_ROLE_LABEL = Object.fromEntries(ADMIN_ROLES.map((r) => [r.value, r.label]));
import { getLicenseStatus, getCprWarning } from "../../utils/licenseUtils";
import { formatDate, formatDateTime } from "../../utils/dateDisplay";

const CERTS = [
  ["cpr", "CPR"],
  ["evoc", "EVOC"],
  ["emt", "EMT"],
  ["paramedic", "Paramedic"],
];

// License status string → semantic tone.
const LICENSE_TONE = {
  Active: "success",
  "Expiring Soon": "warning",
  Expired: "danger",
  "No License": "neutral",
};

const EMPLOYEE_STATUS_TONE = {
  active: "success", vacation: "info", sick: "warning", suspended: "danger", terminated: "neutral",
};

const TASK_STATUS_TONE = {
  New: "neutral", Assigned: "info", "In Progress": "info", Waiting: "warning",
  Done: "purple", Completed: "success", Cancelled: "neutral",
};

const SHIFT_STATUS_TONE = {
  scheduled: "info", active: "success", near_end: "warning",
  delayed: "warning", completed: "neutral", cancelled: "neutral",
};

const AUDIT_LABEL = {
  "employee.created": "Employee record created",
  "employee.updated": "Employee details updated",
  "employee.deleted": "Employee record deleted",
};

/**
 * Employee Workspace.
 *
 * Every tab is backed by a real endpoint, following the Vehicle Workspace
 * reference. Schedule and Leave are honestly disabled: there is no
 * employee-shifts endpoint yet, and leave management (roadmap Phase 4d) does not
 * exist — a disabled tab with a reason beats an empty tab that implies it does.
 */
export default function EmployeeWorkspacePage({ currentUser }) {
  const { employeeId } = useParams();
  const navigate = useNavigate();
  const { settings } = useUserSettings();
  const timeFormat = settings?.ui?.time_format || "12h";

  const canView = hasEmployeeAccess(currentUser);

  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notFound, setNotFound] = useState(false);

  const [tabData, setTabData] = useState({ tasks: null, activity: null, shifts: null });
  const [tabState, setTabState] = useState({});


  const loadEmployee = useCallback(() => {
    setLoading(true);
    setError(null);
    setNotFound(false);
    return getEmployee(employeeId)
      .then(setEmployee)
      .catch((err) => {
        if (err.status === 404) setNotFound(true);
        else setError(err.message || "Failed to load employee");
      })
      .finally(() => setLoading(false));
  }, [employeeId]);

  useEffect(() => {
    if (!canView) { setLoading(false); return; }
    loadEmployee();
  }, [loadEmployee, canView]);

  const loadTab = useCallback((key, loader) => {
    setTabState((s) => (s[key] === "loading" ? s : { ...s, [key]: "loading" }));
    loader()
      .then((data) => {
        setTabData((d) => ({ ...d, [key]: data }));
        setTabState((s) => ({ ...s, [key]: "ready" }));
      })
      .catch((err) => setTabState((s) => ({ ...s, [key]: err.message || "Failed to load" })));
  }, []);

  useEffect(() => {
    if (!employee) return;
    if (tabData.tasks === null && tabState.tasks === undefined) {
      loadTab("tasks", () =>
        getTasks({ assigned_to_employee_id: employeeId }, currentUser).then((d) => d.items || []));
    }
    if (tabData.activity === null && tabState.activity === undefined) {
      loadTab("activity", () => getAuditLog(
        { entity_type: "employee", entity_id: employeeId, per_page: 50 },
        { "X-User-Role": currentUser?.role || "", "X-User-Id": String(currentUser?.id || "") },
      ).then((d) => d.entries || d.items || (Array.isArray(d) ? d : [])));
    }
    if (tabData.shifts === null && tabState.shifts === undefined) {
      loadTab("shifts", () => getEmployeeShifts(employeeId));
    }
  }, [employee, employeeId, currentUser, loadTab, tabData, tabState]);

  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "qualifications", label: "Qualifications" },
    { key: "documents", label: "Documents" },
    { key: "timepay", label: "Time & Pay" },
    { key: "tasks", label: "Tasks" },
    { key: "schedule", label: "Schedule" },
    { key: "activity", label: "Activity" },
    {
      key: "leave",
      label: "Leave",
      disabled: true,
      disabledReason: "Employee leave management is not built yet (roadmap Phase 4d)",
    },
  ];

  const fullName = employee ? `${employee.firstName} ${employee.lastName}`.trim() : "Employee";
  const cprWarning = employee ? getCprWarning(employee) : "";

  const renderTab = (activeTab) => {
    if (!employee) return null;

    if (activeTab === "overview") {
      return (
        <div className="workspace-grid">
          <PageSection title="Identity">
            <EntityField label="Name" value={fullName} />
            <EntityField label="Employee number" value={employee.employeeNumber || null} />
            <EntityField
              label="Qualification"
              value={employee.qualification ? describeQualification(employee.qualification).label : null}
            />
            <EntityField
              label="Administrative role"
              value={employee.adminRole ? (ADMIN_ROLE_LABEL[employee.adminRole] || employee.adminRole) : null}
            />
            <EntityField
              label="Status"
              value={<StatusBadge tone={EMPLOYEE_STATUS_TONE[employee.status] || "neutral"} label={employee.status || "active"} />}
            />
            <EntityField
              label="Employment"
              value={<StatusBadge tone={employee.isActive ? "success" : "neutral"} label={employee.isActive ? "Active" : "Inactive"} />}
            />
          </PageSection>

          <PageSection title="Contact">
            <EntityField label="Phone" value={employee.phone || null} />
            <EntityField label="Email" value={employee.email || null} />
          </PageSection>

          <PageSection title="Employment">
            <EntityField label="Hire date" value={employee.hireDate ? formatDate(employee.hireDate) : null} />
            <EntityField label="Date of birth" value={employee.dob ? formatDate(employee.dob) : null} />
            {cprWarning && (
              <EntityField label="CPR" value={<StatusBadge tone="danger" label={cprWarning} />} />
            )}
          </PageSection>

          {employee.notes && (
            <PageSection title="Notes">
              <p className="mb-0">{employee.notes}</p>
            </PageSection>
          )}
        </div>
      );
    }

    if (activeTab === "qualifications") {
      return (
        <PageSection
          title="Certifications"
          description="Held certifications and their current status. Scanned certificate files live under Documents."
        >
          <div className="entity-list">
            {CERTS.map(([key, label]) => {
              const lic = employee[key] || {};
              const status = getLicenseStatus(lic);
              return (
                <div key={key} className="cert-row">
                  <span className="cert-row-icon" aria-hidden="true"><FaCertificate /></span>
                  <div className="cert-row-body">
                    <span className="cert-row-name">{label}</span>
                    {lic.expirationDate && (
                      <span className="cert-row-expiry">Expires {formatDate(lic.expirationDate)}</span>
                    )}
                  </div>
                  <StatusBadge tone={LICENSE_TONE[status] || "neutral"} label={status} />
                </div>
              );
            })}
          </div>
        </PageSection>
      );
    }

    if (activeTab === "documents") {
      return <DocumentsTab employeeId={employee.id} currentUser={currentUser} />;
    }

    if (activeTab === "timepay") {
      return <TimePayTab employeeId={employee.id} currentUser={currentUser} />;
    }

    if (activeTab === "tasks") {
      const state = tabState.tasks;
      if (state === "loading" || state === undefined) return <LoadingSkeleton rows={3} label="Loading tasks" />;
      if (state && state !== "ready") {
        return <ErrorState message={state} onRetry={() => loadTab("tasks", () => getTasks({ assigned_to_employee_id: employeeId }, currentUser).then((d) => d.items || []))} />;
      }
      const tasks = tabData.tasks || [];
      if (!tasks.length) {
        return <EmptyState variant="empty" title="No tasks assigned" description="Tasks assigned to this employee will appear here." />;
      }
      return (
        <PageSection title="Assigned tasks">
          <div className="task-list">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="task-list-card"
                onClick={() => navigate("/tasks")}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter") navigate("/tasks"); }}
              >
                <div>
                  <div className="task-list-title">{task.title}</div>
                  <div className="task-list-meta">{task.task_type}</div>
                </div>
                <div><StatusBadge tone={TASK_STATUS_TONE[task.status] || "neutral"} label={task.status} /></div>
                <div>{task.priority}</div>
                <div>
                  {task.due_date ? formatDate(task.due_date) : "—"}
                  {task.is_overdue && <span className="task-overdue-tag">Overdue</span>}
                </div>
              </div>
            ))}
          </div>
        </PageSection>
      );
    }

    if (activeTab === "schedule") {
      const state = tabState.shifts;
      if (state === "loading" || state === undefined) return <LoadingSkeleton rows={3} label="Loading shifts" />;
      if (state && state !== "ready") {
        return <ErrorState message={state} onRetry={() => loadTab("shifts", () => getEmployeeShifts(employeeId))} />;
      }
      const shifts = tabData.shifts || [];
      if (!shifts.length) {
        return <EmptyState variant="empty" title="No shifts yet" description="Shifts this employee is rostered on will appear here." />;
      }
      return (
        <PageSection title="Shift history" description="Shifts this employee has been rostered on, newest first.">
          <div className="entity-list">
            {shifts.map((s) => (
              <div key={s.id} className="cert-row">
                <span className="cert-row-icon" aria-hidden="true"><FaCalendarAlt /></span>
                <div className="cert-row-body">
                  <span className="cert-row-name">
                    {formatDate(s.shiftDate)} · Unit {s.truckNumber} ({s.unitType})
                  </span>
                  <span className="cert-row-expiry">
                    {s.startTime}{s.endTime ? `–${s.endTime}` : ""} · {s.shiftType === "night" ? "Night" : "Day"}
                    {s.role ? ` · ${s.role}` : ""}
                  </span>
                </div>
                <StatusBadge tone={SHIFT_STATUS_TONE[s.shiftStatus] || "neutral"} label={s.shiftStatus} />
              </div>
            ))}
          </div>
        </PageSection>
      );
    }

    if (activeTab === "activity") {
      const state = tabState.activity;
      if (state === "loading" || state === undefined) return <LoadingSkeleton rows={3} label="Loading activity" />;
      const entries = (tabData.activity || []).map((e) => ({
        id: e.id,
        title: AUDIT_LABEL[e.action] || e.action,
        timestamp: formatDateTime(e.timestamp, timeFormat),
        actor: e.user_name,
        tone: e.action === "employee.created" ? "success" : e.action === "employee.deleted" ? "warning" : "info",
        icon: <FaIdBadge />,
      }));
      return (
        <PageSection title="Recent activity" description="Recorded changes to this employee record.">
          <ActivityTimeline entries={entries} emptyLabel="No recorded activity for this employee yet." />
        </PageSection>
      );
    }

    return null;
  };

  return (
    <EntityWorkspace
      backTo="/employees"
      backLabel="Employees"
      title={fullName}
      subtitle={employee ? (employee.employeeNumber ? `#${employee.employeeNumber}` : "Employee") : null}
      icon={employee && <EmployeeAvatar name={fullName} qualification={employee.qualification} size={44} />}
      badges={employee && (
        <>
          <span className={`employee-role-badge ${getEmployeeRoleClass(employee.role)}`}>
            {getEmployeeRoleLabel(employee.role)}
          </span>
          <StatusBadge tone={EMPLOYEE_STATUS_TONE[employee.status] || "neutral"} label={employee.status || "active"} />
          {!employee.isActive && <StatusBadge tone="neutral" label="Inactive" />}
        </>
      )}
      actions={employee && (
        <button
          type="button"
          className="btn btn-outline-secondary btn-sm"
          onClick={() => navigate(`/employees/${employee.id}/edit`)}
        >
          <FaPen aria-hidden="true" /> Edit
        </button>
      )}
      tabs={tabs}
      loading={loading}
      error={error}
      notFound={notFound}
      canView={canView}
    >
      {renderTab}
    </EntityWorkspace>
  );
}
