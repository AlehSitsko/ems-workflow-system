import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { validateInvitation, acceptInvitation } from "../api/invitationsApi";
import PasswordInput from "../components/ui/PasswordInput";

// Public page: a user with an invitation link creates their own credentials. No
// session is required; the org and role are fixed by the (hashed) token server-side.
export default function AcceptInvitePage() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";

  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    if (!token) { setLoadError("This invitation link is missing its token."); setLoading(false); return; }
    validateInvitation(token)
      .then((data) => { if (active) { setInvite(data); setDisplayName(data.displayName || ""); } })
      .catch((e) => { if (active) setLoadError(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setSubmitting(true);
    try {
      await acceptInvitation({ token, username: username.trim(), password, displayName: displayName.trim() });
      // The server signed the new account in; reload the SPA so it picks up the session.
      window.location.assign(import.meta.env.BASE_URL);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <div className="container py-5" style={{ maxWidth: 460 }}>
      <div className="card">
        <div className="card-body">
          <h1 className="h4 mb-1">Accept your invitation</h1>

          {loading && <p className="text-muted">Checking your invitation…</p>}

          {!loading && loadError && (
            <div className="alert alert-danger" role="alert">{loadError}</div>
          )}

          {!loading && invite && (
            <>
              <p className="text-muted mb-3">
                You're joining <strong>{invite.organization || "the organization"}</strong> as{" "}
                <strong>{invite.role}</strong>
                {invite.email ? <> ({invite.email})</> : null}. Create your credentials to continue.
              </p>
              <form onSubmit={handleSubmit}>
                <div className="mb-3">
                  <label htmlFor="ai-username" className="form-label">Username</label>
                  <input id="ai-username" className="form-control" value={username}
                    onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
                </div>
                <div className="mb-3">
                  <label htmlFor="ai-display" className="form-label">Display name</label>
                  <input id="ai-display" className="form-control" value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)} />
                </div>
                <div className="mb-3">
                  <label htmlFor="ai-password" className="form-label">Password</label>
                  <PasswordInput id="ai-password" value={password}
                    onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
                  <div className="form-text">At least 10 characters, with a letter and a number.</div>
                </div>
                <div className="mb-3">
                  <label htmlFor="ai-confirm" className="form-label">Confirm password</label>
                  <PasswordInput id="ai-confirm" value={confirm}
                    onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
                </div>

                {error && <div className="alert alert-danger py-2" role="alert">{error}</div>}

                <button type="submit" className="btn btn-primary w-100" disabled={submitting}>
                  {submitting ? "Creating account…" : "Create account & continue"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
