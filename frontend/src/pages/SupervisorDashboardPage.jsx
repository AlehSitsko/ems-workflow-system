import React, { useEffect, useState } from "react";
import { getDispatcherAnalytics } from "../api/callsApi";
import { getPunctualityReport } from "../api/reportsApi";

/** Local YYYY-MM-DD for the last 7 days (inclusive), keyed by the operational day. */
function last7Days() {
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 6);
  return { start: iso(start), end: iso(end) };
}

const SupervisorDashboardPage = () => {
  const [dispatcherStats, setDispatcherStats] = useState([]);
  const [punctuality, setPunctuality] = useState(null); // { graceMinutes, rows }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Return Bootstrap badge color based on average quality score.
  const getScoreColor = (score) => {
    if (score === null || score === undefined) {
      return "secondary";
    }

    if (score >= 80) {
      return "success";
    }

    if (score >= 50) {
      return "warning";
    }

    return "danger";
  };

  // Render average quality score as a Bootstrap badge.
  const renderScoreBadge = (score) => {
    if (score === null || score === undefined) {
      return <span className="badge bg-secondary">No data</span>;
    }

    return (
      <span className={`badge bg-${getScoreColor(score)}`}>
        {score}%
      </span>
    );
  };

  // Load dispatcher analytics from the backend.
  const loadDispatcherAnalytics = async () => {
    setLoading(true);
    setError("");

    try {
      const range = last7Days();
      const [data, punc] = await Promise.all([
        getDispatcherAnalytics(),
        getPunctualityReport(range.start, range.end, "driver").catch(() => null),
      ]);
      setDispatcherStats(data);
      setPunctuality(punc);
    } catch (err) {
      console.error("Failed to load dispatcher analytics:", err);
      setError("Failed to load dispatcher analytics.");
    } finally {
      setLoading(false);
    }
  };

  // Load analytics automatically when the page opens.
  useEffect(() => {
    loadDispatcherAnalytics();
  }, []);

  return (
    <div className="container mt-4">
      <div className="card shadow-sm p-3 mb-4">
        <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
          <div>
            <h4 className="mb-1">Supervisor Dashboard</h4>
            <p className="text-muted mb-0">
              Dispatcher performance and call quality overview.
            </p>
          </div>

          <button
            type="button"
            className="btn btn-primary"
            onClick={loadDispatcherAnalytics}
            disabled={loading}
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>

        {error && (
          <div className="alert alert-danger mt-3 mb-0">
            {error}
          </div>
        )}
      </div>

      {punctuality && (
        <div className="card shadow-sm mb-4">
          <div className="card-body">
            <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
              <h5 className="mb-0">Driver punctuality — last 7 days</h5>
              <span className="text-muted small">
                Late = &gt; {punctuality.graceMinutes} min ·{" "}
                <a href="#/reports">full punctuality report →</a>
              </span>
            </div>
            {punctuality.rows.length === 0 ? (
              <p className="text-muted mb-0">No completed trips with scheduled times yet.</p>
            ) : (
              <div className="table-responsive">
                <table className="table table-sm table-hover align-middle mb-0">
                  <thead className="table-light">
                    <tr>
                      <th>Driver</th>
                      <th className="text-end">Pickup on-time</th>
                      <th className="text-end">Late / measured</th>
                      <th className="text-end">Worst</th>
                    </tr>
                  </thead>
                  <tbody>
                    {punctuality.rows.slice(0, 5).map((r) => (
                      <tr key={r.key}>
                        <td>{r.label}</td>
                        <td className="text-end">
                          {r.pickup.onTimeRate === null ? "—" : `${r.pickup.onTimeRate}%`}
                        </td>
                        <td className="text-end">
                          {r.pickup.measured ? `${r.pickup.late} / ${r.pickup.measured}` : "—"}
                        </td>
                        <td className="text-end">{r.pickup.late ? `${r.pickup.maxLateMinutes}m` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="card shadow-sm">
        <div className="card-body">
          <h5 className="mb-3">Dispatcher Analytics</h5>

          {dispatcherStats.length === 0 ? (
            <p className="text-muted mb-0">
              No dispatcher analytics available.
            </p>
          ) : (
            <div className="table-responsive">
              <table className="table table-bordered table-hover align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Dispatcher</th>
                    <th>Total Calls</th>
                    <th>Average Quality</th>
                    <th>Missing Critical Fields</th>
                    <th>Missing Optional Fields</th>
                    <th>Incomplete Calls</th>
                    <th>Explanations</th>
                  </tr>
                </thead>

                <tbody>
                  {dispatcherStats.map((dispatcher) => (
                    <tr key={dispatcher.dispatcher_name}>
                      <td>{dispatcher.dispatcher_name || "Unknown"}</td>

                      <td>{dispatcher.total_calls}</td>

                      <td>
                        {renderScoreBadge(dispatcher.average_quality_score)}
                      </td>

                      <td>{dispatcher.missing_critical_count}</td>

                      <td>{dispatcher.missing_optional_count}</td>

                      <td>{dispatcher.calls_with_missing_critical}</td>

                      <td>{dispatcher.calls_with_explanation}</td>
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
};

export default SupervisorDashboardPage;