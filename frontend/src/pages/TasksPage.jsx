import React, { useEffect, useRef, useState } from "react";
import {
  FaCheckCircle,
  FaClipboardCheck,
  FaComments,
  FaEdit,
  FaHistory,
  FaPlus,
  FaTasks,
} from "react-icons/fa";

import { useConfirm } from "../components/ui/useConfirm";
import { useToast } from "../components/ui/useToast";
import EntityDrawer from "../components/ui/EntityDrawer";

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

const STATUS_BADGE = {
  New: "text-bg-secondary",
  Assigned: "text-bg-info",
  "In Progress": "text-bg-primary",
  Waiting: "text-bg-warning",
  Done: "text-bg-light",
  Completed: "text-bg-success",
  Cancelled: "text-bg-dark",
};

const PRIORITY_BADGE = {
  Low: "text-bg-secondary",
  Normal: "text-bg-info",
  High: "text-bg-warning",
  Urgent: "text-bg-danger",
};

const emptyTask = {
  title: "",
  description: "",
  task_type: "General Task",
  priority: "Normal",
  due_date: "",
  assigned_to_employee_id: "",
  related_module: "",
  related_entity_id: "",
};

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

  const [assignedTo, setAssignedTo] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [taskType, setTaskType] = useState("");
  const [dueBefore, setDueBefore] = useState("");
  const [dueAfter, setDueAfter] = useState("");
  const [createdBy, setCreatedBy] = useState("");
  const [showArchived, setShowArchived] = useState(false);

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
    loadTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buildFilters = (archivedOverride) => ({
    assigned_to_employee_id: assignedTo,
    status,
    priority,
    task_type: taskType,
    due_before: dueBefore,
    due_after: dueAfter,
    created_by_user_id: createdBy,
    is_archived: (archivedOverride ?? showArchived) ? "1" : "",
  });

  const loadTasks = async (filters = buildFilters()) => {
    setLoading(true);
    setError("");
    try {
      const data = await getTasks(filters, currentUser);
      setTasks(data.items);
      setTotal(data.total);
    } catch (err) {
      setError(err.message || "Failed to load tasks.");
    } finally {
      setLoading(false);
    }
  };

  const handleApplyFilters = () => loadTasks();

  const handleClear = () => {
    setAssignedTo("");
    setStatus("");
    setPriority("");
    setTaskType("");
    setDueBefore("");
    setDueAfter("");
    setCreatedBy("");
    setShowArchived(false);
    loadTasks({});
  };

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

  return (
    <div className="page-stack">
      <section className="content-panel">
        <div className="content-panel-header">
          <div>
            <h4><FaTasks style={{ marginRight: 8 }} />Staff Tasks</h4>
            <div style={{ fontSize: 12, color: "var(--ems-text-muted)" }}>
              Total: {total}
            </div>
          </div>
          {canCreate(role) && (
            <button className="btn btn-primary btn-sm" onClick={openCreateDrawer}>
              <FaPlus style={{ marginRight: 6 }} />Create Task
            </button>
          )}
        </div>

        {error && <div className="alert alert-danger">{error}</div>}

        <div className="row g-3">
          <div className="col-md-3">
            <label className="form-label">Assigned To</label>
            <select className="form-select" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
              <option value="">All employees</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>
              ))}
            </select>
          </div>
          <div className="col-md-3">
            <label className="form-label">Status</label>
            <select className="form-select" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All Statuses</option>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="col-md-3">
            <label className="form-label">Priority</label>
            <select className="form-select" value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="">All Priorities</option>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="col-md-3">
            <label className="form-label">Task Type</label>
            <select className="form-select" value={taskType} onChange={(e) => setTaskType(e.target.value)}>
              <option value="">All Types</option>
              {TASK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="col-md-3">
            <label className="form-label">Due After</label>
            <input type="date" className="form-control" value={dueAfter} onChange={(e) => setDueAfter(e.target.value)} />
          </div>
          <div className="col-md-3">
            <label className="form-label">Due Before</label>
            <input type="date" className="form-control" value={dueBefore} onChange={(e) => setDueBefore(e.target.value)} />
          </div>
          <div className="col-md-3">
            <label className="form-label">Created By</label>
            <select className="form-select" value={createdBy} onChange={(e) => setCreatedBy(e.target.value)}>
              <option value="">Anyone</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.display_name}</option>)}
            </select>
          </div>
          <div className="col-md-3 d-flex align-items-end gap-2">
            <button className="btn btn-primary" onClick={handleApplyFilters} disabled={loading}>
              {loading ? "Loading..." : "Apply Filters"}
            </button>
            <button className="btn btn-outline-secondary" onClick={handleClear}>Clear</button>
          </div>
          <div className="col-md-3 d-flex align-items-end">
            <div className="form-check form-switch">
              <input
                className="form-check-input"
                type="checkbox"
                checked={showArchived}
                onChange={(e) => { setShowArchived(e.target.checked); loadTasks(buildFilters(e.target.checked)); }}
              />
              <label className="form-check-label">Show archived</label>
            </div>
          </div>
        </div>
      </section>

      <section className="content-panel">
        <h5>Task List</h5>
        <div className="task-list">
          {tasks.length === 0 && !loading && (
            <div className="alert alert-light">No tasks found.</div>
          )}
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
                <span className={`badge ${STATUS_BADGE[task.status] || "text-bg-secondary"}`}>{task.status}</span>
              </div>
              <div>
                <span className={`badge ${PRIORITY_BADGE[task.priority] || "text-bg-secondary"}`}>{task.priority}</span>
              </div>
              <div>
                {formatDueDate(task.due_date)}
                {task.is_overdue && <span className="task-overdue-tag">Overdue</span>}
              </div>
              <div className="task-list-meta">{task.is_archived ? "Archived" : ""}</div>
            </div>
          ))}
        </div>
      </section>

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
                  <span className={`badge ${STATUS_BADGE[selectedTask.status]}`}>{selectedTask.status}</span>
                </div>
              </div>
              <div className="patient-detail-item">
                <div className="patient-detail-label">Priority</div>
                <div className="patient-detail-value">
                  <span className={`badge ${PRIORITY_BADGE[selectedTask.priority]}`}>{selectedTask.priority}</span>
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
