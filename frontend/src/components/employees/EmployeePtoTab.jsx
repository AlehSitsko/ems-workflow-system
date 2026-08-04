import { useCallback, useEffect, useState } from "react";

import { getEmployeePto, runAccrual, adjustPto } from "../../api/ptoApi";

// HR view of an employee's PTO: current balance, the ledger, and the two actions
// that move it — run the (idempotent) monthly accrual, or post a manual
// correction. The balance is the sum of the ledger, never a stored number.
const KIND_LABEL = {
  accrual: "Accrual", used: "Used", carryover: "Carryover", adjustment: "Adjustment",
};

export default function EmployeePtoTab({ employeeId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [delta, setDelta] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(
    () => getEmployeePto(employeeId).then(setData).catch((e) => setError(e.message)),
    [employeeId],
  );
  useEffect(() => { load(); }, [load]);

  const doAccrual = async () => {
    setError(""); setBusy(true);
    try { await runAccrual(); await load(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const doAdjust = async (e) => {
    e.preventDefault();
    const n = Number(delta);
    if (!n) { setError("Enter a non-zero number of days."); return; }
    setError(""); setBusy(true);
    try {
      await adjustPto(employeeId, n, note.trim());
      setDelta(""); setNote("");
      await load();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  if (error && !data) return <div className="alert alert-danger py-2">{error}</div>;
  if (!data) return <p className="text-muted">Loading…</p>;

  const negative = data.balance < 0;

  return (
    <div className="d-flex flex-column gap-3">
      {error && <div className="alert alert-danger py-2 mb-0">{error}</div>}

      <div className="d-flex align-items-center gap-3 flex-wrap">
        <div className="card shadow-sm">
          <div className="card-body py-2 px-3 text-center">
            <div className={`display-6 mb-0 ${negative ? "text-danger" : ""}`}>{data.balance}</div>
            <div className="text-muted small text-uppercase">Days available</div>
          </div>
        </div>
        <div className="text-muted small">
          Allotment: {data.annualDays} days/year (accrues {(data.annualDays / 12).toFixed(2)}/month).
          {negative && <span className="text-danger d-block">Over budget — the balance is negative.</span>}
        </div>
        <button type="button" className="btn btn-outline-primary btn-sm ms-auto"
                onClick={doAccrual} disabled={busy}>
          {busy ? "Working…" : "Run accrual"}
        </button>
      </div>

      <form onSubmit={doAdjust} className="row g-2 align-items-end">
        <div className="col-auto">
          <label className="form-label small mb-1" htmlFor="pto-delta">Adjust (± days)</label>
          <input id="pto-delta" type="number" step="0.5" className="form-control form-control-sm"
                 style={{ width: 120 }} value={delta} onChange={(e) => setDelta(e.target.value)} disabled={busy} />
        </div>
        <div className="col">
          <label className="form-label small mb-1" htmlFor="pto-note">Note</label>
          <input id="pto-note" className="form-control form-control-sm" value={note}
                 onChange={(e) => setNote(e.target.value)} disabled={busy} placeholder="e.g. imported balance" />
        </div>
        <div className="col-auto">
          <button type="submit" className="btn btn-outline-secondary btn-sm" disabled={busy}>Apply</button>
        </div>
      </form>

      <div className="table-responsive">
        <table className="table table-sm table-hover align-middle mb-0">
          <thead className="table-light">
            <tr><th>Date</th><th>Type</th><th className="text-end">Days</th><th>Note</th></tr>
          </thead>
          <tbody>
            {data.ledger.length === 0 && (
              <tr><td colSpan={4} className="text-muted">No ledger entries yet.</td></tr>
            )}
            {data.ledger.map((e) => (
              <tr key={e.id}>
                <td>{e.effectiveDate}</td>
                <td>{KIND_LABEL[e.kind] || e.kind}</td>
                <td className={`text-end ${e.deltaDays < 0 ? "text-danger" : "text-success"}`}>
                  {e.deltaDays > 0 ? "+" : ""}{e.deltaDays}
                </td>
                <td className="text-muted small">{e.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
