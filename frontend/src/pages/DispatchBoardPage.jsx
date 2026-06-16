import { useState, useEffect, useCallback, useRef } from "react";
import {
  fetchBoard,
  assignCall,
  unassignCall,
  completeAssignment,
  updateUnitStatus,
} from "../api/dispatchApi";
import { getCurrentUser } from "../api/authApi";

// ── Constants ──────────────────────────────────────────────────────────────

const STATUS_NEXT = {
  available: "en_route",
  en_route: "on_scene",
  on_scene: "transporting",
  transporting: "at_destination",
  at_destination: "available",
  out_of_service: "available",
};

const STATUS_LABELS = {
  available: "Available",
  en_route: "En Route",
  on_scene: "On Scene",
  transporting: "Transporting",
  at_destination: "At Destination",
  out_of_service: "Out of Service",
};

const STATUS_COLORS = {
  available: "#75b798",
  en_route: "#6ea8fe",
  on_scene: "#ffda6a",
  transporting: "#c29ffa",
  at_destination: "#6edff6",
  out_of_service: "#ea868f",
};

// ── Helpers ────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function minCrewForType(t) {
  const u = (t || "").toUpperCase();
  if (u === "BLS-4" || u === "BLS-6") return 4;
  return 2;
}

function isAlsUnit(t) { return (t || "").toUpperCase() === "ALS"; }
function isAlsCall(c) { return (c.service_level || "").toUpperCase() === "ALS"; }
function isEmergencyCall(c) { return (c.call_type || "").toLowerCase() === "emergency"; }
function hasReturnRide(c) {
  const ct = (c.call_type || "").toLowerCase();
  return ct === "return" || ct === "will_call";
}

function parseReturnInfo(notes) {
  if (!notes) return null;
  const m = notes.match(
    /Return pickup:\s*([^;]+);\s*Return destination:\s*([^;]+);\s*Return time:\s*([^\n]+)/i
  );
  if (!m) return null;
  return { returnPickup: m[1].trim(), returnDestination: m[2].trim(), returnTime: m[3].trim() };
}

// Convert "HH:MM AM/PM" or "HH:MM" to sortable minutes
function timeToMinutes(t) {
  if (!t) return 99999;
  const ampm = t.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (ampm) {
    let h = parseInt(ampm[1]);
    const min = parseInt(ampm[2]);
    const p = ampm[3].toUpperCase();
    if (p === "PM" && h !== 12) h += 12;
    if (p === "AM" && h === 12) h = 0;
    return h * 60 + min;
  }
  const plain = t.match(/(\d+):(\d+)/);
  if (plain) return parseInt(plain[1]) * 60 + parseInt(plain[2]);
  return 99999;
}

// Expand return ride calls into outbound + return slots, sorted by pickup_time.
// Old-style records embed return info in notes and expand into 2 slots.
// New-style records are already 2 separate Call rows (call_type="return").
function expandAndSort(calls) {
  const result = [];
  for (const call of calls) {
    const ret = parseReturnInfo(call.notes);
    if (ret) {
      // Old-style: return info embedded in notes — expand into two virtual slots
      result.push({ ...call, _slot: "outbound", _sortTime: timeToMinutes(call.pickup_time) });
      result.push({
        ...call,
        _slot: "return",
        _returnInfo: ret,
        pickup_address: ret.returnPickup || "—",
        dropoff_address: ret.returnDestination || "—",
        pickup_time: ret.returnTime || "",
        _sortTime: timeToMinutes(ret.returnTime || call.appointment_time),
      });
    } else {
      // New-style or single-leg call — one slot, type determined by call_type
      const slot = (call.call_type || "").toLowerCase() === "return" ? "return" : "outbound";
      result.push({ ...call, _slot: slot, _sortTime: timeToMinutes(call.pickup_time) });
    }
  }
  return result.sort((a, b) => a._sortTime - b._sortTime);
}

// ── Sub-components ─────────────────────────────────────────────────────────

function StatusPill({ status, size = "md" }) {
  const c = STATUS_COLORS[status] || "#adb5bd";
  return (
    <span style={{
      display: "inline-block",
      padding: size === "sm" ? "1px 7px" : "3px 10px",
      borderRadius: 20,
      fontWeight: 600,
      fontSize: size === "sm" ? 10 : 12,
      background: `${c}22`,
      color: c,
      border: `1px solid ${c}44`,
    }}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

function UnitTypeBadge({ unitType }) {
  const als = (unitType || "").toUpperCase() === "ALS";
  return (
    <span style={{
      display: "inline-block",
      padding: "3px 10px",
      borderRadius: 6,
      fontWeight: 700,
      fontSize: 13,
      letterSpacing: 1,
      background: als ? "rgba(13,110,253,0.15)" : "rgba(25,135,84,0.15)",
      color: als ? "#6ea8fe" : "#75b798",
      border: `1px solid ${als ? "#6ea8fe44" : "#75b79844"}`,
      boxShadow: als ? "0 0 8px rgba(110,168,254,0.25)" : "0 0 8px rgba(117,183,152,0.25)",
    }}>
      {unitType || "—"}
    </span>
  );
}

function CallCard({ call, onDragStart }) {
  const emergency = isEmergencyCall(call);
  const als = isAlsCall(call);
  const isReturn = call._slot === "return";

  return (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; onDragStart(call); }}
      style={{
        borderLeft: `4px solid ${emergency ? "#dc3545" : isReturn ? "#6ea8fe" : "#495057"}`,
        background: "#1e2430",
        borderRadius: 6,
        cursor: "grab",
        userSelect: "none",
        padding: "8px 10px",
        marginBottom: 6,
      }}
    >
      <div className="d-flex justify-content-between align-items-start mb-1">
        <div className="d-flex align-items-center gap-1 flex-wrap">
          <strong className="text-white" style={{ fontSize: 13 }}>
            {call.patient_name || `Call #${call.id}`}
          </strong>
          {isReturn && (
            <span style={{ fontSize: 10, color: "#6ea8fe", background: "rgba(13,110,253,0.15)", padding: "1px 6px", borderRadius: 4 }}>
              RETURN
            </span>
          )}
        </div>
        <div className="d-flex gap-1 ms-1 flex-shrink-0">
          {emergency && <span className="badge bg-danger" style={{ fontSize: 10 }}>EMRG</span>}
          <span className={`badge ${als ? "badge-als" : "badge-bls"}`} style={{ fontSize: 10 }}>
            {als ? "ALS" : "BLS"}
          </span>
        </div>
      </div>
      {call.pickup_time && (
        <div style={{ fontSize: 11, color: "#adb5bd" }}>
          🕐 {call.pickup_time}
          {call.appointment_time && !isReturn ? ` · appt ${call.appointment_time}` : ""}
        </div>
      )}
      {call.pickup_address && (
        <div className="text-truncate" style={{ fontSize: 11, color: "#6c757d" }}>
          {call.pickup_address}
          {call.dropoff_address ? ` → ${call.dropoff_address}` : ""}
        </div>
      )}
    </div>
  );
}

function AssignedCallCard({ call, unitStatus, isCurrent, onUnassign, onComplete }) {
  const emergency = isEmergencyCall(call);
  const als = isAlsCall(call);
  const isReturnCall = (call.call_type || "").toLowerCase() === "return";
  // Only show embedded return section for old-style records with return info in notes
  const ret = parseReturnInfo(call.notes);

  return (
    <div className="mb-2">
      {/* Primary leg */}
      <div style={{
        background: "#151b27",
        borderRadius: 6,
        borderLeft: `3px solid ${emergency ? "#dc3545" : isReturnCall ? "#6ea8fe" : "#495057"}`,
        padding: "8px 10px",
        marginBottom: ret ? 2 : 0,
      }}>
        <div className="d-flex align-items-start gap-2">
          <div className="flex-grow-1 min-width-0">
            <div className="d-flex align-items-center gap-2 flex-wrap mb-1">
              <span className="text-white fw-semibold" style={{ fontSize: 13 }}>
                {call.patient_name || `Call #${call.id}`}
              </span>
              <span style={{ fontSize: 10, color: isReturnCall ? "#6ea8fe" : "#adb5bd", background: isReturnCall ? "rgba(13,110,253,0.15)" : "#2a3347", padding: "1px 6px", borderRadius: 4 }}>
                {isReturnCall ? "RETURN" : "OUTBOUND"}
              </span>
              {als && <span className="badge badge-als" style={{ fontSize: 10 }}>ALS</span>}
              {emergency && <span className="badge bg-danger" style={{ fontSize: 10 }}>EMRG</span>}
              {isCurrent && unitStatus && <StatusPill status={unitStatus} size="sm" />}
              {!isCurrent && (
                <span style={{ fontSize: 10, color: "#495057", background: "#1e2430", padding: "1px 6px", borderRadius: 4 }}>
                  QUEUED
                </span>
              )}
            </div>
            {call.pickup_time && (
              <div style={{ fontSize: 11, color: "#adb5bd" }}>
                🕐 {call.pickup_time}
                {call.appointment_time ? ` · appt ${call.appointment_time}` : ""}
              </div>
            )}
            {call.pickup_address && (
              <div className="text-truncate" style={{ fontSize: 11, color: "#6c757d" }}>
                {call.pickup_address} → {call.dropoff_address}
              </div>
            )}
          </div>
          <div className="d-flex flex-column gap-1 flex-shrink-0">
            <button
              className="btn btn-sm btn-outline-success"
              style={{ fontSize: 10, padding: "2px 8px" }}
              onClick={() => onComplete(call.assignment_id)}
              title="Mark as completed"
            >
              ✓ Done
            </button>
            <button
              className="btn btn-sm btn-outline-secondary"
              style={{ fontSize: 10, padding: "2px 8px" }}
              onClick={() => onUnassign(call.assignment_id)}
            >
              Unassign
            </button>
          </div>
        </div>
      </div>

      {/* Return leg (same assignment, shown separately) */}
      {ret && (
        <div style={{
          background: "#151b27",
          borderRadius: 6,
          borderLeft: "3px solid #6ea8fe",
          padding: "8px 10px",
          opacity: 0.85,
        }}>
          <div className="d-flex align-items-center gap-2 flex-wrap mb-1">
            <span className="text-white fw-semibold" style={{ fontSize: 13 }}>
              {call.patient_name || `Call #${call.id}`}
            </span>
            <span style={{ fontSize: 10, color: "#6ea8fe", background: "rgba(13,110,253,0.15)", padding: "1px 6px", borderRadius: 4 }}>
              RETURN
            </span>
            <span className="text-muted" style={{ fontSize: 10 }}>unassigned to unit</span>
          </div>
          {ret.returnTime && (
            <div style={{ fontSize: 11, color: "#adb5bd" }}>🕐 {ret.returnTime}</div>
          )}
          <div className="text-truncate" style={{ fontSize: 11, color: "#6c757d" }}>
            {ret.returnPickup} → {ret.returnDestination}
          </div>
        </div>
      )}
    </div>
  );
}

function CompletedCallCard({ call }) {
  const ret = parseReturnInfo(call.notes);
  return (
    <div className="mb-2" style={{ opacity: 0.45 }}>
      <div style={{
        background: "#151b27",
        borderRadius: 6,
        borderLeft: "3px solid #495057",
        padding: "8px 10px",
        marginBottom: ret ? 2 : 0,
      }}>
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <span className="text-muted fw-semibold" style={{ fontSize: 13, textDecoration: "line-through" }}>
            {call.patient_name || `Call #${call.id}`}
          </span>
          <span style={{ fontSize: 10, color: "#6c757d", background: "#2a3347", padding: "1px 6px", borderRadius: 4 }}>
            COMPLETED
          </span>
          {call.pickup_time && (
            <span className="text-muted" style={{ fontSize: 11 }}>🕐 {call.pickup_time}</span>
          )}
        </div>
        {call.pickup_address && (
          <div className="text-truncate" style={{ fontSize: 11, color: "#495057" }}>
            {call.pickup_address} → {call.dropoff_address}
          </div>
        )}
      </div>
      {ret && (
        <div style={{
          background: "#151b27",
          borderRadius: 6,
          borderLeft: "3px solid #495057",
          padding: "6px 10px",
        }}>
          <span className="text-muted" style={{ fontSize: 11, fontStyle: "italic" }}>
            Return: {ret.returnPickup} → {ret.returnDestination}
          </span>
        </div>
      )}
    </div>
  );
}

function WarningModal({ warning, onConfirm, onCancel }) {
  if (!warning) return null;
  return (
    <div className="modal d-block" style={{ background: "rgba(0,0,0,0.65)" }} tabIndex={-1}>
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content border-warning" style={{ background: "#1a2236" }}>
          <div className="modal-header border-warning">
            <h5 className="modal-title text-warning">⚠ Compatibility Warning</h5>
          </div>
          <div className="modal-body text-white">
            <p>{warning.message}</p>
            <p className="text-muted mb-0" style={{ fontSize: 13 }}>Assign anyway?</p>
          </div>
          <div className="modal-footer border-0">
            <button className="btn btn-outline-secondary" onClick={onCancel}>Cancel</button>
            <button className="btn btn-warning text-dark" onClick={onConfirm}>Assign Anyway</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function DispatchBoardPage() {
  const [date, setDate] = useState(todayStr());
  const [board, setBoard] = useState({ openCalls: [], units: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [draggedCall, setDraggedCall] = useState(null);
  const [dragOverUnitId, setDragOverUnitId] = useState(null);
  const [warning, setWarning] = useState(null);
  const [pendingAssign, setPendingAssign] = useState(null);

  // Resizable left panel (horizontal)
  const [leftWidth, setLeftWidth] = useState(280);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartW = useRef(280);
  const leftWidthRef = useRef(280);

  // Resizable bottom panel (vertical)
  const [bottomHeight, setBottomHeight] = useState(300);
  const isRowDragging = useRef(false);
  const rowDragStartY = useRef(0);
  const rowDragStartH = useRef(300);
  const bottomHeightRef = useRef(300);

  useEffect(() => {
    function onMove(e) {
      if (isDragging.current) {
        const delta = e.clientX - dragStartX.current;
        const next = Math.max(180, Math.min(520, dragStartW.current + delta));
        leftWidthRef.current = next;
        setLeftWidth(next);
      }
      if (isRowDragging.current) {
        // Drag up = bigger bottom panel
        const delta = rowDragStartY.current - e.clientY;
        const next = Math.max(120, Math.min(600, rowDragStartH.current + delta));
        bottomHeightRef.current = next;
        setBottomHeight(next);
      }
    }
    function onUp() { isDragging.current = false; isRowDragging.current = false; }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  function handleDividerMouseDown(e) {
    e.preventDefault();
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartW.current = leftWidthRef.current;
  }

  function handleRowDividerMouseDown(e) {
    e.preventDefault();
    isRowDragging.current = true;
    rowDragStartY.current = e.clientY;
    rowDragStartH.current = bottomHeightRef.current;
  }

  const currentUser = getCurrentUser();

  const loadBoard = useCallback(async (d) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchBoard(d);
      setBoard(data);
      if (selectedUnit) {
        const fresh = data.units.find((u) => u.id === selectedUnit.id);
        setSelectedUnit(fresh || null);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [selectedUnit]);

  useEffect(() => { loadBoard(date); }, [date]);

  // ── Drag & drop ────────────────────────────────────────────────────────

  function handleDragStart(call) { setDraggedCall(call); }
  function handleDragOver(e, unitId) { e.preventDefault(); setDragOverUnitId(unitId); }
  function handleDragLeave() { setDragOverUnitId(null); }

  async function handleDrop(e, unit) {
    e.preventDefault();
    setDragOverUnitId(null);
    if (!draggedCall) return;
    const call = draggedCall;
    setDraggedCall(null);

    const msgs = [];
    if (isAlsCall(call) && !isAlsUnit(unit.unitType))
      msgs.push(`ALS call on ${unit.unitType} unit — ensure paramedic available.`);
    if ((unit.crewCount || 0) < minCrewForType(unit.unitType))
      msgs.push(`${unit.unitType} needs ${minCrewForType(unit.unitType)} crew, only ${unit.crewCount || 0} assigned.`);

    if (msgs.length) {
      setWarning({ message: msgs.join(" "), call, unit });
      setPendingAssign({ call, unit });
    } else {
      await doAssign(call, unit);
    }
  }

  async function doAssign(call, unit) {
    try {
      await assignCall(call.id, unit.id, currentUser?.display_name || "");
      await loadBoard(date);
    } catch (e) { alert(`Assignment failed: ${e.message}`); }
  }

  function handleWarningConfirm() {
    const { call, unit } = pendingAssign;
    setWarning(null); setPendingAssign(null);
    doAssign(call, unit);
  }

  // ── Unit actions ───────────────────────────────────────────────────────

  function handleUnitClick(unit) {
    setSelectedUnit((prev) => (prev?.id === unit.id ? null : unit));
  }

  async function handleUnitDoubleClick(unit) {
    if (unit.dispatchStatus === "at_destination") {
      // Complete the current (first) assigned call and return unit to available
      const sorted = [...(unit.assignedCalls || [])].sort(
        (a, b) => timeToMinutes(a.pickup_time) - timeToMinutes(b.pickup_time)
      );
      if (sorted.length > 0) {
        await handleComplete(sorted[0].assignment_id);
      }
      await handleStatusChange(unit.id, "available");
    } else {
      const next = STATUS_NEXT[unit.dispatchStatus] || "available";
      await handleStatusChange(unit.id, next);
    }
  }

  async function handleStatusChange(unitId, status) {
    try {
      await updateUnitStatus(unitId, status);
      await loadBoard(date);
    } catch (e) { alert(`Status update failed: ${e.message}`); }
  }

  async function handleUnassign(assignmentId) {
    try {
      await unassignCall(assignmentId);
      await loadBoard(date);
    } catch (e) { alert(`Unassign failed: ${e.message}`); }
  }

  async function handleComplete(assignmentId) {
    try {
      await completeAssignment(assignmentId);
      await loadBoard(date);
    } catch (e) { alert(`Complete failed: ${e.message}`); }
  }

  // ── Derived data ───────────────────────────────────────────────────────

  const expandedCalls = expandAndSort(board.openCalls);
  const emergencyCalls = expandedCalls.filter(isEmergencyCall);
  const scheduledCalls = expandedCalls.filter((c) => !isEmergencyCall(c));

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#151b27" }}>
      <WarningModal
        warning={warning}
        onConfirm={handleWarningConfirm}
        onCancel={() => { setWarning(null); setPendingAssign(null); }}
      />

      {/* Header */}
      <div className="d-flex align-items-center gap-3 px-3 py-2" style={{ background: "#0f1520", borderBottom: "1px solid #2a3347", flexShrink: 0 }}>
        <h5 className="mb-0 text-white fw-bold">Dispatch Board</h5>
        <input
          type="date"
          className="form-control form-control-sm"
          style={{ width: 160, background: "#1e2430", color: "#fff", border: "1px solid #2a3347" }}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <button className="btn btn-sm btn-outline-secondary" onClick={() => loadBoard(date)} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
        {error && <span className="text-danger small">{error}</span>}
        <span className="ms-auto text-muted small">
          {expandedCalls.length} open · {board.units.length} units ·{" "}
          <span style={{ color: "#6ea8fe" }}>double-click unit → advance status</span>
        </span>
      </div>

      {/* Main columns */}
      <div className="d-flex" style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>

        {/* Left: Open Calls */}
        <div style={{
          width: leftWidth,
          minWidth: 180,
          flexShrink: 0,
          background: "#0f1520",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          borderRight: "1px solid #2a3347",
        }}>
          <div className="px-3 py-2" style={{ borderBottom: "1px solid #2a3347", flexShrink: 0 }}>
            <span className="text-white fw-semibold" style={{ fontSize: 13 }}>Open Calls</span>
            <span className="ms-2 badge bg-secondary" style={{ fontSize: 10 }}>{expandedCalls.length}</span>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
            {emergencyCalls.length > 0 && (
              <div className="mb-3">
                <div className="mb-2" style={{ borderLeft: "3px solid #dc3545", paddingLeft: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#ea868f", letterSpacing: 1 }}>EMERGENCY</span>
                  <span className="badge bg-danger rounded-pill ms-2">{emergencyCalls.length}</span>
                </div>
                {emergencyCalls.map((call, i) => (
                  <CallCard key={`${call.id}-${call._slot}-${i}`} call={call} onDragStart={handleDragStart} />
                ))}
              </div>
            )}
            {scheduledCalls.length > 0 && (
              <div>
                <div className="mb-2" style={{ paddingLeft: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#6c757d", letterSpacing: 1 }}>SCHEDULED</span>
                </div>
                {scheduledCalls.map((call, i) => (
                  <CallCard key={`${call.id}-${call._slot}-${i}`} call={call} onDragStart={handleDragStart} />
                ))}
              </div>
            )}
            {expandedCalls.length === 0 && !loading && (
              <p className="text-muted text-center small mt-4">No open calls for this date</p>
            )}
          </div>
        </div>

        {/* Drag divider */}
        <div
          onMouseDown={handleDividerMouseDown}
          style={{ width: 5, flexShrink: 0, background: "#2a3347", cursor: "col-resize" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#6ea8fe55")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "#2a3347")}
        />

        {/* Right: Units + panel */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "#151b27" }}>

          {/* Unit table */}
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", background: "#151b27" }}>
            <table className="table table-dark table-hover mb-0" style={{ fontSize: 13 }}>
              <thead style={{ position: "sticky", top: 0, background: "#0f1520", zIndex: 1 }}>
                <tr>
                  <th style={{ width: 80, color: "#6c757d", fontWeight: 500 }}>Unit</th>
                  <th style={{ width: 110, color: "#6c757d", fontWeight: 500 }}>Type</th>
                  <th style={{ width: 180, color: "#6c757d", fontWeight: 500 }}>Status</th>
                  <th style={{ width: 60, color: "#6c757d", fontWeight: 500 }}>Crew</th>
                  <th style={{ color: "#6c757d", fontWeight: 500 }}>Assigned Calls</th>
                </tr>
              </thead>
              <tbody style={{ background: "#151b27" }}>
                {board.units.map((unit) => {
                  const isSelected = selectedUnit?.id === unit.id;
                  const isDragOver = dragOverUnitId === unit.id;
                  const sc = STATUS_COLORS[unit.dispatchStatus] || "#adb5bd";
                  return (
                    <tr
                      key={unit.id}
                      onClick={() => handleUnitClick(unit)}
                      onDoubleClick={() => handleUnitDoubleClick(unit)}
                      onDragOver={(e) => handleDragOver(e, unit.id)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, unit)}
                      title="Click to select · Double-click to advance status"
                      style={{
                        cursor: "pointer",
                        background: isDragOver
                          ? "rgba(255,193,7,0.10)"
                          : isSelected
                          ? "rgba(13,110,253,0.10)"
                          : "#151b27",
                        borderLeft: isSelected ? `3px solid #6ea8fe` : "3px solid transparent",
                        outline: isDragOver ? "1px dashed #ffc107" : undefined,
                      }}
                    >
                      <td className="fw-bold text-white align-middle">{unit.truckNumber}</td>
                      <td className="align-middle"><UnitTypeBadge unitType={unit.unitType} /></td>
                      <td className="align-middle">
                        <div className="d-flex align-items-center gap-2">
                          <StatusPill status={unit.dispatchStatus} />
                          <span style={{ fontSize: 10, color: unit.dispatchStatus === "at_destination" ? "#75b798" : "#495057" }}>
                            {unit.dispatchStatus === "at_destination" ? "→ Complete Call" : `→ ${STATUS_LABELS[STATUS_NEXT[unit.dispatchStatus]] || ""}`}
                          </span>
                        </div>
                      </td>
                      <td className="align-middle text-center">
                        <span className={`badge ${(unit.crewCount || 0) < minCrewForType(unit.unitType) ? "bg-danger" : "bg-secondary"}`}>
                          {unit.crewCount || 0}
                        </span>
                      </td>
                      <td className="align-middle">
                        <div className="d-flex flex-wrap gap-1 align-items-center">
                          {(unit.assignedCalls || []).map((c) => (
                            <span
                              key={c.id}
                              className="badge"
                              style={{
                                background: isEmergencyCall(c) ? "rgba(220,53,69,0.2)" : "rgba(108,117,125,0.2)",
                                color: isEmergencyCall(c) ? "#ea868f" : "#adb5bd",
                                fontSize: 11,
                                border: `1px solid ${isEmergencyCall(c) ? "#dc354544" : "#49505744"}`,
                              }}
                            >
                              {c.patient_name || `#${c.id}`}
                              {hasReturnRide(c) && (
                                <span style={{ color: "#6ea8fe", marginLeft: 4 }}>+R</span>
                              )}
                            </span>
                          ))}
                          {(unit.completedCalls || []).map((c) => (
                            <span key={`done-${c.id}`} className="badge" style={{ background: "#1e2430", color: "#495057", fontSize: 11, textDecoration: "line-through" }}>
                              {c.patient_name || `#${c.id}`}
                            </span>
                          ))}
                          {!(unit.assignedCalls?.length) && !(unit.completedCalls?.length) && (
                            <span className="text-muted" style={{ fontSize: 11 }}>
                              {isDragOver ? "Drop here" : "—"}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {board.units.length === 0 && !loading && (
                  <tr style={{ background: "#151b27" }}>
                    <td colSpan={5} className="text-center text-muted py-5" style={{ background: "#151b27" }}>
                      No units planned for this date. Add units in Crew Planner.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Row drag divider */}
          {selectedUnit && (
            <div
              onMouseDown={handleRowDividerMouseDown}
              style={{ height: 5, flexShrink: 0, background: "#2a3347", cursor: "row-resize" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#6ea8fe55")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#2a3347")}
            />
          )}

          {/* Selected unit bottom panel */}
          {selectedUnit && (
            <div style={{ background: "#0f1520", height: bottomHeight, overflowY: "auto", flexShrink: 0 }}>
              {/* Unit header */}
              <div className="px-3 py-2 d-flex align-items-center gap-3 flex-wrap" style={{ borderBottom: "1px solid #2a3347" }}>
                <span className="fw-bold text-white">Unit {selectedUnit.truckNumber}</span>
                <UnitTypeBadge unitType={selectedUnit.unitType} />
                <StatusPill status={selectedUnit.dispatchStatus} />
                <span className="text-muted small">
                  Crew: {selectedUnit.crewCount || 0}/{minCrewForType(selectedUnit.unitType)} min
                </span>
                <span className="ms-auto text-muted small" style={{ fontSize: 11 }}>
                  Double-click row to advance · or use buttons:
                </span>
              </div>

              {/* Status buttons */}
              <div className="px-3 py-2 d-flex flex-wrap gap-2" style={{ borderBottom: "1px solid #2a3347" }}>
                {["available", "en_route", "on_scene", "transporting", "at_destination"].map((s) => {
                  const active = selectedUnit.dispatchStatus === s;
                  const c = STATUS_COLORS[s];
                  return (
                    <button
                      key={s}
                      className="btn btn-sm"
                      disabled={active}
                      style={{
                        fontSize: 12,
                        background: active ? `${c}22` : "transparent",
                        color: active ? c : "#6c757d",
                        border: `1px solid ${active ? c + "55" : "#2a3347"}`,
                      }}
                      onClick={() => handleStatusChange(selectedUnit.id, s)}
                    >
                      {STATUS_LABELS[s]}
                    </button>
                  );
                })}
                {selectedUnit.dispatchStatus !== "out_of_service" ? (
                  <button
                    className="btn btn-sm btn-outline-danger ms-auto"
                    style={{ fontSize: 12 }}
                    onClick={() => handleStatusChange(selectedUnit.id, "out_of_service")}
                  >
                    Out of Service
                  </button>
                ) : (
                  <button
                    className="btn btn-sm btn-outline-success ms-auto"
                    style={{ fontSize: 12 }}
                    onClick={() => handleStatusChange(selectedUnit.id, "available")}
                  >
                    Out of Service → Available
                  </button>
                )}
              </div>

              {/* Assigned + completed calls */}
              <div className="px-3 py-2">
                {(selectedUnit.assignedCalls || []).length === 0 && (selectedUnit.completedCalls || []).length === 0 && (
                  <p className="text-muted small mb-0">No calls assigned</p>
                )}
                {[...(selectedUnit.assignedCalls || [])]
                  .sort((a, b) => timeToMinutes(a.pickup_time) - timeToMinutes(b.pickup_time))
                  .map((call, idx) => (
                  <AssignedCallCard
                    key={call.id}
                    call={call}
                    unitStatus={selectedUnit.dispatchStatus}
                    isCurrent={idx === 0}
                    onUnassign={handleUnassign}
                    onComplete={handleComplete}
                  />
                ))}
                {(selectedUnit.completedCalls || []).length > 0 && (
                  <>
                    <div className="text-muted small mb-2 mt-1" style={{ borderTop: "1px solid #2a3347", paddingTop: 8 }}>
                      Completed
                    </div>
                    {(selectedUnit.completedCalls || []).map((call) => (
                      <CompletedCallCard key={call.id} call={call} />
                    ))}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .badge-als { background: rgba(13,110,253,0.2); color: #6ea8fe; border: 1px solid #6ea8fe44; }
        .badge-bls { background: rgba(25,135,84,0.2); color: #75b798; border: 1px solid #75b79844; }
        .table-dark td { background: inherit !important; }
        .table-dark tr:hover td { background: rgba(255,255,255,0.04) !important; }
      `}</style>
    </div>
  );
}
