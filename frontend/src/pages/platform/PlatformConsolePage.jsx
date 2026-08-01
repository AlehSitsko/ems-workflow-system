import { useEffect, useState } from "react";

import { listOrgs, createOrg, updateOrg, resetOrgAdmin } from "../../api/platformApi";

// The platform super-admin console: create organisations (each reachable at its
// own subdomain), suspend or reactivate them, and reset an org admin's password.
// Served on the platform host; the backend refuses these to anyone else.

const emptyForm = { name: "", slug: "", adminUsername: "admin", adminPassword: "" };

export default function PlatformConsolePage({ currentUser, onLogout }) {
  const [orgs, setOrgs] = useState(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const load = () => listOrgs().then(setOrgs).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setNotice(""); setBusy(true);
    try {
      await createOrg({ ...form, slug: form.slug.trim().toLowerCase() });
      setNotice(`Created ${form.name}.`);
      setForm(emptyForm);
      load();
    } catch (err) {
      setError(err.message || "Could not create the organisation.");
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (org) => {
    setError(""); setBusy(true);
    try {
      await updateOrg(org.id, { isActive: !org.is_active });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const resetAdmin = async (org) => {
    const username = window.prompt(`Which admin username in "${org.name}"?`, "admin");
    if (!username) return;
    const pw = window.prompt("New password (≥10 chars, a letter and a number):");
    if (!pw) return;
    setError(""); setNotice(""); setBusy(true);
    try {
      await resetOrgAdmin(org.id, username.trim(), pw);
      setNotice(`Reset ${username} in ${org.name}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container py-4" style={{ maxWidth: 960 }}>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h3 className="mb-0">Platform console</h3>
          <div className="text-muted small">Signed in as {currentUser?.username} · super-admin</div>
        </div>
        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onLogout}>Sign out</button>
      </div>

      {error && <div className="alert alert-danger py-2">{error}</div>}
      {notice && <div className="alert alert-success py-2">{notice}</div>}

      <div className="card shadow-sm mb-4">
        <div className="card-body">
          <h5 className="mb-3">Organisations</h5>
          {orgs === null && !error && <p className="text-muted mb-0">Loading…</p>}
          {orgs && orgs.length === 0 && <p className="text-muted mb-0">No organisations yet.</p>}
          {orgs && orgs.length > 0 && (
            <div className="table-responsive">
              <table className="table table-sm align-middle mb-0">
                <thead className="table-light">
                  <tr><th>Name</th><th>Subdomain</th><th>Users</th><th>Status</th><th></th></tr>
                </thead>
                <tbody>
                  {orgs.map((o) => (
                    <tr key={o.id}>
                      <td>{o.name}</td>
                      <td><code>{o.slug}</code></td>
                      <td>{o.userCount}</td>
                      <td>
                        {o.is_active
                          ? <span className="badge bg-success">Active</span>
                          : <span className="badge bg-secondary">Suspended</span>}
                      </td>
                      <td className="text-end">
                        <button type="button" className="btn btn-link btn-sm p-0 me-3"
                                onClick={() => resetAdmin(o)} disabled={busy}>Reset admin</button>
                        <button type="button"
                                className={`btn btn-link btn-sm p-0 ${o.is_active ? "text-danger" : "text-success"}`}
                                onClick={() => toggleActive(o)} disabled={busy}>
                          {o.is_active ? "Suspend" : "Reactivate"}
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

      <div className="card shadow-sm">
        <div className="card-body">
          <h5 className="mb-3">New organisation</h5>
          <form onSubmit={submit} className="row g-3">
            <div className="col-md-6">
              <label className="form-label" htmlFor="po-name">Name</label>
              <input id="po-name" className="form-control" value={form.name}
                     onChange={(e) => set({ name: e.target.value })} disabled={busy} />
            </div>
            <div className="col-md-6">
              <label className="form-label" htmlFor="po-slug">Subdomain</label>
              <input id="po-slug" className="form-control" value={form.slug}
                     onChange={(e) => set({ slug: e.target.value })} disabled={busy}
                     placeholder="acme" />
              <div className="form-text">Lowercase letters, digits and hyphens.</div>
            </div>
            <div className="col-md-6">
              <label className="form-label" htmlFor="po-admin">First admin username</label>
              <input id="po-admin" className="form-control" value={form.adminUsername}
                     onChange={(e) => set({ adminUsername: e.target.value })} disabled={busy} />
            </div>
            <div className="col-md-6">
              <label className="form-label" htmlFor="po-pass">First admin password</label>
              <input id="po-pass" type="password" className="form-control" value={form.adminPassword}
                     onChange={(e) => set({ adminPassword: e.target.value })} disabled={busy}
                     autoComplete="new-password" />
            </div>
            <div className="col-12">
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? "Working…" : "Create organisation"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
