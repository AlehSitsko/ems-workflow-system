import { useEffect, useState } from "react";

import { getMyOrg, updateMyOrg } from "../../api/tenantApi";

// Org admins edit their own organisation's name and light branding (timezone).
// The subdomain (slug) and active state are not editable here — the slug is the
// tenant's identity, and suspension is a platform decision.
export default function OrgSettings() {
  const [org, setOrg] = useState(null);
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("");
  const [ptoAnnual, setPtoAnnual] = useState("");
  const [ptoCarryover, setPtoCarryover] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getMyOrg()
      .then((o) => {
        setOrg(o);
        setName(o.name || "");
        setTimezone(o.settings?.timezone || "");
        setPtoAnnual(o.settings?.pto?.annualDays ?? "");
        setPtoCarryover(o.settings?.pto?.carryoverCapDays ?? "");
      })
      .catch((e) => setError(e.message));
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setError(""); setSaved(false); setBusy(true);
    const pto = {};
    if (ptoAnnual !== "") pto.annualDays = Number(ptoAnnual);
    if (ptoCarryover !== "") pto.carryoverCapDays = Number(ptoCarryover);
    try {
      const updated = await updateMyOrg({
        name: name.trim(),
        settings: { timezone: timezone.trim(), pto },
      });
      setOrg(updated);
      setSaved(true);
    } catch (err) {
      setError(err.message || "Could not save.");
    } finally {
      setBusy(false);
    }
  };

  if (error && !org) return <div className="alert alert-danger py-2">{error}</div>;
  if (!org) return null;

  return (
    <div className="card shadow-sm mb-4">
      <div className="card-body">
        <h5 className="mb-1">Organisation</h5>
        <p className="text-muted small mb-3">
          Reached at <code>{org.slug}</code>. Ask the platform operator to change the subdomain.
        </p>
        {error && <div className="alert alert-danger py-2">{error}</div>}
        {saved && <div className="alert alert-success py-2">Saved.</div>}
        <form onSubmit={save} className="row g-3">
          <div className="col-md-6">
            <label className="form-label" htmlFor="org-name">Name</label>
            <input id="org-name" className="form-control" value={name}
                   onChange={(e) => { setName(e.target.value); setSaved(false); }} disabled={busy} />
          </div>
          <div className="col-md-6">
            <label className="form-label" htmlFor="org-tz">Timezone</label>
            <input id="org-tz" className="form-control" value={timezone}
                   onChange={(e) => { setTimezone(e.target.value); setSaved(false); }} disabled={busy}
                   placeholder="America/New_York" />
          </div>

          <div className="col-12"><hr className="my-1" /><span className="text-muted small">PTO policy (defaults for staff without a personal allotment)</span></div>
          <div className="col-md-6">
            <label className="form-label" htmlFor="org-pto-annual">Annual PTO (days/year)</label>
            <input id="org-pto-annual" type="number" step="0.5" min="0" className="form-control" value={ptoAnnual}
                   onChange={(e) => { setPtoAnnual(e.target.value); setSaved(false); }} disabled={busy}
                   placeholder="15" />
          </div>
          <div className="col-md-6">
            <label className="form-label" htmlFor="org-pto-cap">Carryover cap (days)</label>
            <input id="org-pto-cap" type="number" step="0.5" min="0" className="form-control" value={ptoCarryover}
                   onChange={(e) => { setPtoCarryover(e.target.value); setSaved(false); }} disabled={busy}
                   placeholder="5" />
          </div>

          <div className="col-12">
            <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>
              {busy ? "Saving…" : "Save organisation"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
