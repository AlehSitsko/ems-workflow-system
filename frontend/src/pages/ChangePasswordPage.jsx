import React, { useState } from "react";

import { changePassword } from "../api/authApi";

// A full-screen forced password change. Shown by App when the signed-in user's
// password has expired: the server refuses every other API call until they rotate,
// so there is nowhere else for them to go. `onChanged` receives the updated user
// (passwordExpired cleared) so the app can let them back in.
const ChangePasswordPage = ({ user, onChanged, onLogout }) => {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (next !== confirm) {
      setError("The new password and its confirmation do not match.");
      return;
    }
    setLoading(true);
    try {
      const updated = await changePassword(current, next);
      onChanged(updated);
    } catch (err) {
      setError(err.message || "Could not change the password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mt-5">
      <div className="row justify-content-center">
        <div className="col-md-5">
          <div className="card shadow-sm">
            <div className="card-body">
              <h4 className="mb-1">Update your password</h4>
              <p className="text-muted small mb-3">
                Your password has expired{user?.username ? ` (${user.username})` : ""}. Set a new
                one to continue.
              </p>

              <form onSubmit={submit}>
                <div className="mb-3">
                  <label className="form-label" htmlFor="cp-current">Current password</label>
                  <input id="cp-current" type="password" className="form-control" autoComplete="current-password"
                         value={current} onChange={(e) => setCurrent(e.target.value)} disabled={loading} />
                </div>
                <div className="mb-3">
                  <label className="form-label" htmlFor="cp-new">New password</label>
                  <input id="cp-new" type="password" className="form-control" autoComplete="new-password"
                         value={next} onChange={(e) => setNext(e.target.value)} disabled={loading} />
                  <div className="form-text">
                    At least 10 characters, with a letter and a number, and not your username.
                  </div>
                </div>
                <div className="mb-3">
                  <label className="form-label" htmlFor="cp-confirm">Confirm new password</label>
                  <input id="cp-confirm" type="password" className="form-control" autoComplete="new-password"
                         value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={loading} />
                </div>

                {error && <div className="alert alert-danger py-2">{error}</div>}

                <div className="d-flex gap-2">
                  <button type="submit" className="btn btn-primary" disabled={loading}>
                    {loading ? "Saving…" : "Set new password"}
                  </button>
                  <button type="button" className="btn btn-outline-secondary" onClick={onLogout} disabled={loading}>
                    Sign out
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChangePasswordPage;
