import { useEffect, useState } from "react";
import { getOrgSecurity, generateRecoveryCodes } from "../../api/orgSecurityApi";

// Admin-only: the single-admin warning, current owners, and one-time recovery
// codes for emergency organisation recovery.
export default function OrgSecurity() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [codes, setCodes] = useState(null); // shown once, right after generating
  const [generating, setGenerating] = useState(false);

  async function refresh() {
    try {
      setData(await getOrgSecurity());
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => { refresh(); }, []);

  async function handleGenerate() {
    const ok = window.confirm(
      "Generate a new set of recovery codes? Any previous unused codes will stop working. " +
      "You'll see the new codes only once — save them somewhere safe."
    );
    if (!ok) return;
    setGenerating(true);
    setError(null);
    try {
      const result = await generateRecoveryCodes();
      setCodes(result.codes);
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  }

  if (error && !data) {
    return (
      <div className="card"><div className="card-body">
        <h2 className="h5">Organization security</h2>
        <div className="alert alert-danger py-2 mb-0">{error}</div>
      </div></div>
    );
  }
  if (!data) return null;

  return (
    <div className="card">
      <div className="card-body">
        <h2 className="h5">Organization security</h2>

        {data.isOnlyAdmin && (
          <div className="alert alert-warning py-2" role="alert">
            This organization has only one administrator. Add a backup administrator
            (invite one, or create a user) to reduce the risk of account lockout.
          </div>
        )}

        <div className="mb-3">
          <div className="text-muted small text-uppercase">Administrators</div>
          <div>{data.adminCount} admin{data.adminCount === 1 ? "" : "s"}
            {data.ownerCount ? <> · {data.ownerCount} owner{data.ownerCount === 1 ? "" : "s"}</> : null}</div>
          {data.owners?.length > 0 && (
            <div className="small text-muted">
              Owners: {data.owners.map((o) => o.displayName || o.username).join(", ")}
            </div>
          )}
        </div>

        <div className="mb-2">
          <div className="text-muted small text-uppercase">Emergency recovery codes</div>
          <div className="mb-2">
            {data.recoveryCodesRemaining > 0
              ? <>{data.recoveryCodesRemaining} unused code{data.recoveryCodesRemaining === 1 ? "" : "s"} available.</>
              : <>No recovery codes yet. Generate a set and store them offline — they let you regain admin access if everyone is locked out.</>}
          </div>
          <button type="button" className="btn btn-outline-secondary btn-sm"
            onClick={handleGenerate} disabled={generating}>
            {generating ? "Generating…" : (data.recoveryCodesTotal > 0 ? "Regenerate recovery codes" : "Generate recovery codes")}
          </button>
        </div>

        {error && <div className="alert alert-danger py-2 mt-2 mb-0">{error}</div>}

        {codes && (
          <div className="alert alert-success mt-3" role="alert">
            <div className="fw-semibold mb-1">Save these recovery codes now — they won't be shown again:</div>
            <pre className="mb-2" style={{ whiteSpace: "pre-wrap" }}>{codes.join("\n")}</pre>
            <button type="button" className="btn btn-sm btn-outline-dark"
              onClick={() => navigator.clipboard?.writeText(codes.join("\n"))}>
              Copy codes
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
