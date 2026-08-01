import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { loginUser, saveCurrentUser } from "../api/authApi";
import { getCurrentTenant } from "../api/tenantApi";

const LoginPage = ({ onLogin }) => {
  const navigate = useNavigate();

  const [username, setUsername] = useState("dispatcher");
  const [password, setPassword] = useState("dispatcher");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // The workspace this subdomain belongs to (null on a bare host), so the login
  // screen greets the right organisation.
  const [workspace, setWorkspace] = useState(null);

  useEffect(() => {
    getCurrentTenant().then(setWorkspace).catch(() => setWorkspace(null));
  }, []);

  // Submit login credentials to the backend.
  const handleSubmit = async (e) => {
    e.preventDefault();

    setLoading(true);
    setError("");

    try {
      const user = await loginUser(username, password);

      saveCurrentUser(user);
      onLogin(user);

      // Ops staff land on the dashboard; an employee login goes to its portal.
      navigate(user.role === "employee" ? "/portal" : "/home", { replace: true });
    } catch (err) {
      console.error("Login failed:", err);
      setError(err.message || "Login failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mt-5">
      <div className="row justify-content-center">
        <div className="col-md-5">
          <div className="card shadow-sm">
            <div className="card-header bg-dark text-white">
              <h5 className="mb-0">{workspace ? `${workspace.name} — Sign in` : "EMS Workflow System Login"}</h5>
            </div>

            <div className="card-body">
              <p className="text-muted">
                {workspace
                  ? `Sign in to the ${workspace.name} workspace.`
                  : "Use your dispatcher, supervisor, or admin account to continue."}
              </p>

              {error && <div className="alert alert-danger">{error}</div>}

              <form onSubmit={handleSubmit}>
                <div className="mb-3">
                  <label htmlFor="username" className="form-label">
                    Username
                  </label>

                  <input
                    type="text"
                    className="form-control"
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={loading}
                    autoComplete="username"
                  />
                </div>

                <div className="mb-3">
                  <label htmlFor="password" className="form-label">
                    Password
                  </label>

                  <input
                    type="password"
                    className="form-control"
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    autoComplete="current-password"
                  />
                </div>

                <button
                  type="submit"
                  className="btn btn-primary w-100"
                  disabled={loading}
                >
                  {loading ? "Logging in..." : "Login"}
                </button>
              </form>

              <hr />

              <div className="small text-muted">
                <div>
                  <strong>Dev users:</strong>
                </div>
                <div>admin / admin</div>
                <div>supervisor / supervisor</div>
                <div>dispatcher / dispatcher</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;