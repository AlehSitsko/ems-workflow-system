import React, { useEffect, useState } from "react";

import {
  createUser,
  getUsers,
  toggleUserActive,
  updateUser,
} from "../api/authApi";
import { kioskEmployees } from "../api/timeApi";

const initialFormData = {
  username: "",
  password: "",
  display_name: "",
  role: "dispatcher",
  is_active: true,
  employee_id: "",
};

function UserManagementPage() {
  const [users, setUsers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [editingUserId, setEditingUserId] = useState(null);
  const [formData, setFormData] = useState(initialFormData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // Load all users from backend.
  const loadUsers = async () => {
    setLoading(true);
    setError("");

    try {
      const data = await getUsers();
      setUsers(data);
    } catch (err) {
      console.error("Failed to load users:", err);
      setError(err.message || "Failed to load users.");
    } finally {
      setLoading(false);
    }
  };

  // Load users and employee list on mount.
  useEffect(() => {
    loadUsers();
    kioskEmployees().then(setEmployees).catch(() => {});
  }, []);

  // Handle simple form field updates.
  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;

    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  // Reset form and exit edit mode.
  const resetForm = () => {
    setFormData(initialFormData);
    setEditingUserId(null);
  };

  // Load selected user into edit mode.
  const handleEdit = (user) => {
    setFormData({
      username: user.username || "",
      password: "",
      display_name: user.display_name || "",
      role: user.role || "dispatcher",
      is_active: Boolean(user.is_active),
      employee_id: user.employee_id || "",
    });

    setEditingUserId(user.id);

    setError("");
    setMessage("");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  // Create or update a user account.
  const handleSubmit = async (event) => {
    event.preventDefault();

    setError("");
    setMessage("");

    if (!formData.username.trim()) {
      setError("Username is required.");
      return;
    }

    if (!formData.display_name.trim()) {
      setError("Display Name is required.");
      return;
    }

    if (!editingUserId && !formData.password.trim()) {
      setError("Password is required.");
      return;
    }

    const payload = {
      username: formData.username.trim(),
      password: formData.password,
      display_name: formData.display_name.trim(),
      role: formData.role,
      is_active: formData.is_active,
      employee_id: formData.employee_id || null,
    };

    setLoading(true);

    try {
      if (editingUserId) {
        await updateUser(editingUserId, payload);

        setMessage("User updated successfully.");
      } else {
        await createUser(payload);

        setMessage("User created successfully.");
      }

      resetForm();

      await loadUsers();
    } catch (err) {
      console.error("Failed to save user:", err);

      setError(err.message || "Failed to save user.");
    } finally {
      setLoading(false);
    }
  };

  // Activate or deactivate a user account.
  const handleToggleActive = async (user) => {
    const newStatus = !user.is_active;

    const confirmed = window.confirm(
      newStatus
        ? `Activate user "${user.username}"?`
        : `Deactivate user "${user.username}"?`
    );

    if (!confirmed) {
      return;
    }

    setLoading(true);

    setError("");
    setMessage("");

    try {
      await toggleUserActive(user.id, newStatus);

      setMessage(
        newStatus
          ? "User activated successfully."
          : "User deactivated successfully."
      );

      await loadUsers();
    } catch (err) {
      console.error("Failed to update user status:", err);

      setError(err.message || "Failed to update user status.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mt-4">
      <div className="mb-4">
        <h1 className="mb-2">User Management</h1>

        <p className="text-muted mb-0">
          Create and manage EMS Workflow System user accounts.
        </p>
      </div>

      {error && (
        <div className="alert alert-danger">
          {error}
        </div>
      )}

      {message && (
        <div className="alert alert-success">
          {message}
        </div>
      )}

      <div className="card shadow-sm mb-4">
        <div className="card-header d-flex justify-content-between align-items-center">
          <h5 className="mb-0">
            {editingUserId ? "Edit User" : "Create User"}
          </h5>

          {editingUserId && (
            <span className="badge text-bg-info">
              Editing Mode
            </span>
          )}
        </div>

        <div className="card-body">
          <form onSubmit={handleSubmit}>
            <div className="row g-3">
              <div className="col-md-6">
                <label htmlFor="username" className="form-label">
                  Username
                </label>

                <input
                  id="username"
                  name="username"
                  type="text"
                  className="form-control"
                  value={formData.username}
                  onChange={handleChange}
                  disabled={loading}
                />
              </div>

              <div className="col-md-6">
                <label htmlFor="display_name" className="form-label">
                  Display Name
                </label>

                <input
                  id="display_name"
                  name="display_name"
                  type="text"
                  className="form-control"
                  value={formData.display_name}
                  onChange={handleChange}
                  disabled={loading}
                />
              </div>

              <div className="col-md-6">
                <label htmlFor="password" className="form-label">
                  Password
                </label>

                <input
                  id="password"
                  name="password"
                  type="password"
                  className="form-control"
                  value={formData.password}
                  onChange={handleChange}
                  disabled={loading}
                  placeholder={
                    editingUserId
                      ? "Leave blank to keep current password"
                      : ""
                  }
                />
              </div>

              <div className="col-md-3">
                <label htmlFor="role" className="form-label">
                  Role
                </label>

                <select
                  id="role"
                  name="role"
                  className="form-select"
                  value={formData.role}
                  onChange={handleChange}
                  disabled={loading}
                >
                  <option value="dispatcher">Dispatcher</option>
                  <option value="hr">HR</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div className="col-md-3">
                <label htmlFor="employee_id" className="form-label">
                  Linked Employee
                </label>
                <select
                  id="employee_id"
                  name="employee_id"
                  className="form-select"
                  value={formData.employee_id}
                  onChange={handleChange}
                  disabled={loading}
                >
                  <option value="">— Not linked —</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
                <div className="form-text">Links this user to an employee record for clock-in/out.</div>
              </div>

              <div className="col-md-3 d-flex align-items-end">
                <div className="form-check mb-2">
                  <input
                    id="is_active"
                    name="is_active"
                    type="checkbox"
                    className="form-check-input"
                    checked={formData.is_active}
                    onChange={handleChange}
                    disabled={loading}
                  />

                  <label
                    htmlFor="is_active"
                    className="form-check-label"
                  >
                    Active User
                  </label>
                </div>
              </div>

              <div className="col-12 d-flex gap-2">
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading}
                >
                  {editingUserId ? "Update User" : "Create User"}
                </button>

                {editingUserId && (
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={resetForm}
                    disabled={loading}
                  >
                    Cancel Edit
                  </button>
                )}

                <button
                  type="button"
                  className="btn btn-outline-info"
                  onClick={loadUsers}
                  disabled={loading}
                >
                  Refresh
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      <div className="card shadow-sm">
        <div className="card-header d-flex justify-content-between align-items-center">
          <h5 className="mb-0">System Users</h5>

          <span className="badge text-bg-secondary">
            {users.length}
          </span>
        </div>

        <div className="card-body">
          {loading && users.length === 0 ? (
            <p className="text-muted mb-0">
              Loading users...
            </p>
          ) : users.length === 0 ? (
            <p className="text-muted mb-0">
              No users found.
            </p>
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
                    <th style={{ width: "220px" }}>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td>{user.id}</td>

                      <td>{user.username}</td>

                      <td>{user.display_name}</td>

                      <td>
                        <span className="badge text-bg-primary">
                          {user.role}
                        </span>
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
                        <span
                          className={`badge ${
                            user.is_active
                              ? "text-bg-success"
                              : "text-bg-secondary"
                          }`}
                        >
                          {user.is_active
                            ? "Active"
                            : "Inactive"}
                        </span>
                      </td>

                      <td>
                        <div className="d-flex gap-2">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-primary"
                            onClick={() => handleEdit(user)}
                            disabled={loading}
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            className={`btn btn-sm ${
                              user.is_active
                                ? "btn-outline-danger"
                                : "btn-outline-success"
                            }`}
                            onClick={() => handleToggleActive(user)}
                            disabled={loading}
                          >
                            {user.is_active
                              ? "Deactivate"
                              : "Activate"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default UserManagementPage;