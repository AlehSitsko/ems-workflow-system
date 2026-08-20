import { useEffect, useState } from "react";
import { listInvitations, createInvitation, revokeInvitation } from "../../api/invitationsApi";

const ROLES = ["dispatcher", "supervisor", "hr", "admin", "employee"];

// Invite-only onboarding: an admin invites by email + role; the invitee opens the
// one-time link and creates their own credentials. The full link is shown once.
export default function InvitationsPanel() {
  const [invites, setInvites] = useState([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("dispatcher");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [lastLink, setLastLink] = useState(null); // { email, url } shown once
  const [copied, setCopied] = useState(false);

  async function refresh() {
    try { setInvites(await listInvitations()); } catch (e) { setError(e.message); }
  }
  useEffect(() => { refresh(); }, []);

  // Copy the invite link with a fallback for contexts where the async Clipboard
  // API is unavailable/blocked, plus a short "Copied!" confirmation.
  async function copyLink() {
    const text = lastLink?.url;
    if (!text) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  async function handleInvite(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const inv = await createInvitation({ email: email.trim(), role });
      const url = `${window.location.origin}${inv.acceptPath}`;
      setLastLink({ email: inv.email, url });
      setEmail("");
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke(id) {
    setError(null);
    try { await revokeInvitation(id); await refresh(); }
    catch (err) { setError(err.message); }
  }

  const badge = (status) => {
    const map = { pending: "bg-primary", accepted: "bg-success", revoked: "bg-secondary", expired: "bg-warning text-dark" };
    return <span className={`badge ${map[status] || "bg-secondary"}`}>{status}</span>;
  };

  return (
    <section className="content-panel">
      <div className="content-panel-header">
        <div>
          <h4>Invitations</h4>
          <p className="text-muted mb-0" style={{ fontSize: 13 }}>
            Invite a user by email and role. They create their own password from a one-time link.
          </p>
        </div>
      </div>

      <form className="row g-2 align-items-end mb-3" onSubmit={handleInvite}>
        <div className="col-md-5">
          <label htmlFor="inv-email" className="form-label mb-1">Email</label>
          <input id="inv-email" type="email" className="form-control" value={email}
            onChange={(e) => setEmail(e.target.value)} required placeholder="name@example.com" />
        </div>
        <div className="col-md-4">
          <label htmlFor="inv-role" className="form-label mb-1">Role</label>
          <select id="inv-role" className="form-select" value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className="col-md-3">
          <button type="submit" className="btn btn-primary w-100" disabled={busy}>
            {busy ? "Sending…" : "Send invite"}
          </button>
        </div>
      </form>

      {error && <div className="alert alert-danger py-2">{error}</div>}

      {lastLink && (
        <div className="alert alert-success" role="alert">
          <div className="fw-semibold mb-1">Invitation link for {lastLink.email}</div>
          <div className="small mb-2">
            Send this link to <strong>{lastLink.email}</strong>. They open it in a web
            browser, choose their own password, and their account is created with the
            role you selected. The link is <strong>single-use</strong> and expires — and
            it is shown here <strong>only once</strong>. If it's lost, revoke it below and
            send a new invite.
          </div>
          <div className="d-flex gap-2 align-items-center">
            <code className="text-break flex-grow-1">{lastLink.url}</code>
            <button type="button"
              className={`btn btn-sm ${copied ? "btn-success" : "btn-outline-dark"}`}
              onClick={copyLink}>{copied ? "Copied!" : "Copy"}</button>
          </div>
          <div className="small text-muted mt-2">
            Note: right now this link only opens on <strong>this computer</strong>
            (single-user mode). Remote/networked access is being added — after that,
            the link will work from other devices too.
          </div>
        </div>
      )}

      {invites.length === 0 ? (
        <p className="text-muted mb-0">No invitations yet.</p>
      ) : (
        <div className="table-responsive">
          <table className="table table-sm align-middle mb-0">
            <thead className="table-light">
              <tr><th>Email</th><th>Role</th><th>Status</th><th>Expires</th><th style={{ width: 100 }}></th></tr>
            </thead>
            <tbody>
              {invites.map((inv) => (
                <tr key={inv.id}>
                  <td>{inv.email}</td>
                  <td>{inv.role}</td>
                  <td>{badge(inv.status)}</td>
                  <td className="text-muted small">{inv.expiresAt?.slice(0, 16).replace("T", " ")}</td>
                  <td>
                    {inv.status === "pending" && (
                      <button className="btn btn-sm btn-outline-danger" onClick={() => handleRevoke(inv.id)}>
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
