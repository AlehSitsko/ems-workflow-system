import React, { useCallback, useEffect, useState } from "react";
import { FaPlus } from "react-icons/fa";

import {
  createUser,
  getUsers,
  toggleUserActive,
  updateUser,
} from "../api/authApi";
import { kioskEmployees } from "../api/timeApi";
import EntityDrawer from "../components/ui/EntityDrawer";
import { useConfirm } from "../components/ui/useConfirm";
import { useToast } from "../components/ui/useToast";

const initialFormData = {
  username: "",
  password: "",
  display_name: "",
  role: "dispatcher",
  is_active: true,
  employee_id: "",
};

function UserManagementPage() {
  const confirm = useConfirm();
  const toast = useToast();
  const [users, setUsers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState(initialFormData);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getUsers();
      setUsers(data);
    } catch (err) {
      toast.error("Load failed", err.message || "Failed to load users.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadUsers();
    kioskEmployees().then(setEmployees).catch(() => {});
  }, [loadUsers]);

  const openCreate = () => {
    setEditingUser(null);
    setFormData(initialFormData);
    setFormError("");
    setDrawerOpen(true);
  };

  const openEdit = (user) => {
    setEditingUser(user);
    setFormData({
      username: user.username || "",
      password: "",
      display_name: user.display_name || "",
      role: user.role || "dispatcher",
      is_active: Boolean(user.is_active),
      employee_id: user.employee_id || "",
    });
    setFormError("");
    setDrawerOpen(true);
  };

  const handleClose = () => {
    setDrawerOpen(false);
    setEditingUser(null);
    setFormError("");
  };

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError("");

    if (!formData.username.trim()) { setFormError("Username is required."); return; }
    if (!formData.display_name.trim()) { setFormError("Display Name is required."); return; }
    if (!editingUser && !formData.password.trim()) { setFormError("Password is required."); return; }

    const payload = {
      username: formData.username.trim(),
      password: formData.password,
      display_name: formData.display_name.trim(),
      role: formData.role,
      is_active: formData.is_active,
      employee_id: formData.employee_id || null,
    };

    setSaving(true);
    try {
      if (editingUser) {
        await updateUser(editingUser.id, payload);
        toast.success("User updated", `"${payload.username}" saved.`);
      } else {
        await createUser(payload);
        toast.success("User created", `"${payload.username}" added.`);
      }
      handleClose();
      await loadUsers();
    } catch (err) {
      setFormError(err.message || "Failed to save user.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (user) => {
    const newStatus = !user.is_active;
    const ok = await confirm({
      title: newStatus ? `Activate "${user.username}"?` : `Deactivate "${user.username}"?`,
      message: newStatus
        ? "This user will regain access to the system."
        : "This user will lose access to the system.",
      variant: newStatus ? "info" : "danger",
      confirmLabel: newStatus ? "Activate" : "Deactivate",
    });
    if (!ok) return;

    setLoading(true);
    try {
      await toggleUserActive(user.id, newStatus);
      toast.success(newStatus ? "User activated" : "User deactivated", `"${user.username}" updated.`);
      await loadUsers();
    } catch (err) {
      toast.error("Update failed", err.message || "Failed to update user status.");
    } finally {
      setLoading(false);
    }
  };

  const drawerFooter = (
    <div className="d-flex gap-2">
      <button type="submit" form="user-form" className="btn btn-primary" disabled={saving}>
        {saving ? "Saving…" : editingUser ? "Update User" : "Create User"}
      </button>
      <button type="button" className="btn btn-outline-secondary" onClick={handleClose}>
        Cancel
      </button>
    </div>
  );

  return (
    <div className="page-stack">
      <section className="content-panel">
        <div className="content-panel-header">
          <div>
            <h4>User Management</h4>
            <p className="text-muted mb-0" style={{ fontSize: 13 }}>
              Create and manage EMS Workflow System user accounts.
            </p>
          </div>
          <button className="btn btn-sm btn-primary d-flex align-items-center gap-1" onClick={openCreate}>
            <FaPlus /> Add User
          </button>
        </div>

        {loading && users.length === 0 ? (
          <p className="text-muted">Loading users…</p>
        ) : users.length === 0 ? (
          <p className="text-muted">No users found.</p>
        ) : (
          <div className="table-responsive">
            <table className="table table-striped table-bordered align-middle mb-0">
              <thead className="table-light">
                <tr>
                  <th>ID</th>
                  <th>Username</th>
                  <th>Display Name</th>
                  <th>Role</th>
                  <th>Employee</th>
                  <th>Status</th>
                  <th style={{ width: 180 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} style={{ cursor: "pointer" }} onClick={() => openEdit(user)}>
                    <td>{user.id}</td>
                    <td>{user.username}</td>
                    <td>{user.display_name}</td>
                    <td>
                      <span className="badge text-bg-primary">{user.role}</span>
                    </td>
                    <td>
                      {user.employee_id
                        ? <span className="badge text-bg-info">
                            {employees.find((e) => e.id === user.employee_id)?.name || `#${user.employee_id}`}
                          </span>
                        : <span className="text-muted small">—</span>
                      }
                    </td>
                    <td>
                      <span className={`badge ${user.is_active ? "text-bg-success" : "text-bg-secondary"}`}>
                        {user.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="d-flex gap-2">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-primary"
                          onClick={() => openEdit(user)}
                          disabled={loading}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className={`btn btn-sm ${user.is_active ? "btn-outline-danger" : "btn-outline-success"}`}
                          onClick={() => handleToggleActive(user)}
                          disabled={loading}
                        >
                          {user.is_active ? "Deactivate" : "Activate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <EntityDrawer
        open={drawerOpen}
        onClose={handleClose}
        title={editingUser ? `Edit: ${editingUser.display_name}` : "New User"}
        subtitle={editingUser ? `@${editingUser.username}` : "Create a new system account"}
        footer={drawerFooter}
      >
        <form id="user-form" onSubmit={handleSubmit}>
          {formError && (
            <div className="alert alert-danger mb-3">{formError}</div>
          )}
          <div className="row g-3">
            <div className="col-md-6">
              <label htmlFor="username" className="form-label">Username</label>
              <input
                id="username"
                name="username"
                type="text"
                className="form-control"
                value={formData.username}
                onChange={handleChange}
                disabled={saving}
              />
            </div>

            <div className="col-md-6">
              <label htmlFor="display_name" className="form-label">Display Name</label>
              <input
                id="display_name"
                name="display_name"
                type="text"
                className="form-control"
                value={formData.display_name}
                onChange={handleChange}
                disabled={saving}
              />
            </div>

            <div className="col-12">
              <label htmlFor="password" className="form-label">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                className="form-control"
                value={formData.password}
                onChange={handleChange}
                disabled={saving}
                placeholder={editingUser ? "Leave blank to keep current password" : ""}
              />
            </div>

            <div className="col-md-6">
              <label htmlFor="role" className="form-label">Role</label>
              <select
                id="role"
                name="role"
                className="form-select"
                value={formData.role}
                onChange={handleChange}
                disabled={saving}
              >
                <option value="dispatcher">Dispatcher</option>
                <option value="hr">HR</option>
                <option value="supervisor">Supervisor</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <div className="col-md-6">
              <label htmlFor="employee_id" className="form-label">Linked Employee</label>
              <select
                id="employee_id"
                name="employee_id"
                className="form-select"
                value={formData.employee_id}
                onChange={handleChange}
                disabled={saving}
              >
                <option value="">— Not linked —</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
              <div className="form-text">Links this user to an employee record for clock-in/out.</div>
            </div>

            <div className="col-12">
              <div className="form-check">
                <input
                  id="is_active"
                  name="is_active"
                  type="checkbox"
                  className="form-check-input"
                  checked={formData.is_active}
                  onChange={handleChange}
                  disabled={saving}
                />
                <label htmlFor="is_active" className="form-check-label">Active User</label>
              </div>
            </div>
          </div>
        </form>
      </EntityDrawer>
    </div>
  );
}

export default UserManagementPage;
