import React, { useEffect, useState } from "react";
import { getDispatcherAnalytics } from "../api/callsApi";

const SupervisorDashboardPage = () => {
  const [dispatcherStats, setDispatcherStats] = useState([]);
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
      const data = await getDispatcherAnalytics();
      setDispatcherStats(data);
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