import React, { useState } from "react";
import {
  FaCalendarDay,
  FaClipboardList,
  FaFilter,
  FaSearch,
  FaStarHalfAlt,
  FaTimes,
} from "react-icons/fa";

import { getCalls } from "../api/callsApi";

const CallsPage = () => {
  const [calls, setCalls] = useState([]);

  const [dateOfCall, setDateOfCall] = useState("");
  const [dispatcherName, setDispatcherName] = useState("");
  const [minQualityScore, setMinQualityScore] = useState("");
  const [maxQualityScore, setMaxQualityScore] = useState("");

  const [expandedCallId, setExpandedCallId] = useState(null);

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
      return <span className="badge text-bg-secondary">—</span>;
    }

    return (
      <span className={`badge text-bg-${getScoreColor(score)}`}>
        {score}%
      </span>
    );
  };

  const renderIssueBadge = (call) => {
    if (call.missing_critical_fields) {
      return <span className="badge text-bg-danger">Critical</span>;
    }

    if (call.missing_optional_fields) {
      return <span className="badge text-bg-warning">Optional</span>;
    }

    return <span className="badge text-bg-success">Complete</span>;
  };

  // Return date in YYYY-MM-DD format.
  const formatDate = (date) => date.toISOString().split("T")[0];

  // Get today's date.
  const getTodayDate = () => formatDate(new Date());

  // Build filter object for the backend API.
  const buildFilters = () => {
    return {
      date_of_call: dateOfCall,
      dispatcher_name: dispatcherName,
      min_quality_score: minQualityScore,
      max_quality_score: maxQualityScore,
    };
  };

  // Load calls with current filters.
  const loadCalls = async (filters = buildFilters()) => {
    setLoading(true);
    setError("");

    try {
      const data = await getCalls(filters);
      setCalls(data);
    } catch (err) {
      console.error("Failed to load calls:", err);
      setError("Failed to load calls.");
    } finally {
      setLoading(false);
    }
  };

  // Load calls using all currently selected filters.
  const handleApplyFilters = () => {
    loadCalls();
  };

  // Load all calls without filtering.
  const handleLoadAll = () => {
    setDateOfCall("");
    setDispatcherName("");
    setMinQualityScore("");
    setMaxQualityScore("");

    loadCalls({});
  };

  // Load today's calls.
  const handleToday = () => {
    const today = getTodayDate();

    setDateOfCall(today);

    loadCalls({
      date_of_call: today,
      dispatcher_name: dispatcherName,
      min_quality_score: minQualityScore,
      max_quality_score: maxQualityScore,
    });
  };

  // Clear filters and table results.
  const handleClear = () => {
    setDateOfCall("");
    setDispatcherName("");
    setMinQualityScore("");
    setMaxQualityScore("");
    setCalls([]);
    setExpandedCallId(null);
    setError("");
  };

  const toggleCallDetails = (callId) => {
    setExpandedCallId((currentId) => (currentId === callId ? null : callId));
  };

  const callsWithCriticalMissing = calls.filter(
    (call) => call.missing_critical_fields
  ).length;

  const averageQualityScore =
    calls.length > 0
      ? Math.round(
          calls.reduce(
            (total, call) => total + (call.quality_score || 0),
            0
          ) / calls.length
        )
      : null;

  return (
    <div className="page-stack">
      <div className="page-summary-grid">
        <div className="page-summary-card">
          <div className="page-summary-icon">
            <FaClipboardList />
          </div>

          <div>
            <div className="page-summary-value">{calls.length}</div>
            <div className="page-summary-label">Loaded Calls</div>
          </div>
        </div>

        <div className="page-summary-card">
          <div className="page-summary-icon">
            <FaStarHalfAlt />
          </div>

          <div>
            <div className="page-summary-value">
              {averageQualityScore === null ? "—" : `${averageQualityScore}%`}
            </div>
            <div className="page-summary-label">Average Quality</div>
          </div>
        </div>

        <div className="page-summary-card">
          <div className="page-summary-icon warning">
            <FaFilter />
          </div>

          <div>
            <div className="page-summary-value">
              {callsWithCriticalMissing}
            </div>
            <div className="page-summary-label">Critical Missing</div>
          </div>
        </div>
      </div>

      <section className="content-panel">
        <div className="content-panel-header">
          <div>
            <h4>Call History Filters</h4>
            <p>Search call records by date, dispatcher, and quality score.</p>
          </div>
        </div>

        {error && (
          <div className="alert alert-danger">
            {error}
          </div>
        )}

        <div className="row g-3">
          <div className="col-md-3">
            <label className="form-label">Date of Call</label>

            <input
              type="date"
              className="form-control"
              value={dateOfCall}
              onChange={(e) => setDateOfCall(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="col-md-3">
            <label className="form-label">Dispatcher</label>

            <input
              type="text"
              className="form-control"
              placeholder="Dispatcher name"
              value={dispatcherName}
              onChange={(e) => setDispatcherName(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="col-md-3">
            <label className="form-label">Min Quality Score</label>

            <input
              type="number"
              className="form-control"
              placeholder="Example: 50"
              min="0"
              max="100"
              value={minQualityScore}
              onChange={(e) => setMinQualityScore(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="col-md-3">
            <label className="form-label">Max Quality Score</label>

            <input
              type="number"
              className="form-control"
              placeholder="Example: 100"
              min="0"
              max="100"
              value={maxQualityScore}
              onChange={(e) => setMaxQualityScore(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="col-12 d-flex align-items-end gap-2 flex-wrap">
            <button
              type="button"
              className="btn btn-primary d-inline-flex align-items-center gap-2"
              onClick={handleApplyFilters}
              disabled={loading}
            >
              <FaSearch />
              {loading ? "Loading..." : "Apply Filters"}
            </button>

            <button
              type="button"
              className="btn btn-outline-primary d-inline-flex align-items-center gap-2"
              onClick={handleToday}
              disabled={loading}
            >
              <FaCalendarDay />
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
              className="btn btn-outline-secondary d-inline-flex align-items-center gap-2"
              onClick={handleClear}
              disabled={loading}
            >
              <FaTimes />
              Clear
            </button>
          </div>
        </div>
      </section>

      <section className="content-panel">
        <div className="content-panel-header">
          <div>
            <h4>Calls</h4>
            <p>Loaded call records and quality tracking information.</p>
          </div>

          <span className="badge text-bg-secondary">
            {calls.length}
          </span>
        </div>

        {calls.length === 0 ? (
          <div className="empty-state">
            <FaClipboardList />

            <h5>No calls loaded</h5>

            <p>
              Apply filters, load today’s calls, or load all calls to view
              records.
            </p>
          </div>
        ) : (
          <div className="compact-call-list">
            {calls.map((call) => {
              const isExpanded = expandedCallId === call.id;

              return (
                <div className="compact-call-card" key={call.id}>
                  <div className="compact-call-main">
                    <div>
                      <div className="compact-call-date">
                        {call.date_of_call || "—"}
                      </div>

                      <div className="compact-call-muted">
                        Dispatcher: {call.dispatcher_name || "—"}
                      </div>
                    </div>

                    <div>
                      <div className="compact-call-label">Trip</div>

                      <div>
                        {call.trip_date || "—"}{" "}
                        {call.pickup_time ? `at ${call.pickup_time}` : ""}
                      </div>

                      <div className="compact-call-muted">
                        Appointment: {call.appointment_time || "—"}
                      </div>
                    </div>

                    <div className="compact-call-address">
                      <div className="compact-call-label">Route</div>

                      <div>
                        {call.pickup_address || "—"} →{" "}
                        {call.dropoff_address || "—"}
                      </div>
                    </div>

                    <div>
                      <div className="compact-call-label">Service</div>

                      <div>{call.service_level || "—"}</div>
                    </div>

                    <div>
                      <div className="compact-call-label">Quality</div>

                      {renderQualityBadge(call.quality_score)}
                    </div>

                    <div>
                      <div className="compact-call-label">Issues</div>

                      {renderIssueBadge(call)}
                    </div>

                    <button
                      type="button"
                      className="btn btn-sm btn-outline-primary"
                      onClick={() => toggleCallDetails(call.id)}
                    >
                      {isExpanded ? "Hide" : "Details"}
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="compact-call-details">
                      <div>
                        <strong>Caller Type:</strong>{" "}
                        {call.caller_type || "—"}
                      </div>

                      <div>
                        <strong>Call Type:</strong>{" "}
                        {call.call_type || "—"}
                      </div>

                      <div>
                        <strong>Pickup Time:</strong>{" "}
                        {call.pickup_time || "—"}
                      </div>

                      <div>
                        <strong>Appointment Time:</strong>{" "}
                        {call.appointment_time || "—"}
                      </div>

                      <div>
                        <strong>Missing Critical:</strong>{" "}
                        {call.missing_critical_fields || "—"}
                      </div>

                      <div>
                        <strong>Missing Optional:</strong>{" "}
                        {call.missing_optional_fields || "—"}
                      </div>

                      <div>
                        <strong>Explanation:</strong>{" "}
                        {call.missing_info_explanation || "—"}
                      </div>

                      <div>
                        <strong>Notes:</strong>{" "}
                        {call.notes || "—"}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

export default CallsPage;