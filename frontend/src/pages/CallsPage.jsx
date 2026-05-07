import React, { useState } from "react";
import { getCalls } from "../api/callsApi";

const CallsPage = () => {
  const [calls, setCalls] = useState([]);
  const [tripDate, setTripDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Load all calls or filtered by date
  const handleLoadCalls = async () => {
    setLoading(true);
    setError("");

    try {
      const data = await getCalls({
        trip_date: tripDate,
      });

      setCalls(data);
    } catch (err) {
      console.error(err);
      setError("Failed to load calls");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mt-4">
      <div className="card shadow-sm p-3 mb-4">
        <h4 className="mb-3">Call History</h4>

        {/* Filter */}
        <div className="row">
          <div className="col-md-4 mb-3">
            <label className="form-label">Trip Date</label>
            <input
              type="date"
              className="form-control"
              value={tripDate}
              onChange={(e) => setTripDate(e.target.value)}
            />
          </div>

          <div className="col-md-4 d-flex align-items-end mb-3">
            <button
              className="btn btn-primary w-100"
              onClick={handleLoadCalls}
              disabled={loading}
            >
              {loading ? "Loading..." : "Load Calls"}
            </button>
          </div>
        </div>

        {error && <div className="alert alert-danger">{error}</div>}
      </div>

      {/* Table */}
      <div className="card shadow-sm">
        <div className="card-body">
          <h5>All Calls</h5>

          {calls.length === 0 ? (
            <p className="text-muted">No calls found.</p>
          ) : (
            <div className="table-responsive">
              <table className="table table-bordered table-hover">
                <thead className="table-light">
                  <tr>
                    <th>Date</th>
                    <th>Trip Date</th>
                    <th>Time</th>
                    <th>Pickup</th>
                    <th>Dropoff</th>
                    <th>Caller</th>
                    <th>Service</th>
                  </tr>
                </thead>

                <tbody>
                  {calls.map((call) => (
                    <tr key={call.id}>
                      <td>{call.date_of_call || "—"}</td>
                      <td>{call.trip_date || "—"}</td>
                      <td>{call.pickup_time || "—"}</td>
                      <td>{call.pickup_address || "—"}</td>
                      <td>{call.dropoff_address || "—"}</td>
                      <td>{call.caller_type || "—"}</td>
                      <td>{call.service_level || "—"}</td>
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