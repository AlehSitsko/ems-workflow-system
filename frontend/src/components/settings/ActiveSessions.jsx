import { useEffect, useState } from "react";

import { getSessions, revokeSession, revokeOtherSessions } from "../../api/authApi";

// A friendly label from a raw User-Agent string — enough to recognise a device
// ("Chrome on Windows") without a parsing library.
function describeDevice(ua) {
  if (!ua) return "Unknown device";
  const browser =
    /Edg\//.test(ua) ? "Edge" :
    /Chrome\//.test(ua) ? "Chrome" :
    /Firefox\//.test(ua) ? "Firefox" :
    /Safari\//.test(ua) ? "Safari" : "Browser";
  const os =
    /Windows/.test(ua) ? "Windows" :
    /Android/.test(ua) ? "Android" :
    /iPhone|iPad|iOS/.test(ua) ? "iOS" :
    /Mac OS X/.test(ua) ? "macOS" :
    /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

function when(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

// The signed-in user's active devices, with the ability to sign a specific one
// out (or every other one). Revoking takes effect on that device's next request;
// revoking this device signs the current tab out via the 401 interceptor.
export default function ActiveSessions() {
  const [sessions, setSessions] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => {
    getSessions().then(setSessions).catch((e) => setError(e.message || "Failed to load sessions."));
  };

  useEffect(load, []);

  const doRevoke = async (id) => {
    setBusy(true);
    setError("");
    try {
      await revokeSession(id);
      load(); // if it was the current device, this 401s and the interceptor redirects
    } catch (e) {
      setError(e.message || "Failed to revoke the session.");
    } finally {
      setBusy(false);
    }
  };

  const doRevokeOthers = async () => {
    setBusy(true);
    setError("");
    try {
      await revokeOtherSessions();
      load();
    } catch (e) {
      setError(e.message || "Failed to sign out other devices.");
    } finally {
      setBusy(false);
    }
  };

  const others = (sessions || []).filter((s) => !s.current).length;

  return (
    <div className="card shadow-sm mb-4">
      <div className="card-body">
        <div className="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-2">
          <div>
            <h5 className="mb-1">Active sessions</h5>
            <p className="text-muted small mb-0">
              Devices signed in to your account. Sign out any you don't recognise.
            </p>
          </div>
          {others > 0 && (
            <button type="button" className="btn btn-outline-danger btn-sm"
                    onClick={doRevokeOthers} disabled={busy}>
              Sign out other devices ({others})
            </button>
          )}
        </div>

        {error && <div className="alert alert-danger py-2">{error}</div>}
        {sessions === null && !error && <p className="text-muted mb-0">Loading…</p>}
        {sessions && sessions.length === 0 && <p className="text-muted mb-0">No active sessions.</p>}

        {sessions && sessions.length > 0 && (
          <div className="table-responsive">
            <table className="table table-sm align-middle mb-0">
              <thead className="table-light">
                <tr><th>Device</th><th>Last active</th><th>Signed in</th><th></th></tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td>
                      {describeDevice(s.userAgent)}
                      {s.current && <span className="badge bg-success ms-2">This device</span>}
                    </td>
                    <td className="text-muted small">{when(s.lastSeenAt)}</td>
                    <td className="text-muted small">{when(s.createdAt)}</td>
                    <td className="text-end">
                      <button type="button" className="btn btn-link btn-sm text-danger p-0"
                              onClick={() => doRevoke(s.id)} disabled={busy}>
                        {s.current ? "Sign out" : "Revoke"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
