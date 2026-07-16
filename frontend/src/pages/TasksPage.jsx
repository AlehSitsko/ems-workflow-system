import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  FaCheckCircle,
  FaClipboardCheck,
  FaComments,
  FaEdit,
  FaHistory,
  FaPlus,
  FaTimes,
} from "react-icons/fa";

import { useConfirm } from "../components/ui/useConfirm";
import { useToast } from "../components/ui/useToast";
import EntityDrawer from "../components/ui/EntityDrawer";
import { PageHeader, PageSection, PageToolbar, ToolbarField } from "../components/ui/Page";
import { EmptyState, ErrorState } from "../components/ui/States";
import StatusBadge from "../components/ui/StatusBadge";

import {
  getTasks,
  createTask,
  updateTask,
  updateTaskStatus,
  assignTask,
  archiveTask,
  getTaskComments,
  createTaskComment,
  getTaskActivity,
} from "../api/tasksApi";
import { getEmployees } from "../api/employeesApi";
import { getUsers } from "../api/authApi";

const TASK_TYPES = [
  "General Task", "Dispatcher Task", "HR Task", "Patient Follow-up",
  "Call Review", "Billing / Insurance", "Crew / Unit Issue",
  "Employee Documentation", "Training", "Compliance",
  "Internal Project", "Maintenance", "Other",
];
const HR_TASK_TYPES = ["HR Task", "Employee Documentation", "Training", "Compliance"];
const STATUSES = ["New", "Assigned", "In Progress", "Waiting", "Done", "Completed", "Cancelled"];
const PRIORITIES = ["Low", "Normal", "High", "Urgent"];

// Only the task's creator/assigner (or an admin) can close a task. Everyone
// else — including the assignee doing the work — can only move it up to
// "Done" and hand it back for review. Mirrors backend CLOSE_STATUSES /
// WORKER_ALLOWED_STATUSES in task_routes.py.
const CLOSE_STATUSES = ["Completed", "Cancelled"];
const WORKER_ALLOWED_STATUSES = ["In Progress", "Waiting", "Done"];

// Semantic tones, not Bootstrap colour classes: the same status reads the same
// way here as everywhere else in the app, in both themes.
const STATUS_TONE = {
  New: "neutral",
  Assigned: "info",
  "In Progress": "info",
  Waiting: "warning",
  Done: "purple",
  Completed: "success",
  Cancelled: "neutral",
};

const PRIORITY_TONE = {
  Low: "neutral",
  Normal: "info",
  High: "warning",
  Urgent: "danger",
};

const emptyTask = {
  title: "",
  description: "",
  task_type: "General Task",
  priority: "Normal",
  due_date: "",
  assigned_to_employee_id: "",
  participant_employee_ids: [],
  visible_to_all: false,
  related_module: "",
  related_entity_id: "",
};

// Every filter the list understands. Anything else in the URL is ignored rather
// than forwarded blindly to the API.
const FILTER_KEYS = [
  "assigned_to_employee_id", "status", "priority", "task_type",
  "due_before", "due_after", "created_by_user_id", "is_archived",
  "mine", "open", "unassigned", "overdue",
];

// Filters with no control in the toolbar: they arrive from a dashboard KPI link
// and are shown as removable chips, so the list never silently hides rows for a
// reason the user cannot see or undo.
const SCOPE_CHIPS = [
  { key: "mine", label: "Assigned to or raised by me" },
  { key: "overdue", label: "Overdue" },
  { key: "unassigned", label: "Unassigned" },
  { key: "open", label: "Open (not completed or cancelled)" },
];

function filtersFromParams(searchParams) {
  const out = {};
  FILTER_KEYS.forEach((key) => {
    const value = searchParams.get(key);
    if (value) out[key] = value;
  });
  return out;
}

const canCreate = (role) => ["admin", "supervisor", "hr"].includes(role);

// Mirrors backend _can_close_task: only an admin, or whoever created/assigned
// the task, may move it into a closed state (Completed/Cancelled).
const canCloseTask = (task, currentUser) =>
  !!currentUser &&
  (currentUser.role === "admin" ||
    currentUser.id === task?.assigned_by_user_id ||
    currentUser.id === task?.created_by_user_id);

const formatDueDate = (due) => {
  if (!due) return "—";
  try {
    return new Date(`${due}T00:00:00`).toLocaleDateString();
  } catch {
    return due;
  }
};

const TasksPage = ({ currentUser }) => {
  const confirm = useConfirm();
  const toast = useToast();
  const role = currentUser?.role || "";

  const [tasks, setTasks] = useState([]);
  const [total, setTotal] = useState(0);
  const [employees, setEmployees] = useState([]);
  const [users, setUsers] = useState([]);

  // The URL is the source of truth for filters. That is what makes a dashboard
  // KPI able to link to the exact list it counted, and what makes reload and
  // browser back/forward keep the view the user was looking at.
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => filtersFromParams(searchParams), [searchParams]);

  const setFilter = (patch) => {
    const next = { ...filters, ...patch };
    setSearchParams(
      Object.fromEntries(Object.entries(next).filter(([, v]) => v !== "" && v != null)),
      { replace: true },
    );
  };

  const assignedTo = filters.assigned_to_employee_id || "";
  const status = filters.status || "";
  const priority = filters.priority || "";
  const taskType = filters.task_type || "";
  const dueBefore = filters.due_before || "";
  const dueAfter = filters.due_after || "";
  const createdBy = filters.created_by_user_id || "";
  const showArchived = filters.is_archived === "1";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState("edit");
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [taskForm, setTaskForm] = useState(emptyTask);
  const formBaselineRef = useRef(emptyTask);
  const [saving, setSaving] = useState(false);

  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [activity, setActivity] = useState([]);

  useEffect(() => {
    getEmployees().then(setEmployees).catch(() => setEmployees([]));
    getUsers().then(setUsers).catch(() => setUsers([]));
  }, []);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getTasks({ ...filters, is_archived: filters.is_archived || "" }, currentUser);
      setTasks(data.items);
      setTotal(data.total);
    } catch (err) {
      setError(err.message || "Failed to load tasks.");
    } finally {
      setLoading(false);
    }
  }, [filters, currentUser]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  const handleClear = () => setSearchParams({}, { replace: true });

  const resetDrawer = () => {
    setDrawerOpen(false);
    setEditingTaskId(null);
    setSelectedTask(null);
    setTaskForm(emptyTask);
    setDrawerTab("edit");
    setComments([]);
    setActivity([]);
    setNewComment("");
  };

  const isFormDirty = () => {
    const baseline = formBaselineRef.current;
    return Object.keys(emptyTask).some((key) => taskForm[key] !== baseline[key]);
  };

  const closeDrawerSafely = async () => {
    if (saving) return;
    if (isFormDirty()) {
      const ok = await confirm({
        title: "Discard unsaved changes?",
        message: "All entered task information will be lost.",
        variant: "warning",
        confirmLabel: "Discard",
      });
      if (!ok) return;
    }
    resetDrawer();
  };

  const openCreateDrawer = () => {
    setEditingTaskId(null);
    setSelectedTask(null);
    setTaskForm(emptyTask);
    formBaselineRef.current = emptyTask;
    setDrawerTab("edit");
    setDrawerOpen(true);
  };

  const openEditDrawer = (task) => {
    const loaded = {
      title: task.title || "",
      description: task.description || "",
      task_type: task.task_type || "General Task",
      priority: task.priority || "Normal",
      due_date: task.due_date || "",
      assigned_to_employee_id: task.assigned_to_employee_id || "",
      participant_employee_ids: task.participant_employee_ids || [],
      visible_to_all: !!task.visible_to_all,
      related_module: task.related_module || "",
      related_entity_id: task.related_entity_id || "",
    };
    setEditingTaskId(task.id);
    setSelectedTask(task);
    setTaskForm(loaded);
    formBaselineRef.current = loaded;
    setDrawerTab("overview");
    setComments([]);
    setActivity([]);
    setDrawerOpen(true);
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setTaskForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleParticipantsChange = (e) => {
    const ids = Array.from(e.target.selectedOptions, (o) => Number(o.value));
    setTaskForm((prev) => ({ ...prev, participant_employee_ids: ids }));
  };

  const handleTabChange = async (key) => {
    setDrawerTab(key);
    if (!selectedTask) return;
    try {
      if (key === "comments" && comments.length === 0) {
        setComments(await getTaskComments(selectedTask.id, currentUser));
      }
      if (key === "activity" && activity.length === 0) {
        setActivity(await getTaskActivity(selectedTask.id, currentUser));
      }
    } catch (err) {
      toast.error("Failed to load", err.message);
    }
  };

  const handleSaveTask = async (e) => {
    e.preventDefault();
    if (!taskForm.title.trim()) {
      setError("Title is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        title: taskForm.title.trim(),
        description: taskForm.description,
        task_type: taskForm.task_type,
        priority: taskForm.priority,
        due_date: taskForm.due_date || null,
        participant_employee_ids: (taskForm.participant_employee_ids || []).map(Number),
        visible_to_all: !!taskForm.visible_to_all,
        related_module: taskForm.related_module || null,
        related_entity_id: taskForm.related_entity_id || null,
      };
      if (editingTaskId) {
        const updated = await updateTask(editingTaskId, payload, currentUser);
        if (taskForm.assigned_to_employee_id !== formBaselineRef.current.assigned_to_employee_id) {
          await assignTask(editingTaskId, taskForm.assigned_to_employee_id || null, currentUser);
        }
        toast.success("Task updated");
        setTasks((prev) => prev.map((t) => (t.id === updated.id ? { ...updated, assigned_to_employee_id: taskForm.assigned_to_employee_id } : t)));
      } else {
        payload.assigned_to_employee_id = taskForm.assigned_to_employee_id || null;
        await createTask(payload, currentUser);
        toast.success("Task created");
        await loadTasks();
      }
      resetDrawer();
    } catch (err) {
      setError(err.message || "Failed to save task.");
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (newStatus) => {
    if (!selectedTask) return;
    try {
      const updated = await updateTaskStatus(selectedTask.id, newStatus, currentUser);
      setSelectedTask(updated);
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      toast.success(`Status set to ${newStatus}`);
    } catch (err) {
      toast.error("Status change failed", err.message);
    }
  };

  const handleArchive = async () => {
    if (!selectedTask) return;
    const ok = await confirm({
      title: "Archive task?",
      message: "The task will be hidden from the active list. You can view it again with Show archived.",
      variant: "warning",
      confirmLabel: "Archive",
    });
    if (!ok) return;
    try {
      await archiveTask(selectedTask.id, currentUser);
      toast.success("Task archived");
      resetDrawer();
      await loadTasks();
    } catch (err) {
      toast.error("Archive failed", err.message);
    }
  };

  const handleAddComment = async () => {
    if (!selectedTask || !newComment.trim()) return;
    try {
      const comment = await createTaskComment(selectedTask.id, newComment.trim(), currentUser);
      setComments((prev) => [...prev, comment]);
      setNewComment("");
    } catch (err) {
      toast.error("Failed to add comment", err.message);
    }
  };

  const availableTaskTypes = role === "hr" ? HR_TASK_TYPES : TASK_TYPES;

  const activeScopes = SCOPE_CHIPS.filter((chip) => filters[chip.key] === "1");
  const hasFilters = Object.keys(filters).length > 0;

  return (
    <div className="page-stack">
      <PageHeader
        title="Staff Tasks"
        description="Assign and track staff work."
        count={`${total} ${total === 1 ? "task" : "tasks"}`}
        actions={canCreate(role) && (
          <button type="button" className="btn btn-primary" onClick={openCreateDrawer}>
            <FaPlus aria-hidden="true" /> Create Task
          </button>
        )}
      />

      {error && <div className="mb-3"><ErrorState message={error} onRetry={loadTasks} /></div>}

      {activeScopes.length > 0 && (
        <div className="filter-chips" aria-label="Active filters">
          {activeScopes.map((chip) => (
            <button
              key={chip.key}
              type="button"
              className="filter-chip"
              onClick={() => setFilter({ [chip.key]: "" })}
            >
              {chip.label}
              <FaTimes aria-hidden="true" />
              <span className="visually-hidden">Remove filter</span>
            </button>
          ))}
        </div>
      )}

      <PageToolbar onClear={handleClear} canClear={hasFilters}>
        <ToolbarField label="Assigned To">
          <select className="form-select" value={assignedTo}
                  onChange={(e) => setFilter({ assigned_to_employee_id: e.target.value })}>
            <option value="">All employees</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>
            ))}
          </select>
        </ToolbarField>
        <ToolbarField label="Status">
          <select className="form-select" value={status} onChange={(e) => setFilter({ status: e.target.value })}>
            <option value="">All Statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </ToolbarField>
        <ToolbarField label="Priority">
          <select className="form-select" value={priority} onChange={(e) => setFilter({ priority: e.target.value })}>
            <option value="">All Priorities</option>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </ToolbarField>
        <ToolbarField label="Task Type">
          <select className="form-select" value={taskType} onChange={(e) => setFilter({ task_type: e.target.value })}>
            <option value="">All Types</option>
            {TASK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </ToolbarField>
        <ToolbarField label="Due After">
          <input type="date" className="form-control" value={dueAfter}
                 onChange={(e) => setFilter({ due_after: e.target.value })} />
        </ToolbarField>
        <ToolbarField label="Due Before">
          <input type="date" className="form-control" value={dueBefore}
                 onChange={(e) => setFilter({ due_before: e.target.value })} />
        </ToolbarField>
        <ToolbarField label="Created By">
          <select className="form-select" value={createdBy}
                  onChange={(e) => setFilter({ created_by_user_id: e.target.value })}>
            <option value="">Anyone</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.display_name}</option>)}
          </select>
        </ToolbarField>
        <ToolbarField label="Archived">
          <div className="form-check form-switch toolbar-switch">
            <input
              id="tasks-show-archived"
              className="form-check-input"
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setFilter({ is_archived: e.target.checked ? "1" : "" })}
            />
            <label className="form-check-label" htmlFor="tasks-show-archived">Show archived</label>
          </div>
        </ToolbarField>
      </PageToolbar>

      <PageSection title="Task List">
        {loading && tasks.length === 0 && <p className="text-muted mb-0">Loading…</p>}

        {!loading && tasks.length === 0 && (
          <EmptyState
            variant={hasFilters ? "no-results" : "empty"}
            title={hasFilters ? "No tasks match these filters" : "No tasks yet"}
            description={hasFilters
              ? "Try removing a filter to widen the search."
              : "Tasks assigned to you, or raised by you, appear here."}
            action={hasFilters
              ? <button type="button" className="btn btn-outline-secondary" onClick={handleClear}>Clear filters</button>
              : undefined}
          />
        )}

        <div className="task-list">
          {tasks.map((task) => (
            <div key={task.id} className="task-list-card" onClick={() => openEditDrawer(task)}>
              <div>
                <div className="task-list-title">{task.title}</div>
                <div className="task-list-meta">{task.task_type}</div>
              </div>
              <div>
                {task.assigned_to_employee_name || "Unassigned"}
                {task.assigned_to_employee_active === false && (
                  <span className="task-list-meta"> (inactive)</span>
                )}
              </div>
              <div>
                <StatusBadge tone={STATUS_TONE[task.status] || "neutral"} label={task.status} />
              </div>
              <div>
                <StatusBadge tone={PRIORITY_TONE[task.priority] || "neutral"} label={task.priority} />
              </div>
              <div>
                {formatDueDate(task.due_date)}
                {task.is_overdue && <span className="task-overdue-tag">Overdue</span>}
              </div>
              <div className="task-list-meta">{task.is_archived ? "Archived" : ""}</div>
            </div>
          ))}
        </div>
      </PageSection>

      <EntityDrawer
        open={drawerOpen}
        onCloseRequested={closeDrawerSafely}
        title={editingTaskId ? "Edit Task" : "Create Task"}
        subtitle={editingTaskId ? selectedTask?.title : "New task"}
        width="50vw"
        tabs={editingTaskId ? [
          { key: "overview", label: "Overview" },
          { key: "comments", label: "Comments" },
          { key: "activity", label: "Activity" },
          ...(canCreate(role) ? [{ key: "edit", label: "Edit" }] : []),
        ] : undefined}
        activeTab={drawerTab}
        onTabChange={handleTabChange}
        footer={drawerTab === "edit" ? (
          <>
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={closeDrawerSafely}>
              Cancel
            </button>
            <button type="submit" form="task-drawer-form" className="btn btn-primary btn-sm" disabled={saving}>
              {saving ? "Saving..." : editingTaskId ? "Update Task" : "Create Task"}
            </button>
          </>
        ) : null}
      >
        {drawerTab === "overview" && selectedTask && (
          <div>
            <div className="patient-detail-grid">
              <div className="patient-detail-item">
                <div className="patient-detail-label">Status</div>
                <div className="patient-detail-value">
                  <StatusBadge tone={STATUS_TONE[selectedTask.status] || "neutral"} label={selectedTask.status} />
                </div>
              </div>
              <div className="patient-detail-item">
                <div className="patient-detail-label">Priority</div>
                <div className="patient-detail-value">
                  <StatusBadge tone={PRIORITY_TONE[selectedTask.priority] || "neutral"} label={selectedTask.priority} />
                </div>
              </div>
              <div className="patient-detail-item">
                <div className="patient-detail-label">Due Date</div>
                <div className="patient-detail-value">
                  {formatDueDate(selectedTask.due_date)}
                  {selectedTask.is_overdue && <span className="task-overdue-tag">Overdue</span>}
                </div>
              </div>
              <div className="patient-detail-item">
                <div className="patient-detail-label">Assigned To</div>
                <div className="patient-detail-value">
                  {selectedTask.assigned_to_employee_name || "Unassigned"}
                  {selectedTask.assigned_to_employee_active === false && " (inactive)"}
                </div>
              </div>
              <div className="patient-detail-item">
                <div className="patient-detail-label">Task Type</div>
                <div className="patient-detail-value">{selectedTask.task_type}</div>
              </div>
              <div className="patient-detail-item">
                <div className="patient-detail-label">Created By</div>
                <div className="patient-detail-value">{selectedTask.created_by_user_name || "—"}</div>
              </div>
              <div className="patient-detail-item">
                <div className="patient-detail-label">Related To</div>
                <div className="patient-detail-value">
                  {selectedTask.related_module ? `${selectedTask.related_module} #${selectedTask.related_entity_id}` : "—"}
                </div>
              </div>
            </div>

            <div className="patient-form-section" style={{ marginTop: "0.85rem" }}>
              <div className="patient-form-section-header">
                <span className="patient-form-section-icon"><FaClipboardCheck /></span>
                <h5>Description</h5>
              </div>
              <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{selectedTask.description || "No description."}</p>
            </div>

            <div className="patient-form-section">
              <div className="patient-form-section-header">
                <span className="patient-form-section-icon"><FaCheckCircle /></span>
                <h5>Quick Status Change</h5>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {STATUSES.filter((s) => {
                  if (CLOSE_STATUSES.includes(s)) return canCloseTask(selectedTask, currentUser);
                  if (!canCreate(role)) return WORKER_ALLOWED_STATUSES.includes(s);
                  return true;
                }).map((s) => (
                  <button
                    key={s}
                    className={`btn btn-sm ${selectedTask.status === s ? "btn-primary" : "btn-outline-secondary"}`}
                    onClick={() => handleStatusChange(s)}
                    disabled={selectedTask.status === s}
                  >
                    {s}
                  </button>
                ))}
              </div>
              {!canCloseTask(selectedTask, currentUser) && (
                <div className="text-muted" style={{ fontSize: 12, marginTop: 6 }}>
                  Only the task's creator or assigner can mark it Completed or Cancelled.
                </div>
              )}
            </div>

            {["admin", "supervisor"].includes(role) && !selectedTask.is_archived && (
              <button className="btn btn-outline-danger btn-sm mt-2" onClick={handleArchive}>
                Archive Task
              </button>
            )}
          </div>
        )}

        {drawerTab === "comments" && (
          <div>
            <div className="mb-3">
              <textarea
                className="form-control"
                rows={2}
                placeholder="Add a comment..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
              />
              <button className="btn btn-primary btn-sm mt-2" onClick={handleAddComment} disabled={!newComment.trim()}>
                <FaComments style={{ marginRight: 6 }} />Add Comment
              </button>
            </div>
            {comments.length === 0 && <div className="text-muted">No comments yet.</div>}
            {comments.map((c) => (
              <div key={c.id} className="task-comment-item">
                <div style={{ fontWeight: 700 }}>{c.author_name}</div>
                <div>{c.comment_text}</div>
                <div className="task-list-meta">{c.created_at}</div>
              </div>
            ))}
          </div>
        )}

        {drawerTab === "activity" && (
          <div>
            {activity.length === 0 && <div className="text-muted">No activity yet.</div>}
            {activity.map((a) => (
              <div key={a.id} className="task-activity-item">
                <FaHistory style={{ marginRight: 6, color: "var(--ems-text-muted)" }} />
                <strong>{a.action_type}</strong>
                {a.old_value && a.new_value ? ` — ${a.old_value} → ${a.new_value}` : (a.new_value ? `: ${a.new_value}` : "")}
                <span className="task-list-meta"> · {a.user_name} · {a.created_at}</span>
              </div>
            ))}
          </div>
        )}

        {drawerTab === "edit" && (
          <form id="task-drawer-form" onSubmit={handleSaveTask}>
            <div className="task-form-section">
              <div className="patient-form-section-header">
                <span className="patient-form-section-icon"><FaEdit /></span>
                <h5>Task Details</h5>
              </div>

              <label className="form-label">Title *</label>
              <input
                type="text" name="title" className="form-control mb-2"
                value={taskForm.title} onChange={handleFormChange} required
              />

              <label className="form-label">Description</label>
              <textarea
                name="description" className="form-control mb-2" rows={3}
                value={taskForm.description} onChange={handleFormChange}
              />

              <label className="form-label">Task Type</label>
              <select name="task_type" className="form-select mb-2" value={taskForm.task_type} onChange={handleFormChange}>
                {availableTaskTypes.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>

              <label className="form-label">Priority</label>
              <select name="priority" className="form-select mb-2" value={taskForm.priority} onChange={handleFormChange}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>

              <label className="form-label">Due Date</label>
              <input
                type="date" name="due_date" className="form-control mb-2"
                value={taskForm.due_date} onChange={handleFormChange}
              />

              {role !== "dispatcher" && (
                <>
                  <label className="form-label">Assigned To</label>
                  <select
                    name="assigned_to_employee_id" className="form-select mb-2"
                    value={taskForm.assigned_to_employee_id} onChange={handleFormChange}
                  >
                    <option value="">Unassigned</option>
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>
                    ))}
                  </select>

                  <label className="form-label">Participants (also see this task)</label>
                  <select
                    multiple
                    className="form-select mb-1"
                    size={Math.min(5, Math.max(3, employees.length))}
                    value={(taskForm.participant_employee_ids || []).map(String)}
                    onChange={handleParticipantsChange}
                    disabled={taskForm.visible_to_all}
                  >
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>
                    ))}
                  </select>
                  <div className="text-muted mb-2" style={{ fontSize: 12 }}>
                    Hold Ctrl/Cmd to select multiple. Participants see the task in
                    their list and calendar.
                  </div>

                  <div className="form-check mb-2">
                    <input
                      type="checkbox"
                      className="form-check-input"
                      id="task-visible-to-all"
                      checked={!!taskForm.visible_to_all}
                      onChange={(e) => setTaskForm((prev) => ({ ...prev, visible_to_all: e.target.checked }))}
                    />
                    <label className="form-check-label" htmlFor="task-visible-to-all">
                      Visible to everyone (announcement)
                    </label>
                  </div>
                </>
              )}
            </div>
          </form>
        )}
      </EntityDrawer>
    </div>
  );
};

export default TasksPage;
