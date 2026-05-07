import React, { useState } from "react";
import { getCalls } from "../api/callsApi";

const CallsPage = () => {
  const [calls, setCalls] = useState([]);
  const [dateOfCall, setDateOfCall] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Return Bootstrap badge color based on quality score.
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

  // Render quality score badge using structured backend data.
  const renderQualityBadge = (score) => {
    if (score === null || score === undefined) {
      return <span className="badge bg-secondary">—</span>;
    }

    return (
      <span className={`badge bg-${getScoreColor(score)}`}>
        {score}%
      </span>
    );
  };

  // Return date in YYYY-MM-DD format.
  const formatDate = (date) => date.toISOString().split("T")[0];

  // Get today's date.
  const getTodayDate = () => formatDate(new Date());

  // Load calls with optional filters.
  const loadCalls = async (dateFilter = "") => {
    setLoading(true);
    setError("");

    try {
      const data = await getCalls({
        date_of_call: dateFilter,
      });

      setCalls(data);
    } catch (err) {
      console.error("Failed to load calls:", err);
      setError("Failed to load calls.");
    } finally {
      setLoading(false);
    }
  };

  // Load calls using the manually selected date.
  const handleLoadByDate = () => {
    loadCalls(dateOfCall);
  };

  // Load all calls without date filtering.
  const handleLoadAll = () => {
    setDateOfCall("");
    loadCalls("");
  };

  // Load today's calls.
  const handleToday = () => {
    const today = getTodayDate();
    setDateOfCall(today);
    loadCalls(today);
  };

  // Clear filters and table results.
  const handleClear = () => {
    setDateOfCall("");
    setCalls([]);
    setError("");
  };

  return (
    <div className="container mt-4">
      <div className="card shadow-sm p-3 mb-4">
        <h4 className="mb-3">Global Call History</h4>

        <div className="row">
          <div className="col-md-4 mb-3">
            <label className="form-label">Date of Call</label>

            <input
              type="date"
              className="form-control"
              value={dateOfCall}
              onChange={(e) => setDateOfCall(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="col-md-8 d-flex align-items-end gap-2 flex-wrap mb-3">
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleLoadByDate}
              disabled={loading}
            >
              {loading ? "Loading..." : "Load by Date"}
            </button>

            <button
              type="button"
              className="btn btn-outline-primary"
              onClick={handleToday}
              disabled={loading}
            >
              Today
            </button>

            <button
              type="button"
              className="btn btn-outline-info"
              onClick={handleLoadAll}
              disabled={loading}
            >
              Load All
            </button>

            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={handleClear}
              disabled={loading}
            >
              Clear
            </button>
          </div>
        </div>

        {error && (
          <div className="alert alert-danger">
            {error}
          </div>
        )}
      </div>

      <div className="card shadow-sm">
        <div className="card-body">
          <h5 className="mb-3">Calls</h5>

          {calls.length === 0 ? (
            <p className="text-muted mb-0">
              No calls found.
            </p>
          ) : (
            <div className="table-responsive">
              <table className="table table-bordered table-hover align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Date of Call</th>
                    <th>Dispatcher</th>
                    <th>Quality</th>
                    <th>Trip Date</th>
                    <th>Pickup Time</th>
                    <th>Pickup</th>
                    <th>Dropoff</th>
                    <th>Caller Type</th>
                    <th>Call Type</th>
                    <th>Service</th>
                    <th>Notes</th>
                  </tr>
                </thead>

                <tbody>
                  {calls.map((call) => (
                    <tr key={call.id}>
                      <td>{call.date_of_call || "—"}</td>

                      <td>
                        {call.dispatcher_name || "—"}
                      </td>

                      <td>
                        {renderQualityBadge(call.quality_score)}
                      </td>

                      <td>{call.trip_date || "—"}</td>

                      <td>{call.pickup_time || "—"}</td>

                      <td>{call.pickup_address || "—"}</td>

                      <td>{call.dropoff_address || "—"}</td>

                      <td>{call.caller_type || "—"}</td>

                      <td>{call.call_type || "—"}</td>

                      <td>{call.service_level || "—"}</td>

                      <td style={{ whiteSpace: "pre-line" }}>
                        {call.notes || "—"}
                      </td>
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

export default CallsPage;