import { useEffect, useState } from "react";

import { getPunctualityReport } from "../api/reportsApi";

/** Local YYYY-MM-DD for the last 30 days (inclusive). */
function last30() {
  const iso = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 29);
  return { start: iso(start), end: iso(end) };
}

const GROUPINGS = [
  { key: "driver", label: "By driver" },
  { key: "crew", label: "By crew" },
];

/**
 * Crew/driver punctuality, visible to dispatchers as well as management, so the
 * whole team can see who is chronically late. Dispatcher-vs-dispatcher ratings
 * stay in the management-only Reports page — this shows only driver and crew.
 */
export default function CrewPunctualityPage() {
  const [range] = useState(last30);
  const [groupBy, setGroupBy] = useState("driver");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async (gb) => {
    setLoading(true);
    setError("");
    try {
      setData(await getPunctualityReport(range.start, range.end, gb));
    } catch (e) {
      setError(e.message || "Failed to load punctuality.");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(groupBy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = (gb) => { setGroupBy(gb); load(gb); };

  const rateText = (s) => (s.onTimeRate === null ? "—" : `${s.onTimeRate}%`);
  const rateClass = (s) =>
    s.onTimeRate === null ? ""
      : s.onTimeRate >= 90 ? "text-success"
        : s.onTimeRate >= 75 ? "text-warning" : "text-danger";

  return (
    <div className="container mt-4">
      <div className="card shadow-sm p-3 mb-4">
        <h4 className="mb-1">Crew punctuality</h4>
        <p className="text-muted mb-3">
          On-time arrivals over the last 30 days — so the whole team can see who is running late.
        </p>
        <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
          <div className="btn-group btn-group-sm" role="group" aria-label="Group by">
            {GROUPINGS.map((g) => (
              <button key={g.key} type="button"
                className={`btn ${groupBy === g.key ? "btn-primary" : "btn-outline-secondary"}`}
                onClick={() => pick(g.key)} disabled={loading}>{g.label}</button>
            ))}
          </div>
          {data && (
            <span className="text-muted small">
              Late = arriving more than <strong>{data.graceMinutes} min</strong> after the scheduled time.
            </span>
          )}
        </div>
        {error && <div className="alert alert-danger mt-3 mb-0">{error}</div>}
      </div>

      <div className="card shadow-sm">
        <div className="card-body">
          <h5 className="mb-3">On-time performance (worst first)</h5>
          {loading ? (
            <p className="text-muted mb-0">Loading…</p>
          ) : !data || data.rows.length === 0 ? (
            <p className="text-muted mb-0">
              No completed trips with scheduled times in the last 30 days.
            </p>
          ) : (
            <div className="table-responsive">
              <table className="table table-sm table-hover align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th>{groupBy === "crew" ? "Crew" : "Driver"}</th>
                    <th className="text-end">Pickup on-time</th>
                    <th className="text-end">Late / measured</th>
                    <th className="text-end">Avg late</th>
                    <th className="text-end">Worst</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.key}>
                      <td>{r.label}</td>
                      <td className={`text-end ${rateClass(r.pickup)}`}>{rateText(r.pickup)}</td>
                      <td className="text-end">
                        {r.pickup.measured ? `${r.pickup.late} / ${r.pickup.measured}` : "—"}
                      </td>
                      <td className="text-end">{r.pickup.late ? `${r.pickup.avgLateMinutes}m` : "—"}</td>
                      <td className="text-end">{r.pickup.late ? `${r.pickup.maxLateMinutes}m` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
