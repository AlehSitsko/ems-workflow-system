import React, { useRef, useState } from "react";
import { FaCalendarDay, FaSearch } from "react-icons/fa";

import { getCalls, uncancelCall, updateCall, createCall } from "../api/callsApi";
import { localIsoNow } from "../utils/callUtils";
import { useToast } from "../components/ui/useToast";
import EntityDrawer from "../components/ui/EntityDrawer";
import TimeInput from "../components/ui/TimeInput";
import { useUserSettings } from "../context/useUserSettings";
import { formatTimeForDisplay } from "../utils/timeUtils";
import { PageHeader, PageSection, PageToolbar, ToolbarField } from "../components/ui/Page";
import { EmptyState, ErrorState } from "../components/ui/States";
import { LoadMore } from "../components/ui/Entity";
import StatusBadge from "../components/ui/StatusBadge";
import { ServiceLevelBadge } from "../components/taxonomy/TaxonomyBadges";
import { SERVICE_LEVELS, describeLevel } from "../utils/taxonomy";

const CallsPage = ({ currentUser }) => {
  const toast = useToast();
  const { settings } = useUserSettings();
  const timeFormat = settings?.ui?.time_format || "12h";
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

  // Quality score → semantic tone. Score is a 0–100 backend value.
  const scoreTone = (score) => {
    if (score === null || score === undefined) return "neutral";
    if (score >= 80) return "success";
    if (score >= 50) return "warning";
    return "danger";
  };

  const renderQualityBadge = (score) => (
    <StatusBadge
      tone={scoreTone(score)}
      label={score === null || score === undefined ? "—" : `${score}%`}
      dot={false}
    />
  );

  const renderIssueBadge = (call) => {
    if (call.missing_critical_fields) return <StatusBadge tone="danger" label="Critical" />;
    if (call.missing_optional_fields) return <StatusBadge tone="warning" label="Optional" />;
    return <StatusBadge tone="success" label="Complete" />;
  };

  // Service level is rendered from the canonical taxonomy: what it displays
  // matches what the backend stores (BLS/ALS/…), and a value that is not a
  // service level — a stray "emergency" that belongs on call_type — degrades to
  // a visible "Unknown" badge instead of being dressed up as a real level.
  const renderServiceBadge = (serviceLevel) =>
    serviceLevel ? <ServiceLevelBadge value={serviceLevel} /> : <StatusBadge tone="neutral" label="—" dot={false} />;

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

  const STATUS_TONE = { new: "neutral", completed: "success", cancelled: "danger" };

  const renderStatusBadge = (status) => {
    const normalizedStatus = status || "new";
    return (
      <StatusBadge
        tone={STATUS_TONE[normalizedStatus] || "info"}
        label={formatCallStatus(normalizedStatus)}
      />
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
      received_at: call.received_at || "",
      status: call.status || "new",
      dispatched_at: call.dispatched_at || "",
      arrived_pickup_at: call.arrived_pickup_at || "",
      patient_loaded_at: call.patient_loaded_at || "",
      arrived_dest_at: call.arrived_dest_at || "",
      completed_at: call.completed_at || "",
      // Return ride fields (not persisted on main call — creates a new call)
      return_ride_option: "none",
      return_pickup: call.dropoff_address || "",
      return_destination: call.pickup_address || "",
      return_time: "",
      // Default the return leg to the outbound call's level when it is a real
      // one, otherwise BLS. Values are canonical to match the select options.
      return_service_level: SERVICE_LEVELS.includes(call.service_level) ? call.service_level : "BLS",
    });
    setDrawerOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedCall) return;
    setEditSaving(true);
    const headers = {
  // Identity is the session cookie; nothing is asserted here.
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
          received_at: localIsoNow(),
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
  // Identity is the session cookie; nothing is asserted here.
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

  // Emergency is a call TYPE, not a service level (the taxonomy migration moved
  // it). Counting service_level here would measure an empty set and mislabel it.
  const emergencyCalls = calls.filter(
    (call) => String(call.call_type || "").toLowerCase() === "emergency"
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
      <PageHeader
        title="Calls"
        description="Review saved call records and call-quality tracking."
        actions={(
          <div className="stat-chip-row">
            <StatusBadge tone="info" label={`${total || calls.length} total`} />
            <StatusBadge tone="success" label={`${newCalls} new`} />
            <StatusBadge tone="purple" label={`Avg ${averageQualityScore === null ? "—" : `${averageQualityScore}%`}`} />
            <StatusBadge tone={callsWithCriticalMissing > 0 ? "warning" : "neutral"} label={`${callsWithCriticalMissing} critical missing`} />
            <StatusBadge tone={emergencyCalls > 0 ? "danger" : "neutral"} label={`${emergencyCalls} emergency`} />
          </div>
        )}
      />

      {error && <div className="mb-3"><ErrorState message={error} /></div>}

      <PageToolbar onClear={handleClear} canClear={!!(dateOfCall || dispatcherName || status || minQualityScore || maxQualityScore || calls.length)}>
        <ToolbarField label="Date of call">
          <input type="date" className="form-control" value={dateOfCall}
                 onChange={(e) => setDateOfCall(e.target.value)} disabled={loading} />
        </ToolbarField>

        <ToolbarField label="Dispatcher">
          <input type="text" className="form-control" placeholder="Dispatcher name" value={dispatcherName}
                 onChange={(e) => setDispatcherName(e.target.value)} disabled={loading} />
        </ToolbarField>

        <ToolbarField label="Status">
          <select className="form-select" value={status}
                  onChange={(e) => setStatus(e.target.value)} disabled={loading}>
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
        </ToolbarField>

        <ToolbarField label="Min quality">
          <input type="number" className="form-control" placeholder="e.g. 50" min="0" max="100"
                 value={minQualityScore} onChange={(e) => setMinQualityScore(e.target.value)} disabled={loading} />
        </ToolbarField>

        <ToolbarField label="Max quality">
          <input type="number" className="form-control" placeholder="e.g. 100" min="0" max="100"
                 value={maxQualityScore} onChange={(e) => setMaxQualityScore(e.target.value)} disabled={loading} />
        </ToolbarField>

        <ToolbarField label="&nbsp;">
          <div className="d-flex gap-2">
            <button type="button" className="btn btn-primary" onClick={handleApplyFilters} disabled={loading}>
              <FaSearch aria-hidden="true" /> {loading ? "Loading…" : "Apply"}
            </button>
            <button type="button" className="btn btn-outline-secondary" onClick={handleToday} disabled={loading}>
              <FaCalendarDay aria-hidden="true" /> Today
            </button>
            <button type="button" className="btn btn-outline-secondary" onClick={handleLoadAll} disabled={loading}>
              Load All
            </button>
          </div>
        </ToolbarField>
      </PageToolbar>

      <PageSection
        title="Call records"
        actions={<StatusBadge tone="neutral" label={`${calls.length} of ${total}`} dot={false} />}
      >
        {calls.length === 0 ? (
          <EmptyState
            variant="empty"
            title="No calls loaded"
            description="Apply filters, load today’s calls, or load all calls to view records."
          />
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
                      <div>{call.trip_date || "—"} {call.pickup_time ? `at ${formatTimeForDisplay(call.pickup_time, timeFormat)}` : ""}</div>
                      <div className="compact-call-muted">Appointment: {call.appointment_time ? formatTimeForDisplay(call.appointment_time, timeFormat) : "—"}</div>
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

        <LoadMore
          loaded={calls.length}
          total={total}
          loading={loadingMore}
          onLoadMore={handleLoadMore}
        />
      </PageSection>

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
          <>
          <div className="patient-detail-grid">
            <Di label="Date" value={selectedCall.date_of_call} />
            <Di label="Received At" value={formatReceivedAt(selectedCall.received_at)} />
            <Di label="Dispatcher" value={selectedCall.dispatcher_name} />
            <Di label="Status" value={formatCallStatus(selectedCall.status)} />
            <Di label="Caller Type" value={selectedCall.caller_type} />
            <Di label="Call Type" value={selectedCall.call_type} />
            <Di label="Service Level" value={selectedCall.service_level ? describeLevel(selectedCall.service_level).label : null} />
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

          {/* Dispatch lifecycle timeline */}
          {(selectedCall.dispatched_at || selectedCall.arrived_pickup_at || selectedCall.patient_loaded_at || selectedCall.arrived_dest_at || selectedCall.completed_at) && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--ems-text-muted)", marginBottom: 8 }}>
                Dispatch Timeline
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 0, position: "relative" }}>
                {[
                  { label: "Dispatched (En Route)", ts: selectedCall.dispatched_at, color: "#1d4ed8" },
                  { label: "Arrived at Pickup", ts: selectedCall.arrived_pickup_at, color: "#854d0e" },
                  { label: "Patient Loaded", ts: selectedCall.patient_loaded_at, color: "#5b21b6" },
                  { label: "Arrived at Destination", ts: selectedCall.arrived_dest_at, color: "#155e75" },
                  { label: "Completed", ts: selectedCall.completed_at, color: "#166534" },
                ].map(({ label, ts, color }) => ts ? (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0", borderLeft: `2px solid ${color}30`, paddingLeft: 12, marginLeft: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0, marginLeft: -17 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color }}>{label}</div>
                      <div style={{ fontSize: 12, color: "var(--ems-text-secondary)" }}>{formatReceivedAt(ts)}</div>
                    </div>
                  </div>
                ) : null)}
              </div>
            </div>
          )}
          </>
        )}

        {selectedCall && drawerTab === "trip" && (
          <div className="patient-detail-grid">
            <Di label="Trip Date" value={selectedCall.trip_date} />
            <Di label="Pickup Time" value={formatTimeForDisplay(selectedCall.pickup_time, timeFormat)} />
            <Di label="Appointment Time" value={formatTimeForDisplay(selectedCall.appointment_time, timeFormat)} />
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
                    {SERVICE_LEVELS.map((lvl) => <option key={lvl} value={lvl}>{lvl}</option>)}
                    {editForm.service_level && !SERVICE_LEVELS.includes(editForm.service_level) && (
                      // Keep an unrecognised stored value (e.g. a legacy
                      // "emergency") visible and selected rather than blanking it.
                      <option value={editForm.service_level}>{editForm.service_level} (unknown)</option>
                    )}
                  </select>
                </div>
                <div className="col-12">
                  <label className="form-label">Notes</label>
                  <textarea className="form-control" rows={3} value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} />
                </div>
              </div>
            </section>

            {["admin", "supervisor"].includes(currentUser?.role) && (
              <section className="call-form-section" style={{ borderColor: "rgba(245,158,11,0.3)", background: "rgba(245,158,11,0.04)" }}>
                <div className="call-form-section-header">
                  <h5 style={{ color: "#b45309" }}>Timestamps &amp; Status</h5>
                  <span style={{ fontSize: 11, color: "#b45309", fontWeight: 600 }}>SUPERVISOR / ADMIN</span>
                </div>
                <div style={{ fontSize: 11, color: "var(--ems-text-muted)", marginBottom: 10 }}>
                  All changes are recorded in the Audit Log with your name and timestamp.
                </div>
                <div className="row g-2">
                  <div className="col-md-8">
                    <label className="form-label">Received At</label>
                    <input type="datetime-local" className="form-control"
                      value={editForm.received_at ? editForm.received_at.slice(0, 16) : ""}
                      onChange={e => setEditForm(f => ({ ...f, received_at: e.target.value ? e.target.value + ":00" : "" }))}
                    />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label">Call Status</label>
                    <select className="form-select" value={editForm.status}
                      onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}>
                      <option value="new">New</option>
                      <option value="assigned">Assigned</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>

                  {[
                    { field: "dispatched_at",    label: "Dispatched (En Route)" },
                    { field: "arrived_pickup_at", label: "Arrived at Pickup" },
                    { field: "patient_loaded_at", label: "Patient Loaded" },
                    { field: "arrived_dest_at",   label: "Arrived at Destination" },
                    { field: "completed_at",      label: "Completed" },
                  ].map(({ field, label }) => (
                    <div className="col-md-6" key={field}>
                      <label className="form-label">{label}</label>
                      <input type="datetime-local" className="form-control"
                        value={editForm[field] ? editForm[field].slice(0, 16) : ""}
                        onChange={e => setEditForm(f => ({ ...f, [field]: e.target.value ? e.target.value + ":00" : "" }))}
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}

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
                        {SERVICE_LEVELS.map((lvl) => <option key={lvl} value={lvl}>{lvl}</option>)}
                      </select>
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