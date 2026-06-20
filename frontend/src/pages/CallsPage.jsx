import React, { useRef, useState } from "react";
import {
  FaCalendarDay,
  FaClock,
  FaClipboardList,
  FaFilter,
  FaSearch,
  FaStarHalfAlt,
  FaTimes,
} from "react-icons/fa";

import { getCalls, uncancelCall, updateCall, createCall } from "../api/callsApi";
import { useToast } from "../components/ui/ToastProvider";
import EntityDrawer from "../components/ui/EntityDrawer";
import TimeInput from "../components/ui/TimeInput";

const CallsPage = ({ currentUser }) => {
  const toast = useToast();
  const [calls, setCalls] = useState([]);

  const [dateOfCall, setDateOfCall] = useState("");
  const [dispatcherName, setDispatcherName] = useState("");
  const [status, setStatus] = useState("");
  const [minQualityScore, setMinQualityScore] = useState("");
  const [maxQualityScore, setMaxQualityScore] = useState("");

  const [selectedCall, setSelectedCall] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState("summary");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const lastFilters = useRef({});

  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const [editForm, setEditForm] = useState({});
  const [editSaving, setEditSaving] = useState(false);

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

  const formatServiceLevel = (serviceLevel) => {
    if (!serviceLevel) {
      return "—";
    }

    if (serviceLevel === "bls") {
      return "BLS";
    }

    if (serviceLevel === "als") {
      return "ALS";
    }

    if (serviceLevel === "emergency") {
      return "Emergency";
    }

    if (serviceLevel === "stretcher") {
      return "Stretcher";
    }

    return serviceLevel;
  };

  const renderServiceBadge = (serviceLevel) => {
    if (!serviceLevel) {
      return <span className="badge text-bg-secondary">—</span>;
    }

    if (serviceLevel === "emergency") {
      return <span className="badge text-bg-danger">Emergency</span>;
    }

    return (
      <span className="badge text-bg-primary">
        {formatServiceLevel(serviceLevel)}
      </span>
    );
  };

  const formatCallStatus = (status) => {
    const normalizedStatus = status || "new";

    const labels = {
      new: "New",
      pending_assignment: "Pending Assignment",
      assigned: "Assigned",
      en_route: "En Route",
      arrived_pickup: "Arrived Pickup",
      patient_onboard: "Patient Onboard",
      arrived_destination: "Arrived Destination",
      completed: "Completed",
      cancelled: "Cancelled",
      no_show: "No Show",
      refused: "Refused",
    };

    return labels[normalizedStatus] || normalizedStatus;
  };

  const renderStatusBadge = (status) => {
    const normalizedStatus = status || "new";

    if (normalizedStatus === "new") {
      return <span className="badge text-bg-secondary">New</span>;
    }

    if (normalizedStatus === "completed") {
      return <span className="badge text-bg-success">Completed</span>;
    }

    if (normalizedStatus === "cancelled") {
      return <span className="badge text-bg-danger">Cancelled</span>;
    }

    return (
      <span className="badge text-bg-info">
        {formatCallStatus(normalizedStatus)}
      </span>
    );
  };

  const formatReceivedAt = (receivedAt) => {
    if (!receivedAt) {
      return "—";
    }

    const parsedDate = new Date(receivedAt);

    if (Number.isNaN(parsedDate.getTime())) {
      return receivedAt;
    }

    return parsedDate.toLocaleString();
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
      status,
      min_quality_score: minQualityScore,
      max_quality_score: maxQualityScore,
    };
  };

  const PER_PAGE = 25;

  // Load calls. append=true adds to existing list (Load more); false replaces.
  const loadCalls = async (filters = buildFilters(), pageNum = 1, append = false) => {
    lastFilters.current = filters;
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError("");

    try {
      const data = await getCalls(filters, pageNum, PER_PAGE);
      setCalls((prev) => append ? [...prev, ...data.items] : data.items);
      setPage(data.page);
      setTotal(data.total);
    } catch (err) {
      console.error("Failed to load calls:", err);
      setError("Failed to load calls.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleApplyFilters = () => loadCalls(buildFilters(), 1, false);

  const handleLoadAll = () => {
    setDateOfCall("");
    setDispatcherName("");
    setStatus("");
    setMinQualityScore("");
    setMaxQualityScore("");
    loadCalls({}, 1, false);
  };

  const handleToday = () => {
    const today = getTodayDate();
    setDateOfCall(today);
    const filters = { date_of_call: today, dispatcher_name: dispatcherName, status, min_quality_score: minQualityScore, max_quality_score: maxQualityScore };
    loadCalls(filters, 1, false);
  };

  const handleLoadMore = () => loadCalls(lastFilters.current, page + 1, true);

  const handleClear = () => {
    setDateOfCall("");
    setDispatcherName("");
    setStatus("");
    setMinQualityScore("");
    setMaxQualityScore("");
    setCalls([]);
    setSelectedCall(null);
    setDrawerOpen(false);
    setPage(1);
    setTotal(0);
    setError("");
  };

  const openCallDrawer = (call) => {
    setSelectedCall(call);
    setDrawerTab("summary");
    setEditForm({
      dispatcher_name: call.dispatcher_name || "",
      caller_type: call.caller_type || "",
      caller_phone: call.caller_phone || "",
      caller_note: call.caller_note || "",
      trip_date: call.trip_date || "",
      pickup_time: call.pickup_time || "",
      appointment_time: call.appointment_time || "",
      pickup_address: call.pickup_address || "",
      dropoff_address: call.dropoff_address || "",
      service_level: call.service_level || "",
      notes: call.notes || "",
      // Return ride fields (not persisted on main call — creates a new call)
      return_ride_option: "none",
      return_pickup: call.dropoff_address || "",
      return_destination: call.pickup_address || "",
      return_time: "",
      // Default return service level: emergency calls go home as BLS
      return_service_level: call.service_level === "emergency" ? "bls" : (call.service_level || "bls"),
    });
    setDrawerOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedCall) return;
    setEditSaving(true);
    const headers = {
      "X-User-Role": currentUser?.role || "",
      "X-User-Id":   String(currentUser?.id || ""),
      "X-User-Name": currentUser?.display_name || "",
    };
    try {
      // Save main call changes (strip return ride fields — they're not columns on Call)
      const { return_ride_option, return_pickup, return_destination, return_time, return_service_level, ...mainFields } = editForm;
      const updated = await updateCall(selectedCall.id, mainFields, headers);
      setCalls((prev) => prev.map((c) => c.id === updated.id ? updated : c));
      setSelectedCall(updated);

      // Create return leg as a separate call if requested
      if (return_ride_option !== "none" && return_pickup) {
        const isWillCall = return_ride_option === "will_call";
        const returnPayload = {
          patient_id: selectedCall.patient_id || null,
          dispatcher_name: updated.dispatcher_name,
          received_at: new Date().toISOString(),
          status: "new",
          date_of_call: updated.date_of_call,
          trip_date: updated.trip_date,
          pickup_time: isWillCall ? "" : (return_time || ""),
          appointment_time: "",
          pickup_address: return_pickup,
          dropoff_address: return_destination,
          caller_type: updated.caller_type,
          call_type: isWillCall ? "will_call" : "return",
          service_level: return_service_level,
          caller_phone: updated.caller_phone || null,
          caller_note: null,
          quality_score: 0,
          missing_critical_fields: "",
          missing_optional_fields: "",
          missing_info_explanation: "",
          notes: `${isWillCall ? "Will Call" : "Return"} leg for call #${selectedCall.id}`,
        };
        await createCall(returnPayload);
        toast.success("Call updated + return ride created");
        // Reset return ride option after creating
        setEditForm(f => ({ ...f, return_ride_option: "none", return_time: "" }));
      } else {
        toast.success("Call updated");
      }
    } catch (e) {
      toast.error("Save failed", e.message);
    }
    setEditSaving(false);
  };

  const handleUncancel = async (callId) => {
    const headers = {
      "X-User-Role": currentUser?.role || "",
      "X-User-Id":   String(currentUser?.id || ""),
    };
    try {
      await uncancelCall(callId, headers);
      const updated = { ...selectedCall, status: "new", cancel_reason: null };
      setCalls((prev) => prev.map((c) => c.id === callId ? updated : c));
      if (selectedCall?.id === callId) setSelectedCall(updated);
    } catch (e) { toast.error("Uncancel failed", e.message); }
  };

  const callsWithCriticalMissing = calls.filter(
    (call) => call.missing_critical_fields
  ).length;

  const emergencyCalls = calls.filter(
    (call) => call.service_level === "emergency"
  ).length;

  const newCalls = calls.filter((call) => !call.status || call.status === "new")
    .length;

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
      <section className="content-panel">
        <div className="content-panel-header">
          <div>
            <h4>Call History</h4>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
              {[
                { label: "Total", value: total || calls.length, color: "#0d6efd" },
                { label: "New", value: newCalls, color: "#198754" },
                { label: "Avg Quality", value: averageQualityScore === null ? "—" : `${averageQualityScore}%`, color: "#6f42c1" },
                { label: "Critical Missing", value: callsWithCriticalMissing, color: callsWithCriticalMissing > 0 ? "#ffc107" : "#6c757d" },
                { label: "Emergency", value: emergencyCalls, color: emergencyCalls > 0 ? "#dc3545" : "#6c757d" },
              ].map(s => (
                <span key={s.label} style={{
                  fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 20,
                  background: `${s.color}14`, color: s.color, border: `1px solid ${s.color}30`,
                }}>
                  {s.label}: {s.value}
                </span>
              ))}
            </div>
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
            <label className="form-label">Status</label>

            <select
              className="form-select"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              disabled={loading}
            >
              <option value="">All Statuses</option>
              <option value="new">New</option>
              <option value="pending_assignment">Pending Assignment</option>
              <option value="assigned">Assigned</option>
              <option value="en_route">En Route</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="no_show">No Show</option>
              <option value="refused">Refused</option>
            </select>
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
            {calls.length} / {total}
          </span>
        </div>

        {calls.length === 0 ? (
          <div className="empty-state">
            <FaClipboardList />
            <h5>No calls loaded</h5>
            <p>Apply filters, load today’s calls, or load all calls to view records.</p>
          </div>
        ) : (
          <div className="compact-call-list">
            {calls.map((call) => {
              const isSelected = selectedCall?.id === call.id;
              return (
                <div
                  className={`compact-call-card${isSelected ? " selected" : ""}`}
                  key={call.id}
                  style={{ cursor: "pointer" }}
                  onClick={() => openCallDrawer(call)}
                >
                  <div className="compact-call-main">
                    <div>
                      <div className="compact-call-date">{call.date_of_call || "—"}</div>
                      <div className="compact-call-muted">Dispatcher: {call.dispatcher_name || "—"}</div>
                      <div className="compact-call-muted">Received: {formatReceivedAt(call.received_at)}</div>
                    </div>
                    <div>
                      <div className="compact-call-label">Trip</div>
                      <div>{call.trip_date || "—"} {call.pickup_time ? `at ${call.pickup_time}` : ""}</div>
                      <div className="compact-call-muted">Appointment: {call.appointment_time || "—"}</div>
                    </div>
                    <div className="compact-call-address">
                      <div className="compact-call-label">Route</div>
                      <div>{call.pickup_address || "—"} → {call.dropoff_address || "—"}</div>
                    </div>
                    <div>
                      <div className="compact-call-label">Status</div>
                      {renderStatusBadge(call.status)}
                    </div>
                    <div>
                      <div className="compact-call-label">Service</div>
                      {renderServiceBadge(call.service_level)}
                    </div>
                    <div>
                      <div className="compact-call-label">Quality</div>
                      {renderQualityBadge(call.quality_score)}
                    </div>
                    <div>
                      <div className="compact-call-label">Issues</div>
                      {renderIssueBadge(call)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {calls.length > 0 && calls.length < total && (
          <div className="text-center mt-3">
            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={handleLoadMore}
              disabled={loadingMore}
            >
              {loadingMore ? "Loading..." : `Load more (${calls.length} of ${total})`}
            </button>
          </div>
        )}
      </section>

      <EntityDrawer
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setSelectedCall(null); }}
        title={selectedCall ? `Call — ${selectedCall.date_of_call || "—"}` : ""}
        subtitle={selectedCall ? `${selectedCall.dispatcher_name || "—"} · ${formatCallStatus(selectedCall.status)}` : ""}
        tabs={[
          { key: "summary", label: "Summary" },
          { key: "trip", label: "Trip" },
          { key: "quality", label: "Quality" },
          { key: "edit", label: "Edit" },
        ]}
        activeTab={drawerTab}
        onTabChange={setDrawerTab}
        footer={drawerTab === "edit" ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSaveEdit}
            disabled={editSaving}
          >
            {editSaving ? "Saving…" : "Save Changes"}
          </button>
        ) : null}
      >
        {selectedCall && drawerTab === "summary" && (
          <div className="patient-detail-grid">
            <Di label="Date" value={selectedCall.date_of_call} />
            <Di label="Received At" value={formatReceivedAt(selectedCall.received_at)} />
            <Di label="Dispatcher" value={selectedCall.dispatcher_name} />
            <Di label="Status" value={formatCallStatus(selectedCall.status)} />
            <Di label="Caller Type" value={selectedCall.caller_type} />
            <Di label="Call Type" value={selectedCall.call_type} />
            <Di label="Service Level" value={formatServiceLevel(selectedCall.service_level)} />
            <Di label="Notes" value={selectedCall.notes} />
            {selectedCall.status === "cancelled" && (
              <div style={{ gridColumn: "1 / -1" }}>
                <div style={{ fontSize: 12, color: "var(--bs-danger)", marginBottom: 8 }}>
                  Cancelled{selectedCall.cancel_reason ? `: ${selectedCall.cancel_reason}` : ""}
                </div>
                <button
                  className="btn btn-sm btn-outline-warning"
                  onClick={() => handleUncancel(selectedCall.id)}
                >
                  ↩ Uncancel
                </button>
              </div>
            )}
          </div>
        )}

        {selectedCall && drawerTab === "trip" && (
          <div className="patient-detail-grid">
            <Di label="Trip Date" value={selectedCall.trip_date} />
            <Di label="Pickup Time" value={selectedCall.pickup_time} />
            <Di label="Appointment Time" value={selectedCall.appointment_time} />
            <Di label="Pickup Address" value={selectedCall.pickup_address} />
            <Di label="Dropoff Address" value={selectedCall.dropoff_address} />
            <Di label="Patient Name" value={selectedCall.patient_name} />
            <Di label="Patient DOB" value={selectedCall.patient_dob} />
            <Di label="PCS Required" value={selectedCall.pcs_required ? "Yes" : "No"} />
          </div>
        )}

        {selectedCall && drawerTab === "quality" && (
          <div className="patient-detail-grid">
            <Di label="Quality Score" value={selectedCall.quality_score != null ? `${selectedCall.quality_score}%` : "—"} />
            <Di label="Missing Critical" value={selectedCall.missing_critical_fields || "None"} />
            <Di label="Missing Optional" value={selectedCall.missing_optional_fields || "None"} />
            <Di label="Explanation" value={selectedCall.missing_info_explanation} />
          </div>
        )}

        {selectedCall && drawerTab === "edit" && (
          <div className="call-form-modern">
            <section className="call-form-section">
              <div className="call-form-section-header">
                <h5>Caller / Dispatcher</h5>
              </div>
              <div className="row g-2">
                <div className="col-md-6">
                  <label className="form-label">Dispatcher Name</label>
                  <input className="form-control" value={editForm.dispatcher_name} onChange={e => setEditForm(f => ({ ...f, dispatcher_name: e.target.value }))} />
                </div>
                <div className="col-md-6">
                  <label className="form-label">Caller Type</label>
                  <input className="form-control" value={editForm.caller_type} onChange={e => setEditForm(f => ({ ...f, caller_type: e.target.value }))} />
                </div>
                <div className="col-md-6">
                  <label className="form-label">Caller Phone</label>
                  <input className="form-control" value={editForm.caller_phone} onChange={e => setEditForm(f => ({ ...f, caller_phone: e.target.value }))} />
                </div>
                <div className="col-md-6">
                  <label className="form-label">Caller Note</label>
                  <input className="form-control" value={editForm.caller_note} onChange={e => setEditForm(f => ({ ...f, caller_note: e.target.value }))} />
                </div>
              </div>
            </section>

            <section className="call-form-section">
              <div className="call-form-section-header">
                <h5>Trip Details</h5>
              </div>
              <div className="row g-2">
                <div className="col-md-4">
                  <label className="form-label">Trip Date</label>
                  <input type="date" className="form-control" value={editForm.trip_date} onChange={e => setEditForm(f => ({ ...f, trip_date: e.target.value }))} />
                </div>
                <div className="col-md-4">
                  <label className="form-label">Pickup Time</label>
                  <TimeInput value={editForm.pickup_time} onChange={v => setEditForm(f => ({ ...f, pickup_time: v }))} />
                </div>
                <div className="col-md-4">
                  <label className="form-label">Appointment Time</label>
                  <TimeInput value={editForm.appointment_time} onChange={v => setEditForm(f => ({ ...f, appointment_time: v }))} />
                </div>
                <div className="col-12">
                  <label className="form-label">Pickup Address</label>
                  <input className="form-control" value={editForm.pickup_address} onChange={e => setEditForm(f => ({ ...f, pickup_address: e.target.value }))} />
                </div>
                <div className="col-12">
                  <label className="form-label">Dropoff Address</label>
                  <input className="form-control" value={editForm.dropoff_address} onChange={e => setEditForm(f => ({ ...f, dropoff_address: e.target.value }))} />
                </div>
              </div>
            </section>

            <section className="call-form-section">
              <div className="call-form-section-header">
                <h5>Service &amp; Notes</h5>
              </div>
              <div className="row g-2">
                <div className="col-md-6">
                  <label className="form-label">Service Level</label>
                  <select className="form-select" value={editForm.service_level} onChange={e => setEditForm(f => ({ ...f, service_level: e.target.value }))}>
                    <option value="">— Select —</option>
                    <option value="stretcher">Stretcher</option>
                    <option value="bls">BLS</option>
                    <option value="als">ALS</option>
                    <option value="emergency">Emergency</option>
                  </select>
                </div>
                <div className="col-12">
                  <label className="form-label">Notes</label>
                  <textarea className="form-control" rows={3} value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} />
                </div>
              </div>
            </section>

            {["return", "will_call"].includes(selectedCall?.call_type) ? (
              <div style={{
                padding: "10px 14px", borderRadius: 8, fontSize: 12,
                background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)",
                color: "var(--ems-text-secondary)",
              }}>
                <strong>Return ride not available</strong> — this call is already a{" "}
                {selectedCall.call_type === "will_call" ? "Will Call" : "Return"} leg and cannot have its own return ride.
              </div>
            ) : (
            <section className="call-form-section">
              <div className="call-form-section-header">
                <h5>Return Ride</h5>
              </div>
              <div className="row g-2">
                <div className="col-12">
                  <label className="form-label">Return Ride Option</label>
                  <select
                    className="form-select"
                    value={editForm.return_ride_option}
                    onChange={e => {
                      const opt = e.target.value;
                      setEditForm(f => ({
                        ...f,
                        return_ride_option: opt,
                        // Auto-fill flipped addresses when enabling
                        ...(opt !== "none" ? {
                          return_pickup: f.dropoff_address,
                          return_destination: f.pickup_address,
                        } : {
                          return_pickup: "",
                          return_destination: "",
                          return_time: "",
                        }),
                      }));
                    }}
                  >
                    <option value="none">No Return</option>
                    <option value="return">Return Ride</option>
                    <option value="will_call">Will Call</option>
                  </select>
                  <div style={{ fontSize: 11, color: "var(--ems-text-muted)", marginTop: 4 }}>
                    {editForm.return_ride_option === "will_call"
                      ? "Will Call — pickup time will be set from Dispatch Board when patient is ready."
                      : editForm.return_ride_option === "return"
                      ? "Return Ride — creates a separate call with reversed addresses and a set return time."
                      : "Select to create a return or will-call leg. This creates a new separate call."}
                  </div>
                </div>

                {editForm.return_ride_option !== "none" && (
                  <>
                    <div className="col-12">
                      <label className="form-label">Return Pickup Address</label>
                      <input
                        className="form-control"
                        value={editForm.return_pickup}
                        onChange={e => setEditForm(f => ({ ...f, return_pickup: e.target.value }))}
                        placeholder="Pickup address for return leg"
                      />
                    </div>
                    <div className="col-12">
                      <label className="form-label">Return Destination Address</label>
                      <input
                        className="form-control"
                        value={editForm.return_destination}
                        onChange={e => setEditForm(f => ({ ...f, return_destination: e.target.value }))}
                        placeholder="Drop-off address for return leg"
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Return Service Level</label>
                      <select
                        className="form-select"
                        value={editForm.return_service_level}
                        onChange={e => setEditForm(f => ({ ...f, return_service_level: e.target.value }))}
                      >
                        <option value="stretcher">Stretcher</option>
                        <option value="bls">BLS</option>
                        <option value="als">ALS</option>
                        <option value="emergency">Emergency</option>
                      </select>
                      {editForm.service_level === "emergency" && editForm.return_service_level === "bls" && (
                        <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 3 }}>
                          Defaulted to BLS — original call was Emergency.
                        </div>
                      )}
                    </div>

                    {editForm.return_ride_option === "return" && (
                      <div className="col-md-6">
                        <label className="form-label">Return Pickup Time</label>
                        <TimeInput value={editForm.return_time} onChange={v => setEditForm(f => ({ ...f, return_time: v }))} />
                      </div>
                    )}
                    <div className="col-12">
                      <div style={{
                        padding: "8px 12px", borderRadius: 8, fontSize: 12,
                        background: "rgba(13,110,253,0.07)", border: "1px solid rgba(13,110,253,0.2)",
                        color: "var(--ems-text-secondary)",
                      }}>
                        <strong>Note:</strong> Saving will create a new separate call record for this return leg,
                        linked to the same patient and trip date.{" "}
                        {editForm.return_ride_option === "return"
                          ? "Addresses are pre-filled in reverse — adjust if needed."
                          : "No pickup time is set — it will be configured from the Dispatch Board."}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </section>
            )}
          </div>
        )}
      </EntityDrawer>
    </div>
  );
};

function Di({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--ems-text-muted)", marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 14, color: "var(--ems-text-primary)" }}>{value || "—"}</div>
    </div>
  );
}

export default CallsPage;