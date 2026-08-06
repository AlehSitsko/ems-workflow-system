import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { loginUser, saveCurrentUser, checkNeedsSetup, setupFirstAdmin } from "../api/authApi";
import { getCurrentTenant } from "../api/tenantApi";

// Running inside the Electron desktop shell? (the web build never sets this).
const isDesktop = typeof window !== "undefined" && !!window.emsDesktop?.isDesktop;

const LoginPage = ({ onLogin }) => {
  const navigate = useNavigate();

  // On the desktop build there are no seeded dev users, so start blank.
  const [username, setUsername] = useState(isDesktop ? "" : "dispatcher");
  const [password, setPassword] = useState(isDesktop ? "" : "dispatcher");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [workspace, setWorkspace] = useState(null);

  // First-run state (a fresh local database with no users yet).
  const [needsSetup, setNeedsSetup] = useState(false);
  const [checking, setChecking] = useState(true);
  const [displayName, setDisplayName] = useState("");
  const [confirm, setConfirm] = useState("");

  useEffect(() => {
    getCurrentTenant().then(setWorkspace).catch(() => setWorkspace(null));
    checkNeedsSetup()
      .then(setNeedsSetup)
      .finally(() => setChecking(false));
  }, []);

  const finish = (user) => {
    saveCurrentUser(user);
    onLogin(user);
    navigate(user.role === "employee" ? "/portal" : "/home", { replace: true });
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      finish(await loginUser(username, password));
    } catch (err) {
      setError(err.message || "Login failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleSetup = async (e) => {
    e.preventDefault();
    if (password !== confirm) {
      setError("The passwords do not match.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      finish(await setupFirstAdmin(username, password, displayName || username));
    } catch (err) {
      setError(err.message || "Setup failed.");
    } finally {
      setLoading(false);
    }
  };

  const heading = needsSetup
    ? "Welcome — create your administrator account"
    : workspace ? `${workspace.name} — Sign in` : "EMS Workflow System Login";

  return (
    <div className="container mt-5">
      <div className="row justify-content-center">
        <div className="col-md-5">
          <div className="card shadow-sm">
            <div className="card-header bg-dark text-white">
              <h5 className="mb-0">{heading}</h5>
            </div>

            <div className="card-body">
              {checking ? (
                <p className="text-muted mb-0">Loading…</p>
              ) : needsSetup ? (
                <>
                  <p className="text-muted">
                    This is the first time the app has run on this computer. Create
                    the administrator account you will use to sign in.
                  </p>
                  {error && <div className="alert alert-danger">{error}</div>}
                  <form onSubmit={handleSetup}>
                    <div className="mb-3">
                      <label htmlFor="su-username" className="form-label">Username</label>
                      <input id="su-username" type="text" className="form-control" value={username}
                        onChange={(e) => setUsername(e.target.value)} disabled={loading}
                        autoComplete="username" required />
                    </div>
                    <div className="mb-3">
                      <label htmlFor="su-display" className="form-label">Display name (optional)</label>
                      <input id="su-display" type="text" className="form-control" value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)} disabled={loading} />
                    </div>
                    <div className="mb-3">
                      <label htmlFor="su-password" className="form-label">Password</label>
                      <input id="su-password" type="password" className="form-control" value={password}
                        onChange={(e) => setPassword(e.target.value)} disabled={loading}
                        autoComplete="new-password" required />
                      <div className="form-text">
                        At least 10 characters, with a letter and a number.
                      </div>
                    </div>
                    <div className="mb-3">
                      <label htmlFor="su-confirm" className="form-label">Confirm password</label>
                      <input id="su-confirm" type="password" className="form-control" value={confirm}
                        onChange={(e) => setConfirm(e.target.value)} disabled={loading}
                        autoComplete="new-password" required />
                    </div>
                    <button type="submit" className="btn btn-primary w-100" disabled={loading}>
                      {loading ? "Creating…" : "Create administrator"}
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <p className="text-muted">
                    {workspace
                      ? `Sign in to the ${workspace.name} workspace.`
                      : "Use your dispatcher, supervisor, or admin account to continue."}
                  </p>
                  {error && <div className="alert alert-danger">{error}</div>}
                  <form onSubmit={handleLogin}>
                    <div className="mb-3">
                      <label htmlFor="username" className="form-label">Username</label>
                      <input type="text" className="form-control" id="username" value={username}
                        onChange={(e) => setUsername(e.target.value)} disabled={loading}
                        autoComplete="username" />
                    </div>
                    <div className="mb-3">
                      <label htmlFor="password" className="form-label">Password</label>
                      <input type="password" className="form-control" id="password" value={password}
                        onChange={(e) => setPassword(e.target.value)} disabled={loading}
                        autoComplete="current-password" />
                    </div>
                    <button type="submit" className="btn btn-primary w-100" disabled={loading}>
                      {loading ? "Logging in..." : "Login"}
                    </button>
                  </form>

                  {!isDesktop && (
                    <>
                      <hr />
                      <div className="small text-muted">
                        <div><strong>Dev users:</strong></div>
                        <div>admin / admin</div>
                        <div>supervisor / supervisor</div>
                        <div>dispatcher / dispatcher</div>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
