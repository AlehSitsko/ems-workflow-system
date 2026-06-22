import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import API_BASE from "../api/config.js";
import { useToast } from "../components/ui/ToastProvider";
import { useConfirm } from "../components/ui/ConfirmDialog";
import {
  FaMapMarkerAlt,
  FaClock,
  FaUser,
  FaPhoneAlt,
  FaClipboardList,
  FaArrowRight,
  FaIdBadge,
  FaSun,
  FaMoon,
  FaPlus,
  FaEdit,
  FaTrash,
} from "react-icons/fa";
import {
  fetchBoard,
  assignCall,
  unassignCall,
  completeAssignment,
  reopenAssignment,
  updateUnitStatus,
  updateCallOrder,
} from "../api/dispatchApi";
import { cancelCall, uncancelCall, getCalls, updateCall } from "../api/callsApi";
import { getCurrentUser } from "../api/authApi";
import { getEmployees } from "../api/employeesApi";
import { createCrewUnit, updateCrewUnit, deleteCrewUnit, makeNightCrew } from "../api/crewApi";
import EntityDrawer from "../components/ui/EntityDrawer";
import TimeInput from "../components/ui/TimeInput";
import PatientOrderSection from "../components/crew/PatientOrderSection";
import { getEmployeeRoleLabel } from "../utils/employeeRoleUtils";
import CallDrawer from "../components/dispatch/CallDrawer";
import { useUserSettings } from "../context/UserSettingsContext";

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

// Solid background colors for pills (readable on any bg)
const STATUS_BG = {
  available:      "#166534",
  en_route:       "#1d4ed8",
  on_scene:       "#854d0e",
  transporting:   "#5b21b6",
  at_destination: "#155e75",
  out_of_service: "#991b1b",
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
function isWillCall(c) { return (c.call_type || "").toLowerCase() === "will_call"; }
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
      const ct = (call.call_type || "").toLowerCase();
      const slot = ct === "return" ? "return" : ct === "will_call" ? "will_call" : "outbound";
      // Will Call sorts after all scheduled calls (no pickup_time yet).
      const sortTime = ct === "will_call" ? 999999 : timeToMinutes(call.pickup_time);
      result.push({ ...call, _slot: slot, _sortTime: sortTime });
    }
  }
  return result.sort((a, b) => a._sortTime - b._sortTime);
}

// ── Sub-components ─────────────────────────────────────────────────────────

function StatusPill({ status, size = "md" }) {
  const bg = STATUS_BG[status] || "#374151";
  const text = STATUS_COLORS[status] || "#e5e7eb";
  return (
    <span style={{
      display: "inline-block",
      padding: size === "sm" ? "1px 7px" : "3px 10px",
      borderRadius: 20,
      fontWeight: 700,
      fontSize: size === "sm" ? 10 : 12,
      background: bg,
      color: text,
      border: `1px solid ${text}44`,
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
      background: als ? "rgba(29,78,216,0.15)" : "rgba(22,101,52,0.15)",
      color: als ? "#1d4ed8" : "#166534",
      border: `1px solid ${als ? "rgba(29,78,216,0.5)" : "rgba(22,101,52,0.5)"}`,
    }}>
      {unitType || "—"}
    </span>
  );
}

function CallCard({ call, onDragStart, onCardClick, statusOverride }) {
  const emergency = isEmergencyCall(call);
  const als = isAlsCall(call);
  const isReturn = call._slot === "return";
  const willCall = isWillCall(call);
  const status = statusOverride || call.status || "new";
  const isCancelled = status === "cancelled";
  const isCompleted = status === "completed";

  const accentColor = isCancelled ? "#6b7280"
    : isCompleted   ? "#22c55e"
    : emergency     ? "#dc3545"
    : willCall      ? "#ffc107"
    : isReturn      ? "#6ea8fe"
    : "var(--ems-board-tab-inactive)";

  return (
    <div
      draggable={!isCancelled && !isCompleted}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; onDragStart(call); }}
      onClick={() => onCardClick && onCardClick(call, isCompleted)}
      style={{
        borderLeft: `3px solid ${accentColor}`,
        background: isCancelled ? "rgba(107,114,128,0.08)" : isCompleted ? "rgba(34,197,94,0.06)" : "var(--ems-board-bg-card)",
        borderRadius: 7,
        cursor: isCancelled || isCompleted ? "pointer" : "grab",
        userSelect: "none",
        padding: "9px 10px 8px",
        marginBottom: 5,
        opacity: isCancelled ? 0.65 : 1,
      }}
    >
      {/* Top row: name + badges */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 4, marginBottom: 4 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: isCancelled ? "var(--ems-board-text-muted)" : isCompleted ? "#22c55e" : "var(--ems-board-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {call.patient_name || `Call #${call.id}`}
          </div>
          {(isReturn || willCall) && (
            <div style={{ marginTop: 2 }}>
              {isReturn && <span style={{ fontSize: 9, color: "#6ea8fe", background: "rgba(96,165,250,0.12)", padding: "1px 5px", borderRadius: 3, fontWeight: 700, marginRight: 3 }}>RETURN</span>}
              {willCall && <span style={{ fontSize: 9, color: "#ffc107", background: "rgba(255,193,7,0.12)", padding: "1px 5px", borderRadius: 3, fontWeight: 700 }}>WILL CALL</span>}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
          {isCancelled && <span style={{ fontSize: 9, color: "#6b7280", background: "rgba(107,114,128,0.15)", border: "1px solid rgba(107,114,128,0.25)", borderRadius: 4, padding: "1px 5px", fontWeight: 700 }}>CNCL</span>}
          {isCompleted && <span style={{ fontSize: 9, color: "#22c55e", background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 4, padding: "1px 5px", fontWeight: 700 }}>DONE</span>}
          {emergency && !isCancelled && <span style={{ fontSize: 9, color: "#f87171", background: "rgba(220,53,69,0.15)", border: "1px solid rgba(220,53,69,0.25)", borderRadius: 4, padding: "1px 5px", fontWeight: 700 }}>EMRG</span>}
          <span style={{ fontSize: 9, color: als ? "#1d4ed8" : "#166534", background: als ? "rgba(29,78,216,0.12)" : "rgba(22,101,52,0.12)", border: `1px solid ${als ? "rgba(29,78,216,0.4)" : "rgba(22,101,52,0.4)"}`, borderRadius: 4, padding: "1px 5px", fontWeight: 700 }}>
            {als ? "ALS" : "BLS"}
          </span>
        </div>
      </div>

      {/* Time */}
      {!willCall && call.pickup_time && (
        <div style={{ fontSize: 11, color: "var(--ems-board-text-muted)", marginBottom: 3 }}>
          🕐 {call.pickup_time}
          {call.appointment_time && !isReturn && <span style={{ color: "var(--ems-board-tab-inactive)", marginLeft: 6 }}>appt {call.appointment_time}</span>}
        </div>
      )}
      {willCall && <div style={{ fontSize: 11, color: "#ca8a04" }}>📞 Will call when ready</div>}

      {/* Route */}
      {call.pickup_address && (
        <div style={{ fontSize: 10, color: "var(--ems-board-text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {call.pickup_address}{call.dropoff_address ? <> → {call.dropoff_address}</> : ""}
        </div>
      )}

      {/* Cancel reason for cancelled cards */}
      {isCancelled && call.cancel_reason && (
        <div style={{ fontSize: 10, color: "#6b7280", marginTop: 3, fontStyle: "italic" }}>
          ✕ {call.cancel_reason}
        </div>
      )}
    </div>
  );
}

function AssignedCallCard({ call, unitStatus, isCurrent, onUnassign, onComplete, onCardClick, onSetPickupTime,
  isFirst, isLast, isOverdue, onSetHighPriority, onMoveUp, onMoveDown, hasPriorityControls }) {
  const emergency = isEmergencyCall(call);
  const als = isAlsCall(call);
  const isReturnCall = (call.call_type || "").toLowerCase() === "return";
  const willCall = isWillCall(call);
  // Only show embedded return section for old-style records with return info in notes
  const ret = parseReturnInfo(call.notes);

  const [wcTime, setWcTime] = useState(call.pickup_time || "");

  const borderColor = isOverdue ? "#dc3545" : emergency ? "#dc3545" : willCall ? "#ffc107" : isReturnCall ? "#6ea8fe" : "#495057";

  return (
    <div className={`mb-2${isOverdue ? " ems-overdue-card" : ""}`} style={{ cursor: "pointer", borderRadius: 6 }} onClick={() => onCardClick && onCardClick(call, false)}>
      {/* Primary leg */}
      <div style={{
        background: isOverdue ? "rgba(220,53,69,0.07)" : "var(--ems-board-bg)",
        borderRadius: 6,
        borderLeft: `3px solid ${borderColor}`,
        padding: "8px 10px",
        marginBottom: ret ? 2 : 0,
      }}>
        <div className="d-flex align-items-start gap-2">
          {/* Priority controls — left side */}
          {hasPriorityControls && (
            <div className="d-flex flex-column gap-1 flex-shrink-0" onClick={e => e.stopPropagation()} style={{ marginTop: 2 }}>
              <button
                title="Set High Priority"
                className="btn btn-sm"
                style={{ fontSize: 9, padding: "1px 5px", lineHeight: 1.2, background: isFirst ? "rgba(255,193,7,0.2)" : "transparent", color: isFirst ? "#ffc107" : "var(--ems-board-text-muted)", border: `1px solid ${isFirst ? "#ffc10744" : "#2a3347"}` }}
                onClick={() => onSetHighPriority && onSetHighPriority(call.id)}
              >⚡</button>
              <button
                title="Move Up"
                disabled={isFirst}
                className="btn btn-sm"
                style={{ fontSize: 9, padding: "1px 5px", lineHeight: 1.2, background: "transparent", color: isFirst ? "#2a3347" : "var(--ems-board-text-muted)", border: "1px solid #2a3347" }}
                onClick={() => onMoveUp && onMoveUp(call.id)}
              >▲</button>
              <button
                title="Move Down"
                disabled={isLast}
                className="btn btn-sm"
                style={{ fontSize: 9, padding: "1px 5px", lineHeight: 1.2, background: "transparent", color: isLast ? "#2a3347" : "var(--ems-board-text-muted)", border: "1px solid #2a3347" }}
                onClick={() => onMoveDown && onMoveDown(call.id)}
              >▼</button>
            </div>
          )}
          <div className="flex-grow-1 min-width-0">
            <div className="d-flex align-items-center gap-2 flex-wrap mb-1">
              <span className={`fw-bold${isOverdue ? " ems-overdue-text" : ""}`} style={{ color: isOverdue ? "#dc3545" : "var(--ems-board-text)", fontSize: 13 }}>
                {call.patient_name || `Call #${call.id}`}
              </span>
              {willCall ? (
                <span style={{ fontSize: 10, color: "#ffc107", background: "rgba(255,193,7,0.15)", padding: "1px 6px", borderRadius: 4, fontWeight: 700 }}>
                  WILL CALL
                </span>
              ) : (
                <span style={{ fontSize: 10, color: isReturnCall ? "#6ea8fe" : "#adb5bd", background: isReturnCall ? "rgba(13,110,253,0.15)" : "var(--ems-board-border)", padding: "1px 6px", borderRadius: 4 }}>
                  {isReturnCall ? "RETURN" : "OUTBOUND"}
                </span>
              )}
              {als && <span className="badge badge-als" style={{ fontSize: 10 }}>ALS</span>}
              {emergency && <span className="badge bg-danger" style={{ fontSize: 10 }}>EMRG</span>}
              {isCurrent && unitStatus && <StatusPill status={unitStatus} size="sm" />}
              {!isCurrent && (
                <span style={{ fontSize: 10, color: "var(--ems-board-text-muted)", background: "var(--ems-board-bg-input)", padding: "1px 6px", borderRadius: 4 }}>
                  QUEUED
                </span>
              )}
            </div>
            {/* Will Call: show time setter or current time */}
            {willCall ? (
              <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: "#ffc107" }}>📞 Set pickup time:</span>
                <input
                  type="time"
                  value={wcTime}
                  onChange={(e) => setWcTime(e.target.value)}
                  style={{ fontSize: 11, padding: "1px 4px", background: "var(--ems-board-bg-card-alt)", border: "1px solid #2a3347", borderRadius: 4, color: "#e9ecef", width: 90 }}
                />
                <button
                  className="btn btn-sm"
                  style={{ fontSize: 10, padding: "1px 8px", background: "rgba(255,193,7,0.15)", color: "#ffc107", border: "1px solid #ffc10744" }}
                  onClick={(e) => { e.stopPropagation(); onSetPickupTime && onSetPickupTime(call.id, wcTime); }}
                >
                  Set
                </button>
              </div>
            ) : call.pickup_time ? (
              <div style={{ fontSize: 11, color: "var(--ems-board-text-muted)" }}>
                🕐 {call.pickup_time}
                {call.appointment_time ? ` · appt ${call.appointment_time}` : ""}
              </div>
            ) : null}
            {call.pickup_address && (
              <div className="text-truncate" style={{ fontSize: 11, color: "var(--ems-board-text-muted)" }}>
                {call.pickup_address} → {call.dropoff_address}
              </div>
            )}
          </div>
          <div className="d-flex flex-column gap-1 flex-shrink-0">
            <button
              className="btn btn-sm btn-outline-success"
              style={{ fontSize: 10, padding: "2px 8px" }}
              onClick={(e) => { e.stopPropagation(); onComplete(call.assignment_id); }}
              title="Mark as completed"
            >
              ✓ Done
            </button>
            <button
              className="btn btn-sm btn-outline-secondary"
              style={{ fontSize: 10, padding: "2px 8px" }}
              onClick={(e) => { e.stopPropagation(); onUnassign(call.assignment_id); }}
            >
              Unassign
            </button>
          </div>
        </div>
      </div>

      {/* Return leg (same assignment, shown separately) */}
      {ret && (
        <div style={{
          background: "var(--ems-board-bg)",
          borderRadius: 6,
          borderLeft: "3px solid #6ea8fe",
          padding: "8px 10px",
          opacity: 0.85,
        }}>
          <div className="d-flex align-items-center gap-2 flex-wrap mb-1">
            <span className="fw-semibold" style={{ color: "var(--ems-board-text)", fontSize: 13 }}>
              {call.patient_name || `Call #${call.id}`}
            </span>
            <span style={{ fontSize: 10, color: "#6ea8fe", background: "rgba(13,110,253,0.15)", padding: "1px 6px", borderRadius: 4 }}>
              RETURN
            </span>
            <span className="text-muted" style={{ fontSize: 10 }}>unassigned to unit</span>
          </div>
          {ret.returnTime && (
            <div style={{ fontSize: 11, color: "var(--ems-board-text-muted)" }}>🕐 {ret.returnTime}</div>
          )}
          <div className="text-truncate" style={{ fontSize: 11, color: "var(--ems-board-text-muted)" }}>
            {ret.returnPickup} → {ret.returnDestination}
          </div>
        </div>
      )}
    </div>
  );
}

function CompletedCallCard({ call, onCardClick }) {
  const ret = parseReturnInfo(call.notes);
  return (
    <div className="mb-2" style={{ opacity: 0.45, cursor: "pointer" }} onClick={() => onCardClick && onCardClick(call, true)}>
      <div style={{
        background: "var(--ems-board-bg)",
        borderRadius: 6,
        borderLeft: "3px solid #495057",
        padding: "8px 10px",
        marginBottom: ret ? 2 : 0,
      }}>
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <span className="text-muted fw-semibold" style={{ fontSize: 13, textDecoration: "line-through" }}>
            {call.patient_name || `Call #${call.id}`}
          </span>
          <span style={{ fontSize: 10, color: "var(--ems-board-text-muted)", background: "var(--ems-board-border)", padding: "1px 6px", borderRadius: 4 }}>
            COMPLETED
          </span>
          {call.pickup_time && (
            <span className="text-muted" style={{ fontSize: 11 }}>🕐 {call.pickup_time}</span>
          )}
        </div>
        {call.pickup_address && (
          <div className="text-truncate" style={{ fontSize: 11, color: "var(--ems-board-text-muted)" }}>
            {call.pickup_address} → {call.dropoff_address}
          </div>
        )}
      </div>
      {ret && (
        <div style={{
          background: "var(--ems-board-bg)",
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

const TS_FIELDS = [
  { key: "dispatched_at",    label: "Dispatched",   color: "#6ea8fe" },
  { key: "arrived_pickup_at", label: "On Scene",    color: "#75b798" },
  { key: "patient_loaded_at", label: "Transporting", color: "#ffc107" },
  { key: "arrived_dest_at",  label: "At Dest",      color: "#c29ffa" },
  { key: "completed_at",     label: "Completed",    color: "#adb5bd" },
];

function isoToLocalTime(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d)) return "";
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  } catch { return ""; }
}

function isoToLocalDate(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d)) return "";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch { return ""; }
}

function setIsoTime(existingIso, callDate, timeStr) {
  // Build a new ISO string preserving date (use call's trip_date if no existing ts)
  const date = existingIso ? new Date(existingIso).toISOString().slice(0, 10)
    : (callDate || new Date().toISOString().slice(0, 10));
  const dt = new Date(`${date}T${timeStr}:00`);
  if (isNaN(dt)) return existingIso;
  return dt.toISOString().slice(0, 19);
}

function CallDetailModal({ call, isCompleted, onClose, onUnassign, onComplete, onReopen, onCancel, onUncancel, onEdit, onTimestampsUpdated }) {
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelError, setCancelError] = useState("");
  const [cancelling, setCancelling] = useState(false);

  // Timestamps editing
  const [showTs, setShowTs] = useState(false);
  const [tsValues, setTsValues] = useState({});
  const [tsSaving, setTsSaving] = useState(false);
  const [tsError, setTsError] = useState("");

  useEffect(() => {
    const init = {};
    TS_FIELDS.forEach(f => { init[f.key] = isoToLocalTime(call[f.key]); });
    setTsValues(init);
  }, [call]);

  const handleTsSave = async () => {
    setTsSaving(true);
    setTsError("");
    try {
      const payload = {};
      TS_FIELDS.forEach(f => {
        const t = (tsValues[f.key] || "").trim();
        if (t) payload[f.key] = setIsoTime(call[f.key], call.trip_date, t);
        else payload[f.key] = null;
      });
      await updateCall(call.id, payload);
      if (onTimestampsUpdated) onTimestampsUpdated();
      setShowTs(false);
    } catch (e) {
      setTsError(e.message || "Save failed");
    } finally {
      setTsSaving(false);
    }
  };

  const handleCancelSubmit = async () => {
    if (!cancelReason.trim()) { setCancelError("Reason is required."); return; }
    setCancelling(true);
    try {
      await onCancel(call.id, cancelReason.trim());
      onClose();
    } catch (err) {
      setCancelError(err.message || "Failed to cancel call.");
    } finally {
      setCancelling(false);
    }
  };

  const ret = parseReturnInfo(call.notes);
  const isReturnCall = (call.call_type || "").toLowerCase() === "return";
  const emergency = isEmergencyCall(call);
//   const als = isAlsCall(call);

  const dispatcher = call.dispatcher_name;
  const phone = call.caller_phone || call.patient_phone;
  const dob = call.patient_dob;
  const callerNote = call.caller_note;
  const cleanNotes = (call.notes || "").trim();

  const accentColor = emergency ? "#dc3545" : isReturnCall ? "#6ea8fe" : isCompleted ? "#6c757d" : "#0d6efd";
  const slColor = { bls: "#75b798", als: "#6ea8fe", emergency: "#ea868f", stretcher: "#c29ffa" }[call.service_level?.toLowerCase()] || "#adb5bd";

  // eslint-disable-next-line no-unused-vars
  const Section = ({ icon: Icon, title, children }) => (
    <div style={{ marginBottom: 14 }}>
      <div className="d-flex align-items-center gap-2 mb-2">
        <span style={{ color: "var(--ems-board-text-muted)", fontSize: 12 }}><Icon /></span>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: "var(--ems-board-text-muted)", textTransform: "uppercase" }}>{title}</span>
        <div style={{ flex: 1, height: 1, background: "var(--ems-board-border)" }} />
      </div>
      {children}
    </div>
  );

  return (
    <div className="modal d-block" style={{ background: "rgba(0,0,0,0.78)", zIndex: 1060 }} tabIndex={-1} onClick={onClose}>
      <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-content" style={{ background: "var(--ems-board-bg-card-alt)", border: `1px solid ${accentColor}44`, borderRadius: 14, overflow: "hidden" }}>

          {/* Color bar + header */}
          <div style={{ background: `linear-gradient(135deg, ${accentColor}22 0%, #1a2236 100%)`, borderBottom: `1px solid ${accentColor}33`, padding: "14px 18px" }}>
            <div className="d-flex align-items-start justify-content-between">
              <div>
                <div className="d-flex align-items-center gap-2 flex-wrap mb-1">
                  <span className="fw-bold" style={{ color: "var(--ems-board-text)", fontSize: 17 }}>
                    {call.patient_name || `Call #${call.id}`}
                  </span>
                  {isReturnCall && (
                    <span style={{ fontSize: 11, color: "#6ea8fe", background: "rgba(13,110,253,0.18)", padding: "2px 8px", borderRadius: 20, fontWeight: 600 }}>RETURN</span>
                  )}
                  {emergency && (
                    <span style={{ fontSize: 11, background: "rgba(220,53,69,0.2)", color: "#ea868f", padding: "2px 8px", borderRadius: 20, fontWeight: 700, border: "1px solid #dc354555" }}>⚡ EMERGENCY</span>
                  )}
                </div>
                <div className="d-flex align-items-center gap-2 flex-wrap">
                  <span style={{ fontSize: 12, color: slColor, background: `${slColor}18`, padding: "2px 10px", borderRadius: 20, fontWeight: 700, border: `1px solid ${slColor}44` }}>
                    {(call.service_level || "—").toUpperCase()}
                  </span>
                  {isCompleted ? (
                    <span style={{ fontSize: 11, color: "var(--ems-board-text-muted)", background: "rgba(108,117,125,0.2)", padding: "2px 8px", borderRadius: 20, border: "1px solid #49505744" }}>✓ Completed</span>
                  ) : (
                    <span style={{ fontSize: 11, color: "#75b798", background: "rgba(25,135,84,0.15)", padding: "2px 8px", borderRadius: 20, border: "1px solid #75b79844" }}>● Active</span>
                  )}
                  <span style={{ fontSize: 11, color: "var(--ems-board-text-muted)" }}>#{call.id}</span>
                </div>
              </div>
              <button className="btn-close btn-close-white" style={{ fontSize: 11, opacity: 0.6 }} onClick={onClose} />
            </div>
          </div>

          <div style={{ padding: "16px 18px", maxHeight: "65vh", overflowY: "auto" }}>

            {/* Trip route */}
            <Section icon={FaMapMarkerAlt} title="Route">
              <div style={{ background: "var(--ems-board-bg-card-alt)", borderRadius: 10, padding: "10px 14px" }}>
                <div className="d-flex align-items-start gap-3">
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 3 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#75b798", border: "2px solid #75b798" }} />
                    <div style={{ width: 1, height: 28, background: "var(--ems-board-border)", margin: "3px 0" }} />
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: accentColor, border: `2px solid ${accentColor}` }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ fontSize: 10, color: "var(--ems-board-text-muted)", marginBottom: 2 }}>PICKUP</div>
                      <div style={{ fontSize: 13, color: "var(--ems-board-text)", fontWeight: 500 }}>{call.pickup_address || "—"}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: "var(--ems-board-text-muted)", marginBottom: 2 }}>DROP-OFF</div>
                      <div style={{ fontSize: 13, color: "var(--ems-board-text)", fontWeight: 500 }}>{call.dropoff_address || "—"}</div>
                    </div>
                  </div>
                </div>
              </div>
            </Section>

            {/* Time */}
            <Section icon={FaClock} title="Schedule">
              <div className="d-flex gap-2">
                <div style={{ flex: 1, background: "var(--ems-board-bg-card-alt)", borderRadius: 8, padding: "8px 12px" }}>
                  <div style={{ fontSize: 10, color: "var(--ems-board-text-muted)", marginBottom: 3 }}>PICKUP TIME</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "var(--ems-board-text)" }}>{call.pickup_time || "—"}</div>
                </div>
                <div style={{ flex: 1, background: "var(--ems-board-bg-card-alt)", borderRadius: 8, padding: "8px 12px" }}>
                  <div style={{ fontSize: 10, color: "var(--ems-board-text-muted)", marginBottom: 3 }}>APPT TIME</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "var(--ems-board-text)" }}>{call.appointment_time || "—"}</div>
                </div>
                <div style={{ flex: 1, background: "var(--ems-board-bg-card-alt)", borderRadius: 8, padding: "8px 12px" }}>
                  <div style={{ fontSize: 10, color: "var(--ems-board-text-muted)", marginBottom: 3 }}>TRIP DATE</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ems-board-text-muted)" }}>{call.trip_date || "—"}</div>
                </div>
              </div>
            </Section>

            {/* Timestamps */}
            <Section icon={FaClock} title="Dispatch Timestamps">
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: showTs ? 10 : 0 }}>
                {TS_FIELDS.map(f => {
                  const ts = call[f.key];
                  return (
                    <div key={f.key} style={{ background: "var(--ems-board-bg-card-alt)", borderRadius: 8, padding: "5px 10px", minWidth: 90, opacity: ts ? 1 : 0.45 }}>
                      <div style={{ fontSize: 9, color: f.color, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>{f.label}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: ts ? "var(--ems-board-text)" : "var(--ems-board-text-muted)" }}>
                        {ts ? isoToLocalTime(ts) : "—"}
                      </div>
                      {ts && <div style={{ fontSize: 9, color: "var(--ems-board-text-muted)" }}>{isoToLocalDate(ts)}</div>}
                    </div>
                  );
                })}
                <button
                  className="btn btn-sm"
                  style={{ fontSize: 11, padding: "4px 10px", background: showTs ? "rgba(13,110,253,0.18)" : "transparent", color: showTs ? "#6ea8fe" : "var(--ems-board-text-muted)", border: `1px solid ${showTs ? "#6ea8fe55" : "var(--ems-board-border)"}`, borderRadius: 7, marginLeft: "auto" }}
                  onClick={() => { setShowTs(v => !v); setTsError(""); }}
                >
                  {showTs ? "Cancel" : "✏ Edit"}
                </button>
              </div>
              {showTs && (
                <div style={{ background: "var(--ems-board-bg-card-alt)", borderRadius: 10, padding: "12px 14px", border: "1px solid var(--ems-board-border)" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10, marginBottom: 10 }}>
                    {TS_FIELDS.map(f => (
                      <div key={f.key}>
                        <label style={{ fontSize: 10, fontWeight: 700, color: f.color, textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 4 }}>{f.label}</label>
                        <input
                          type="time"
                          value={tsValues[f.key] || ""}
                          onChange={e => setTsValues(p => ({ ...p, [f.key]: e.target.value }))}
                          style={{ width: "100%", fontSize: 13, padding: "4px 8px", borderRadius: 7, border: "1px solid var(--ems-board-border)", background: "var(--ems-board-bg)", color: "var(--ems-board-text)", outline: "none" }}
                        />
                      </div>
                    ))}
                  </div>
                  {tsError && <div style={{ fontSize: 12, color: "#ea868f", marginBottom: 6 }}>{tsError}</div>}
                  <button
                    className="btn btn-sm"
                    style={{ fontSize: 12, padding: "5px 16px", background: "rgba(13,110,253,0.18)", color: "#6ea8fe", border: "1px solid #6ea8fe55", fontWeight: 600 }}
                    onClick={handleTsSave}
                    disabled={tsSaving}
                  >
                    {tsSaving ? "Saving…" : "Save Timestamps"}
                  </button>
                </div>
              )}
            </Section>

            {/* Patient / contact */}
            {(dob || phone || dispatcher) && (
              <Section icon={FaUser} title="Patient & Contact">
                <div className="d-flex gap-2 flex-wrap">
                  {dob && (
                    <div style={{ background: "var(--ems-board-bg-card-alt)", borderRadius: 8, padding: "7px 12px", minWidth: 120 }}>
                      <div style={{ fontSize: 10, color: "var(--ems-board-text-muted)", marginBottom: 2 }}>DATE OF BIRTH</div>
                      <div style={{ fontSize: 13, color: "var(--ems-board-text)" }}>{dob}</div>
                    </div>
                  )}
                  {phone && (
                    <div style={{ background: "var(--ems-board-bg-card-alt)", borderRadius: 8, padding: "7px 12px", minWidth: 140 }}>
                      <div style={{ fontSize: 10, color: "var(--ems-board-text-muted)", marginBottom: 2 }}>PHONE</div>
                      <div style={{ fontSize: 13, color: "var(--ems-board-text)" }}><FaPhoneAlt style={{ fontSize: 10, marginRight: 4 }} />{phone}</div>
                    </div>
                  )}
                  {dispatcher && (
                    <div style={{ background: "var(--ems-board-bg-card-alt)", borderRadius: 8, padding: "7px 12px", minWidth: 120 }}>
                      <div style={{ fontSize: 10, color: "var(--ems-board-text-muted)", marginBottom: 2 }}>DISPATCHER</div>
                      <div style={{ fontSize: 13, color: "var(--ems-board-text)" }}><FaIdBadge style={{ fontSize: 10, marginRight: 4 }} />{dispatcher}</div>
                    </div>
                  )}
                </div>
              </Section>
            )}

            {/* Caller note */}
            {callerNote && (
              <Section icon={FaPhoneAlt} title="Caller Note">
                <div style={{ background: "rgba(255,193,7,0.08)", border: "1px solid rgba(255,193,7,0.2)", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "#ffe69c" }}>
                  {callerNote}
                </div>
              </Section>
            )}

            {/* Return leg (legacy embedded) */}
            {ret && (
              <Section icon={FaArrowRight} title="Return Leg">
                <div style={{ background: "rgba(13,110,253,0.08)", border: "1px solid rgba(110,168,254,0.2)", borderRadius: 8, padding: "8px 12px" }}>
                  <div style={{ fontSize: 12, color: "#6ea8fe" }}>
                    {ret.returnPickup} <FaArrowRight style={{ fontSize: 9 }} /> {ret.returnDestination}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ems-board-text-muted)", marginTop: 3 }}>
                    {ret.returnTime ? `@ ${ret.returnTime}` : "Will Call"}
                  </div>
                </div>
              </Section>
            )}

            {/* Additional notes */}
            {cleanNotes && (
              <Section icon={FaClipboardList} title="Notes">
                <div style={{ background: "var(--ems-board-bg-card-alt)", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "var(--ems-board-text-muted)", whiteSpace: "pre-wrap", maxHeight: 80, overflowY: "auto" }}>
                  {cleanNotes}
                </div>
              </Section>
            )}
          </div>

          {/* Cancel form */}
          {showCancelForm && (
            <div style={{ background: "var(--ems-board-bg-header)", borderTop: "1px solid #dc354544", padding: "12px 18px" }}>
              <div style={{ fontSize: 12, color: "#ea868f", fontWeight: 600, marginBottom: 6 }}>Cancel Call — Reason Required</div>
              <textarea
                className="form-control form-control-sm mb-2"
                style={{ background: "var(--ems-board-bg)", color: "var(--ems-board-text)", border: "1px solid #dc354555", resize: "vertical", fontSize: 13 }}
                rows={2}
                placeholder="State the reason for cancellation..."
                value={cancelReason}
                onChange={(e) => { setCancelReason(e.target.value); setCancelError(""); }}
              />
              {cancelError && <div style={{ fontSize: 12, color: "#ea868f", marginBottom: 6 }}>{cancelError}</div>}
              <div className="d-flex gap-2">
                <button
                  className="btn btn-sm"
                  style={{ background: "rgba(220,53,69,0.2)", color: "#ea868f", border: "1px solid #dc354555", fontWeight: 600, fontSize: 13 }}
                  onClick={handleCancelSubmit}
                  disabled={cancelling}
                >
                  {cancelling ? "Cancelling..." : "Confirm Cancel"}
                </button>
                <button
                  className="btn btn-sm"
                  style={{ background: "transparent", color: "var(--ems-board-text-muted)", border: "1px solid var(--ems-board-border)", fontSize: 13 }}
                  onClick={() => { setShowCancelForm(false); setCancelReason(""); setCancelError(""); }}
                >
                  Back
                </button>
              </div>
            </div>
          )}

          {/* Footer actions */}
          <div style={{ background: "var(--ems-board-bg-header)", borderTop: "1px solid var(--ems-board-border)", padding: "12px 18px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {call.status !== "cancelled" && !showCancelForm && (
              <>
                {!isCompleted && (
                  <>
                    <button
                      className="btn btn-sm"
                      style={{ background: "rgba(25,135,84,0.15)", color: "#75b798", border: "1px solid #75b79855", fontWeight: 600, fontSize: 13, padding: "6px 16px" }}
                      onClick={() => { onComplete(call.assignment_id); onClose(); }}
                    >
                      ✓ Mark Complete
                    </button>
                    <button
                      className="btn btn-sm"
                      style={{ background: "rgba(108,117,125,0.12)", color: "var(--ems-board-text-muted)", border: "1px solid #49505755", fontSize: 13, padding: "6px 14px" }}
                      onClick={() => { onUnassign(call.assignment_id); onClose(); }}
                    >
                      ↩ Unassign
                    </button>
                  </>
                )}
                {isCompleted && (
                  <button
                    className="btn btn-sm"
                    style={{ background: "rgba(255,193,7,0.12)", color: "#ffc107", border: "1px solid #ffc10755", fontWeight: 600, fontSize: 13, padding: "6px 16px" }}
                    onClick={() => { onReopen(call.assignment_id); onClose(); }}
                  >
                    ↩ Reopen Call
                  </button>
                )}
                <button
                  className="btn btn-sm"
                  style={{ background: "rgba(220,53,69,0.1)", color: "#ea868f", border: "1px solid #dc354533", fontSize: 13, padding: "6px 14px" }}
                  onClick={() => setShowCancelForm(true)}
                >
                  ✕ Cancel Call
                </button>
              </>
            )}
            {call.status === "cancelled" && (
              <div className="d-flex align-items-center gap-3">
                <span style={{ fontSize: 12, color: "#ea868f", fontWeight: 600 }}>
                  ✕ Cancelled{call.cancel_reason ? ` — ${call.cancel_reason}` : ""}
                </span>
                <button
                  className="btn btn-sm"
                  style={{ background: "rgba(245,158,11,0.12)", color: "#fbbf24", border: "1px solid #f59e0b44", fontSize: 12, padding: "4px 12px" }}
                  onClick={() => { onUncancel(call.id); onClose(); }}
                >
                  ↩ Uncancel
                </button>
              </div>
            )}
            {onEdit && (
              <button
                className="btn btn-sm"
                style={{ background: "rgba(13,110,253,0.1)", color: "#6ea8fe", border: "1px solid #6ea8fe44", fontSize: 13, padding: "6px 14px" }}
                onClick={() => { onEdit(call); onClose(); }}
              >
                ✏ Edit Call
              </button>
            )}
            <button
              className="btn btn-sm ms-auto"
              style={{ background: "transparent", color: "var(--ems-board-text-muted)", border: "1px solid #2a3347", fontSize: 13, padding: "6px 14px" }}
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function WarningModal({ warning, onConfirm, onCancel }) {
  if (!warning) return null;
  return (
    <div className="modal d-block" style={{ background: "rgba(0,0,0,0.65)" }} tabIndex={-1}>
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content border-warning" style={{ background: "var(--ems-board-bg-header)" }}>
          <div className="modal-header border-warning">
            <h5 className="modal-title text-warning">⚠ Compatibility Warning</h5>
          </div>
          <div className="modal-body" style={{ color: "var(--ems-board-text)" }}>
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

// ── Crew Planner constants ─────────────────────────────────────────────────

const UNIT_TYPES = ["BLS", "ALS", "ASSIST"];

const initialCrew = { driver: "", medical: "", assist1: "", assist2: "" };

const initialUnitForm = {
  shiftDate: todayStr(),
  unitType: "BLS",
  truckNumber: "",
  startTime: "",
  endTime: "",
  endDate: "",
  shiftType: "day",
  crew: { ...initialCrew },
  patientOrder: [],
  noPatient: false,
};

// ── Main Page ──────────────────────────────────────────────────────────────

export default function DispatchBoardPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [date, setDate] = useState(todayStr());
  const [board, setBoard] = useState({ openCalls: [], completedCalls: [], cancelledCalls: [], units: [] });
  const [callFilter, setCallFilter] = useState("open"); // "open" | "all" | "completed" | "cancelled"
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [draggedCall, setDraggedCall] = useState(null);
  const [dragOverUnitId, setDragOverUnitId] = useState(null);
  const [warning, setWarning] = useState(null);
  const [pendingAssign, setPendingAssign] = useState(null);
  const [callModal, setCallModal] = useState(null); // { call, isCompleted }

  // All user settings from context
  const { settings: userSettings, updateSettings, settingsLoaded } = useUserSettings();
  const dispatchThresholds = userSettings.dispatch;
  // Current clock — updates every 30s for overdue detection
  const [now, setNow] = useState(() => new Date());

  // Left panel tab: "calls" | "staff"
  const [leftPanelTab, setLeftPanelTab] = useState("calls");

  // Crew planner state (embedded)
  const [employees, setEmployees] = useState([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [crewOpenCalls, setCrewOpenCalls] = useState([]);
  const [unitForm, setUnitForm] = useState({ ...initialUnitForm });
  const [editingUnitId, setEditingUnitId] = useState(null);
  const [showUnitDrawer, setShowUnitDrawer] = useState(false);
  const [nightDialog, setNightDialog] = useState(null);
  const [nightForm, setNightForm] = useState({ startTime: "", endTime: "", endDate: "" });
  const [crewSaving, setCrewSaving] = useState(false);

  // Call drawer state
  const [callDrawer, setCallDrawer] = useState({ open: false, call: null }); // call=null → create mode

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

  // Ref so the drag mouseup handler can call updateSettings without stale closure
  const updateSettingsRef = useRef(updateSettings);
  updateSettingsRef.current = updateSettings;

  // Initialize panel sizes from saved user settings (runs once when settings load)
  useEffect(() => {
    if (!settingsLoaded) return;
    const saved = userSettings.ui?.panels?.dispatch;
    if (saved?.leftWidth) {
      setLeftWidth(saved.leftWidth);
      leftWidthRef.current = saved.leftWidth;
      dragStartW.current = saved.leftWidth;
    }
    if (saved?.bottomHeight) {
      setBottomHeight(saved.bottomHeight);
      bottomHeightRef.current = saved.bottomHeight;
      rowDragStartH.current = saved.bottomHeight;
    }
  }, [settingsLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

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
    function onUp() {
      if (isDragging.current || isRowDragging.current) {
        updateSettingsRef.current?.({ ui: { panels: { dispatch: {
          leftWidth:    leftWidthRef.current,
          bottomHeight: bottomHeightRef.current,
        }}}});
      }
      isDragging.current = false;
      isRowDragging.current = false;
    }
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

  const loadBoard = useCallback(async (d, silent = false) => {
    if (!silent) { setLoading(true); setError(null); }
    try {
      const data = await fetchBoard(d);
      setBoard(data);
      if (selectedUnit) {
        const fresh = data.units.find((u) => u.id === selectedUnit.id);
        setSelectedUnit(fresh || null);
      }
    } catch (e) {
      if (!silent) setError(e.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [selectedUnit]);

  useEffect(() => { loadBoard(date); }, [date]);

  // Auto-refresh every 30 s when viewing today's board.
  useEffect(() => {
    if (date !== todayStr()) return;
    const interval = setInterval(() => loadBoard(date, true), 30_000);
    return () => clearInterval(interval);
  }, [date, loadBoard]);

  // Clock tick every 30 s for overdue detection.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

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
    } catch (e) { toast.error("Assignment failed", e.message); }
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
    } catch (e) { toast.error("Status update failed", e.message); }
  }

  async function handleUnassign(assignmentId) {
    try {
      await unassignCall(assignmentId);
      await loadBoard(date);
    } catch (e) { toast.error("Unassign failed", e.message); }
  }

  async function handleComplete(assignmentId) {
    try {
      await completeAssignment(assignmentId);
      await loadBoard(date);
    } catch (e) { toast.error("Complete failed", e.message); }
  }

  async function handleReopen(assignmentId) {
    if (!assignmentId) { toast.error("Reopen failed", "No assignment linked to this call."); return; }
    try {
      await reopenAssignment(assignmentId);
      await loadBoard(date);
    } catch (e) { toast.error("Reopen failed", e.message); }
  }

  async function handleCancelCall(callId, reason) {
    const headers = {
      "X-User-Role": currentUser?.role || "",
      "X-User-Id": String(currentUser?.id || ""),
    };
    await cancelCall(callId, reason, headers);
    await loadBoard(date);
  }

  async function handleUncancelCall(callId) {
    const headers = {
      "X-User-Role": currentUser?.role || "",
      "X-User-Id": String(currentUser?.id || ""),
    };
    try {
      await uncancelCall(callId, headers);
      await loadBoard(date);
    } catch (e) { toast.error("Uncancel failed", e.message); }
  }

  async function handleSetWillCallTime(callId, pickupTime) {
    if (!pickupTime) return;
    try {
      await fetch(`${API_BASE}/api/calls/${callId}/pickup-time`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pickup_time: pickupTime }),
      });
      await loadBoard(date);
    } catch (e) { toast.error("Failed to set pickup time", e.message); }
  }

  function handleCardClick(call, isCompleted) {
    setCallModal({ call, isCompleted });
  }

  // ── Call priority helpers ───────────────────────────────────────────────

  function sortCallsByPriority(calls, callPriority) {
    if (!callPriority || callPriority.length === 0) {
      return [...calls].sort((a, b) => timeToMinutes(a.pickup_time) - timeToMinutes(b.pickup_time));
    }
    const rank = {};
    callPriority.forEach((id, i) => { rank[id] = i; });
    return [...calls].sort((a, b) => {
      const ra = rank[a.id] !== undefined ? rank[a.id] : 9999;
      const rb = rank[b.id] !== undefined ? rank[b.id] : 9999;
      if (ra !== rb) return ra - rb;
      return timeToMinutes(a.pickup_time) - timeToMinutes(b.pickup_time);
    });
  }

  async function handleSetHighPriority(unit, callId) {
    const ids = sortCallsByPriority(unit.assignedCalls || [], unit.callPriority || []).map(c => c.id);
    const newOrder = [callId, ...ids.filter(id => id !== callId)];
    try {
      await updateCallOrder(unit.id, newOrder);
      await loadBoard(date, true);
    } catch (e) { toast.error("Priority update failed", e.message); }
  }

  async function handleMoveCall(unit, callId, direction) {
    const sorted = sortCallsByPriority(unit.assignedCalls || [], unit.callPriority || []);
    const ids = sorted.map(c => c.id);
    const idx = ids.indexOf(callId);
    if (idx < 0) return;
    const newIdx = direction === "up" ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= ids.length) return;
    [ids[idx], ids[newIdx]] = [ids[newIdx], ids[idx]];
    try {
      await updateCallOrder(unit.id, ids);
      await loadBoard(date, true);
    } catch (e) { toast.error("Reorder failed", e.message); }
  }

  async function handleResetPriority(unit) {
    try {
      await updateCallOrder(unit.id, []);
      await loadBoard(date, true);
    } catch (e) { toast.error("Reset failed", e.message); }
  }

  // ── Overdue / stuck detection ───────────────────────────────────────────

  function getCallOverdueMinutes(call, unitStatus) {
    if (['on_scene', 'transporting', 'at_destination'].includes(unitStatus)) return 0;
    if (!call.pickup_time || call.pickup_time === "will_call") return 0;
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const pickupMin = timeToMinutes(call.pickup_time);
    if (pickupMin >= 9999) return 0; // will_call
    return Math.max(0, nowMin - pickupMin);
  }

  function getUnitStuckMinutes(unit) {
    if (!unit.statusChangedAt || unit.dispatchStatus === 'available' || unit.dispatchStatus === 'out_of_service') return 0;
    const changed = new Date(unit.statusChangedAt);
    return Math.max(0, (now - changed) / 60000);
  }

  function isCallOverdue(call, unitStatus) {
    return getCallOverdueMinutes(call, unitStatus) > (dispatchThresholds.pickup_late_after ?? 0);
  }

  function isUnitStuck(unit) {
    return getUnitStuckMinutes(unit) > (dispatchThresholds.stuck_after ?? 30);
  }

  // ── Crew Planner logic ─────────────────────────────────────────────────

  const loadEmployees = useCallback(async () => {
    setEmployeesLoading(true);
    try {
      const data = await getEmployees();
      setEmployees(Array.isArray(data) ? data : []);
    } catch (e) {
      toast.error("Failed to load employees", e.message);
    } finally {
      setEmployeesLoading(false);
    }
  }, []);

  useEffect(() => { loadEmployees(); }, [loadEmployees]);

  // When date changes, reload open calls for patient picker
  useEffect(() => {
    getCalls({ trip_date: date }, 1, 100)
      .then(d => setCrewOpenCalls(Array.isArray(d?.items) ? d.items : []))
      .catch(() => {});
  }, [date]);

  const getEmployeeById = (id) => employees.find(e => String(e.id) === String(id));
  const getEmployeeName = (id) => { const e = getEmployeeById(id); return e ? `${e.firstName} ${e.lastName}` : "Not assigned"; };

  const normalizeLicense = (l) => l ? { hasLicense: Boolean(l.hasLicense), licenseName: l.licenseName || "", expirationDate: l.expirationDate || "" } : { hasLicense: false, licenseName: "", expirationDate: "" };
  const getLicenseStatus = (l) => {
    const nl = normalizeLicense(l);
    if (!nl.hasLicense) return "No License";
    if (!nl.expirationDate) return "Active";
    const diff = Math.ceil((new Date(`${nl.expirationDate}T23:59:59`) - new Date()) / 86400000);
    return diff < 0 ? "Expired" : diff <= 30 ? "Expiring Soon" : "Active";
  };
  const getCprWarning = (emp) => {
    const s = getLicenseStatus(normalizeLicense(emp.cpr));
    if (!normalizeLicense(emp.cpr).hasLicense) return "Missing CPR";
    if (s === "Expired") return "CPR Expired";
    if (s === "Expiring Soon") return "CPR Expiring Soon";
    return "";
  };

  const isEmployeeEligibleForRole = (emp, role, unitType) => {
    if (!emp.isActive || emp.status !== "active") return false;
    if (role === "driver") return Boolean(emp.evoc?.hasLicense) || String(emp.role || "").toLowerCase() === "driver";
    if (role === "medical") {
      if (unitType === "BLS") return Boolean(emp.emt?.hasLicense || emp.paramedic?.hasLicense);
      if (unitType === "ALS") return Boolean(emp.paramedic?.hasLicense);
      return false;
    }
    return true;
  };

  const isMedicalSlotVisible = (t) => t === "ALS" || t === "BLS";

  const getSelectedEmployeeIds = (currentRole) =>
    Object.entries(unitForm.crew).filter(([r, id]) => r !== currentRole && id).map(([, id]) => String(id));

  const getAvailableEmployeesForRole = (role) => {
    const selected = getSelectedEmployeeIds(role);
    return employees.filter(emp => !selected.includes(String(emp.id)) && isEmployeeEligibleForRole(emp, role, unitForm.unitType));
  };

  const getEmployeeAssignmentsInOtherUnits = (empId) => {
    const nid = String(empId);
    const result = [];
    board.units.forEach(unit => {
      if (editingUnitId && String(unit.id) === String(editingUnitId)) return;
      if (unit.shiftDate !== unitForm.shiftDate) return;
      Object.entries(unit.crew || {}).forEach(([role, id]) => {
        if (String(id) === nid) result.push({ unitId: unit.id, truckNumber: unit.truckNumber, unitType: unit.unitType, startTime: unit.startTime, role });
      });
    });
    return result;
  };

  const assignedEmployeeIds = useMemo(() => {
    const ids = [];
    board.units.forEach(unit => {
      if (editingUnitId && String(unit.id) === String(editingUnitId)) return;
      Object.values(unit.crew || {}).forEach(id => { if (id) ids.push(String(id)); });
    });
    return ids;
  }, [board.units, editingUnitId]);

  const unassignedStaff = useMemo(() =>
    employees.filter(emp => emp.isActive && emp.status === "active" && !assignedEmployeeIds.includes(String(emp.id))),
    [employees, assignedEmployeeIds]
  );

  const unitValidationErrors = useMemo(() => {
    const errors = [];
    if (!unitForm.shiftDate.trim()) errors.push("Shift Date is required.");
    if (!unitForm.truckNumber.trim()) errors.push("Truck Number is required.");
    if (!unitForm.startTime.trim()) errors.push("Start Time is required.");
    if (!unitForm.noPatient && unitForm.patientOrder.length === 0) errors.push("Add at least one patient, or check \"No patient assigned\".");
    if (!unitForm.crew.driver) errors.push("Driver is required.");
    if (unitForm.unitType === "BLS" && !unitForm.crew.medical) errors.push("BLS unit requires an EMT or Paramedic.");
    if (unitForm.unitType === "ALS" && !unitForm.crew.medical) errors.push("ALS unit requires a Paramedic.");
    return errors;
  }, [unitForm]);

  const unitWarningMessages = useMemo(() => {
    const warnings = [];
    Object.values(unitForm.crew).filter(Boolean).map(id => getEmployeeById(id)).filter(Boolean).forEach(emp => {
      const w = getCprWarning(emp);
      if (w) warnings.push(`${emp.firstName} ${emp.lastName}: ${w}.`);
      getEmployeeAssignmentsInOtherUnits(emp.id).forEach(a => {
        warnings.push(`${emp.firstName} ${emp.lastName} is already assigned to Truck ${a.truckNumber} (${a.unitType}, ${a.startTime}) as ${a.role}.`);
      });
    });
    return warnings;
  }, [unitForm, employees, board.units, editingUnitId]);

  const buildUnitPayload = () => ({
    shiftDate: unitForm.shiftDate,
    unitType: unitForm.unitType,
    truckNumber: unitForm.truckNumber.trim(),
    startTime: unitForm.startTime,
    endTime: unitForm.endTime || null,
    endDate: unitForm.endDate || null,
    shiftType: unitForm.shiftType || "day",
    crew: { ...unitForm.crew },
    patientOrder: unitForm.noPatient ? [] : unitForm.patientOrder,
    notes: "",
    createdAt: editingUnitId ? undefined : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const resetUnitForm = () => {
    setUnitForm({ ...initialUnitForm, shiftDate: date });
    setEditingUnitId(null);
    setShowUnitDrawer(false);
  };

  const handleShowCreateUnit = () => {
    setUnitForm({ ...initialUnitForm, shiftDate: date });
    setEditingUnitId(null);
    setShowUnitDrawer(true);
  };

  const handleShowCreateNightUnit = () => {
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);
    setUnitForm({ ...initialUnitForm, shiftDate: date, shiftType: "night", endDate: nextDay.toISOString().slice(0, 10) });
    setEditingUnitId(null);
    setShowUnitDrawer(true);
  };

  const handleEditUnit = (unit) => {
    setEditingUnitId(unit.id);
    setUnitForm({
      shiftDate: unit.shiftDate || date,
      unitType: unit.unitType || "BLS",
      truckNumber: unit.truckNumber || "",
      startTime: unit.startTime || "",
      endTime: unit.endTime || "",
      endDate: unit.endDate || "",
      shiftType: unit.shiftType || "day",
      crew: { driver: unit.crew?.driver || "", medical: unit.crew?.medical || "", assist1: unit.crew?.assist1 || "", assist2: unit.crew?.assist2 || "" },
      patientOrder: Array.isArray(unit.patientOrder) ? unit.patientOrder : [],
      noPatient: !(unit.patientOrder && unit.patientOrder.length > 0),
    });
    setShowUnitDrawer(true);
  };

  const handleSaveUnit = async (e) => {
    e.preventDefault();
    if (unitValidationErrors.length > 0) return;
    setCrewSaving(true);
    try {
      const payload = buildUnitPayload();
      if (editingUnitId) { await updateCrewUnit(editingUnitId, payload); toast.success("Unit updated"); }
      else { await createCrewUnit(payload); toast.success("Unit created"); }
      resetUnitForm();
      await loadBoard(date);
    } catch (err) {
      toast.error("Save failed", err.message);
    } finally {
      setCrewSaving(false);
    }
  };

  const handleDeleteUnit = async (unitId) => {
    const confirmed = await confirm({ title: "Delete planned unit?", message: "This will remove the unit and its crew assignment.", variant: "danger", confirmLabel: "Delete" });
    if (!confirmed) return;
    setCrewSaving(true);
    try {
      await deleteCrewUnit(unitId);
      if (String(editingUnitId) === String(unitId)) resetUnitForm();
      toast.success("Unit deleted");
      await loadBoard(date);
    } catch (err) {
      toast.error("Delete failed", err.message);
    } finally {
      setCrewSaving(false);
    }
  };

  const handleMakeNight = (unit) => {
    const hasExisting = board.units.some(u => u.shiftType === "night");
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);
    setNightForm({ startTime: unit.startTime || "", endTime: "", endDate: nextDay.toISOString().slice(0, 10) });
    setNightDialog({ sourceUnit: unit, hasExisting });
  };

  const handleConfirmNight = async (replace) => {
    if (!nightDialog) return;
    setCrewSaving(true);
    try {
      await makeNightCrew(nightDialog.sourceUnit.id, { replace, startTime: nightForm.startTime, endTime: nightForm.endTime || null, endDate: nightForm.endDate || null });
      setNightDialog(null);
      toast.success("Night crew created");
      await loadBoard(date);
    } catch (err) {
      toast.error("Night crew failed", err.message);
    } finally {
      setCrewSaving(false);
    }
  };

  const renderCrewSelect = (role, label) => {
    const available = getAvailableEmployeesForRole(role);
    const required = (role === "driver") || (role === "medical" && (unitForm.unitType === "BLS" || unitForm.unitType === "ALS"));
    return (
      <div className="col-md-6">
        <label className="form-label fw-semibold">
          {label}
          {required && <span className="badge text-bg-danger ms-2" style={{ fontSize: 10 }}>Required</span>}
        </label>
        <select className="form-select" value={unitForm.crew[role]} onChange={e => setUnitForm(p => ({ ...p, crew: { ...p.crew, [role]: e.target.value } }))} disabled={crewSaving}>
          <option value="">Select employee...</option>
          {available.map(emp => {
            const assigned = getEmployeeAssignmentsInOtherUnits(emp.id).length > 0;
            return <option key={emp.id} value={emp.id}>{`${emp.firstName} ${emp.lastName} — ${getEmployeeRoleLabel(emp.role)}${assigned ? " [ALREADY ASSIGNED]" : ""}`}</option>;
          })}
        </select>
      </div>
    );
  };

  // ── Derived data ───────────────────────────────────────────────────────

  const expandedCalls = expandAndSort(board.openCalls);
  const emergencyCalls = expandedCalls.filter(isEmergencyCall);
  const scheduledCalls = expandedCalls.filter((c) => !isEmergencyCall(c));

  // Calls to show in left column based on filter
  const visibleCalls = (() => {
    switch (callFilter) {
      case "completed": return board.completedCalls || [];
      case "cancelled": return board.cancelledCalls || [];
      case "all":       return [
        ...expandedCalls,
        ...(board.completedCalls || []),
        ...(board.cancelledCalls || []),
      ].sort((a, b) => (a.pickup_time || "").localeCompare(b.pickup_time || ""));
      default:          return null; // "open" uses existing emergency/scheduled split
    }
  })();

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="dispatch-board" style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--ems-board-bg)" }}>
      <WarningModal
        warning={warning}
        onConfirm={handleWarningConfirm}
        onCancel={() => { setWarning(null); setPendingAssign(null); }}
      />
      {callModal && (
        <CallDetailModal
          call={callModal.call}
          isCompleted={callModal.isCompleted}
          onClose={() => setCallModal(null)}
          onUnassign={handleUnassign}
          onComplete={handleComplete}
          onReopen={handleReopen}
          onCancel={handleCancelCall}
          onUncancel={handleUncancelCall}
          onEdit={(call) => setCallDrawer({ open: true, call })}
          onTimestampsUpdated={() => loadBoard(date)}
        />
      )}

      {/* Header */}
      <div className="d-flex align-items-center gap-2 px-3 py-2 flex-wrap" style={{ background: "var(--ems-board-bg-header)", borderBottom: "1px solid #2a3347", flexShrink: 0 }}>
        <h5 className="mb-0 fw-bold" style={{ color: "var(--ems-board-text)", fontSize: 16 }}>Dispatch Board</h5>
        <input
          type="date"
          className="form-control form-control-sm"
          style={{ width: 150, background: "var(--ems-board-bg-input)", color: "var(--ems-board-text)", border: "1px solid var(--ems-board-border)" }}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <button className="btn btn-sm btn-outline-secondary" onClick={() => loadBoard(date)} disabled={loading} style={{ fontSize: 12 }}>
          {loading ? "Loading…" : "Refresh"}
        </button>
        <div style={{ width: 1, height: 20, background: "#2a3347", margin: "0 4px" }} />
        <button
          className="btn btn-sm btn-primary d-inline-flex align-items-center gap-1"
          style={{ fontSize: 12 }}
          onClick={handleShowCreateUnit}
          disabled={employeesLoading || crewSaving}
        >
          <FaSun style={{ fontSize: 10 }} /><FaPlus style={{ fontSize: 9 }} /> Day Unit
        </button>
        <button
          className="btn btn-sm d-inline-flex align-items-center gap-1"
          style={{ fontSize: 12, color: "#6ea8fe", border: "1px solid #6ea8fe44", background: "transparent" }}
          onClick={handleShowCreateNightUnit}
          disabled={employeesLoading || crewSaving}
        >
          <FaMoon style={{ fontSize: 10 }} /><FaPlus style={{ fontSize: 9 }} /> Night Unit
        </button>
        {error && <span className="text-danger small">{error}</span>}
        <span className="ms-auto text-muted small d-none d-lg-inline d-flex align-items-center gap-2">
          {expandedCalls.length} open · {board.units.length} units ·{" "}
          <span style={{ color: "#6ea8fe" }}>click → inspect · dbl-click → status</span>
          {(leftWidth !== 280 || bottomHeight !== 300) && (
            <button
              type="button"
              onClick={() => {
                setLeftWidth(280); leftWidthRef.current = 280;
                setBottomHeight(300); bottomHeightRef.current = 300;
                updateSettingsRef.current?.({ ui: { panels: { dispatch: { leftWidth: 280, bottomHeight: 300 } } } });
              }}
              style={{ fontSize: 10, padding: "1px 7px", background: "transparent", border: "1px solid #475569", borderRadius: 5, color: "#94a3b8", cursor: "pointer", lineHeight: 1.6 }}
              title="Reset panel sizes to default"
            >
              ⊞ Reset layout
            </button>
          )}
        </span>
      </div>

      {/* Main columns */}
      <div className="d-flex" style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>

        {/* Left: Calls column */}
        <div style={{
          width: leftWidth,
          minWidth: 200,
          flexShrink: 0,
          background: "var(--ems-board-bg-left)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          borderRight: "1px solid #1e2a3a",
        }}>
          {/* Column header */}
          <div style={{ padding: "10px 10px 0", flexShrink: 0 }}>
            {/* New Call button */}
            <button
              className="btn btn-sm btn-primary w-100 d-flex align-items-center justify-content-center gap-1 mb-2"
              style={{ fontSize: 12, fontWeight: 700 }}
              onClick={() => setCallDrawer({ open: true, call: null })}
            >
              <FaPlus style={{ fontSize: 10 }} /> New Call
            </button>

            {/* Calls / Staff toggle */}
            <div style={{ display: "flex", gap: 3, marginBottom: 8, background: "var(--ems-board-bg)", borderRadius: 8, padding: 3 }}>
              {[
                { key: "calls", label: "Calls", count: expandedCalls.length },
                { key: "staff", label: "Staff", count: unassignedStaff.length, warn: unassignedStaff.length > 0 },
              ].map(({ key, label, count, warn }) => (
                <button key={key} onClick={() => setLeftPanelTab(key)} style={{
                  flex: 1, padding: "4px 2px", fontSize: 11, fontWeight: 700, letterSpacing: 0.3,
                  border: "none", borderRadius: 6, cursor: "pointer",
                  background: leftPanelTab === key ? "var(--ems-board-bg-badge)" : "transparent",
                  color: leftPanelTab === key ? "var(--ems-board-text)" : "var(--ems-board-tab-inactive)",
                  transition: "all 0.15s",
                }}>
                  {label}
                  <span style={{ marginLeft: 4, background: warn && leftPanelTab !== key ? "#f59e0b22" : "transparent", color: warn ? "#f59e0b" : "#475569", borderRadius: 8, padding: "0 5px", fontSize: 9 }}>{count}</span>
                </button>
              ))}
            </div>

            {/* Call filter tabs — only show on calls tab */}
            {leftPanelTab === "calls" && <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
              {[
                { key: "open",      label: "Open",      count: expandedCalls.length,              color: "#6ea8fe" },
                { key: "completed", label: "Done",       count: (board.completedCalls||[]).length, color: "#75b798" },
                { key: "cancelled", label: "Cancelled",  count: (board.cancelledCalls||[]).length, color: "#ea868f" },
                { key: "all",       label: "All",        count: expandedCalls.length + (board.completedCalls||[]).length + (board.cancelledCalls||[]).length, color: "#94a3b8" },
              ].map(({ key, label, count, color }) => (
                <button
                  key={key}
                  onClick={() => setCallFilter(key)}
                  style={{
                    flex: 1,
                    padding: "4px 2px",
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: 0.3,
                    border: "none",
                    borderRadius: 6,
                    cursor: "pointer",
                    background: callFilter === key ? `${color}22` : "transparent",
                    color: callFilter === key ? color : "var(--ems-board-tab-inactive)",
                    borderBottom: callFilter === key ? `2px solid ${color}` : "2px solid transparent",
                    transition: "all 0.15s",
                  }}
                >
                  {label}
                  <span style={{
                    marginLeft: 4,
                    background: callFilter === key ? `${color}33` : "var(--ems-board-bg-badge)",
                    color: callFilter === key ? color : "#475569",
                    borderRadius: 8, padding: "0 5px", fontSize: 9,
                  }}>
                    {count}
                  </span>
                </button>
              ))}
            </div>}
          </div>

          {/* Staff tab */}
          {leftPanelTab === "staff" && (
            <div style={{ flex: 1, overflowY: "auto", padding: "4px 8px 8px" }}>
              {employeesLoading ? (
                <div style={{ padding: 20, textAlign: "center", color: "var(--ems-board-tab-inactive)", fontSize: 12 }}>Loading staff…</div>
              ) : unassignedStaff.length === 0 ? (
                <div style={{ padding: 20, textAlign: "center", color: "var(--ems-board-tab-inactive)", fontSize: 12 }}>
                  <div style={{ fontSize: 20, marginBottom: 6 }}>✓</div>
                  All staff assigned
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "var(--ems-board-tab-inactive)", letterSpacing: 1, padding: "4px 4px 8px", borderBottom: "1px solid var(--ems-board-border)", marginBottom: 6 }}>
                    UNASSIGNED STAFF — {unassignedStaff.length}
                  </div>
                  {unassignedStaff.map(emp => (
                    <div key={emp.id} style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", marginBottom: 4,
                      borderRadius: 7, background: "var(--ems-board-bg-card)", border: "1px solid var(--ems-board-border)",
                    }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                        background: "var(--ems-board-bg-badge)", display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 11, fontWeight: 700, color: "var(--ems-board-text)",
                      }}>
                        {emp.firstName?.[0]}{emp.lastName?.[0]}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ems-board-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {emp.firstName} {emp.lastName}
                        </div>
                        <div style={{ fontSize: 10, color: "var(--ems-board-tab-inactive)" }}>
                          {getEmployeeRoleLabel(emp.role)}
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {/* Call list */}
          {leftPanelTab === "calls" && <div style={{ flex: 1, overflowY: "auto", padding: "4px 8px 8px" }}>
            {/* Open calls — split emergency / scheduled */}
            {callFilter === "open" && (
              <>
                {emergencyCalls.length > 0 && (
                  <div className="mb-2">
                    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 4px 6px", borderBottom: "1px solid rgba(220,53,69,0.2)", marginBottom: 4 }}>
                      <span style={{ width: 3, height: 12, background: "#dc3545", borderRadius: 2, display: "inline-block" }} />
                      <span style={{ fontSize: 10, fontWeight: 700, color: "#ea868f", letterSpacing: 1 }}>EMERGENCY</span>
                      <span style={{ fontSize: 9, background: "rgba(220,53,69,0.15)", color: "#ea868f", borderRadius: 8, padding: "0 6px", marginLeft: "auto" }}>{emergencyCalls.length}</span>
                    </div>
                    {emergencyCalls.map((call, i) => (
                      <CallCard key={`${call.id}-${call._slot}-${i}`} call={call} onDragStart={handleDragStart} onCardClick={handleCardClick} />
                    ))}
                  </div>
                )}
                {scheduledCalls.length > 0 && (
                  <div>
                    {emergencyCalls.length > 0 && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 4px 6px", borderBottom: "1px solid #1e2a3a", marginBottom: 4 }}>
                        <span style={{ width: 3, height: 12, background: "#475569", borderRadius: 2, display: "inline-block" }} />
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#475569", letterSpacing: 1 }}>SCHEDULED</span>
                        <span style={{ fontSize: 9, background: "var(--ems-board-bg-badge)", color: "#475569", borderRadius: 8, padding: "0 6px", marginLeft: "auto" }}>{scheduledCalls.length}</span>
                      </div>
                    )}
                    {scheduledCalls.map((call, i) => (
                      <CallCard key={`${call.id}-${call._slot}-${i}`} call={call} onDragStart={handleDragStart} onCardClick={handleCardClick} />
                    ))}
                  </div>
                )}
                {expandedCalls.length === 0 && !loading && (
                  <div style={{ textAlign: "center", padding: "32px 8px", color: "var(--ems-board-tab-inactive)" }}>
                    <div style={{ fontSize: 22, marginBottom: 6 }}>✓</div>
                    <div style={{ fontSize: 11 }}>No open calls for this date</div>
                  </div>
                )}
              </>
            )}

            {/* Completed / Cancelled / All */}
            {callFilter !== "open" && visibleCalls !== null && (
              <>
                {visibleCalls.length === 0 && !loading && (
                  <div style={{ textAlign: "center", padding: "32px 8px", color: "var(--ems-board-tab-inactive)" }}>
                    <div style={{ fontSize: 11 }}>No {callFilter} calls for this date</div>
                  </div>
                )}
                {visibleCalls.map((call, i) => (
                  <CallCard
                    key={`${call.id}-${i}`}
                    call={call}
                    onDragStart={callFilter === "all" && call.status === "new" ? handleDragStart : () => {}}
                    onCardClick={handleCardClick}
                    statusOverride={callFilter !== "open" ? call.status : null}
                  />
                ))}
              </>
            )}
          </div>}
        </div>

        {/* Drag divider */}
        <div
          onMouseDown={handleDividerMouseDown}
          style={{ width: 5, flexShrink: 0, background: "var(--ems-board-border)", cursor: "col-resize" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#6ea8fe55")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "var(--ems-board-border)")}
        />

        {/* Right: Units + panel */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--ems-board-bg)" }}>

          {/* Unit table */}
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", background: "var(--ems-board-bg)" }}>
            <table className="table table-hover mb-0 dispatch-board-table" style={{ fontSize: 13 }}>
              <thead style={{ position: "sticky", top: 0, background: "var(--ems-board-bg-header)", zIndex: 1 }}>
                <tr>
                  <th style={{ width: 80, color: "var(--ems-board-text)", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>Unit</th>
                  <th style={{ width: 110, color: "var(--ems-board-text)", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>Type</th>
                  <th style={{ width: 200, color: "var(--ems-board-text)", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>Status</th>
                  <th style={{ width: 200, color: "var(--ems-board-text)", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>Crew</th>
                  <th style={{ color: "var(--ems-board-text)", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>Assigned Calls</th>
                  <th style={{ width: 110 }}></th>
                </tr>
              </thead>
              <tbody style={{ background: "var(--ems-board-bg)" }}>
                {board.units.map((unit) => {
                  const isSelected = selectedUnit?.id === unit.id;
                  const isDragOver = dragOverUnitId === unit.id;
//                   const sc = STATUS_COLORS[unit.dispatchStatus] || "#adb5bd";
                  return (
                    <React.Fragment key={unit.id}>
                    <tr
                      key={`unit-${unit.id}`}
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
                          : "var(--ems-board-bg)",
                        borderLeft: isSelected ? `3px solid #6ea8fe` : "3px solid transparent",
                        outline: isDragOver ? "1px dashed #ffc107" : undefined,
                      }}
                    >
                      <td className="fw-bold align-middle" style={{ color: "var(--ems-board-text)", fontSize: 15 }}>{unit.truckNumber}</td>
                      <td className="align-middle"><UnitTypeBadge unitType={unit.unitType} /></td>
                      <td className="align-middle">
                        <span className={isUnitStuck(unit) ? "ems-overdue-card" : ""} style={{ display: "inline-flex", borderRadius: 20 }}>
                          <StatusPill status={unit.dispatchStatus} />
                        </span>
                        {isUnitStuck(unit) && (
                          <span className="ems-overdue-text" style={{ fontSize: 9, marginLeft: 4, display: "inline-block" }}>
                            {Math.round(getUnitStuckMinutes(unit))}m
                          </span>
                        )}
                      </td>
                      <td className="align-middle">
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span className={`badge ${(unit.crewCount || 0) < minCrewForType(unit.unitType) ? "bg-danger" : "bg-secondary"}`} style={{ fontSize: 10 }}>
                            {unit.crewCount || 0}
                          </span>
                          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                            {unit.crewNames?.driver && (
                              <span style={{ fontSize: 11, color: "var(--ems-board-text)", lineHeight: 1.3 }}>
                                <span style={{ fontSize: 10, color: "var(--ems-text-muted)", marginRight: 3 }}>DRV</span>
                                {unit.crewNames.driver}
                              </span>
                            )}
                            {unit.crewNames?.medical && (
                              <span style={{ fontSize: 11, color: "var(--ems-board-text)", lineHeight: 1.3 }}>
                                <span style={{ fontSize: 10, color: "var(--ems-text-muted)", marginRight: 3 }}>MED</span>
                                {unit.crewNames.medical}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="align-middle">
                        <div className="d-flex flex-wrap gap-1 align-items-center">
                          {(unit.assignedCalls || []).map((c) => (
                            <span
                              key={c.id}
                              className="badge"
                              style={{
                                background: isEmergencyCall(c) ? "rgba(220,53,69,0.15)" : "var(--ems-board-bg-badge)",
                                color: isEmergencyCall(c) ? "#dc2626" : "var(--ems-board-text)",
                                fontSize: 11,
                                fontWeight: 600,
                                border: `1px solid ${isEmergencyCall(c) ? "#dc354588" : "var(--ems-board-border)"}`,
                              }}
                            >
                              {c.patient_name || `#${c.id}`}
                              {hasReturnRide(c) && (
                                <span style={{ color: "#6ea8fe", marginLeft: 4 }}>+R</span>
                              )}
                            </span>
                          ))}
                          {(unit.completedCalls || []).map((c) => (
                            <span key={`done-${c.id}`} className="badge" style={{ background: "var(--ems-board-bg-input)", color: "var(--ems-board-text-muted)", fontSize: 11, textDecoration: "line-through" }}>
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
                      <td className="align-middle" onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "nowrap" }}>
                          {unit.dispatchStatus !== "out_of_service" && (
                            <button
                              className="btn btn-sm"
                              style={{
                                fontSize: 11, padding: "3px 8px",
                                background: STATUS_BG[STATUS_NEXT[unit.dispatchStatus]] || "transparent",
                                border: `1px solid ${STATUS_COLORS[STATUS_NEXT[unit.dispatchStatus]] || "#49505788"}`,
                                color: STATUS_COLORS[STATUS_NEXT[unit.dispatchStatus]] || "var(--ems-board-text-muted)",
                                fontWeight: 600, whiteSpace: "nowrap",
                              }}
                              onClick={() => handleUnitDoubleClick(unit)}
                              title="Advance to next status"
                            >
                              {unit.dispatchStatus === "at_destination" ? "✓ Complete" : `→ ${STATUS_LABELS[STATUS_NEXT[unit.dispatchStatus]] || ""}`}
                            </button>
                          )}
                          <button
                            className="btn btn-sm"
                            style={{ fontSize: 11, padding: "3px 7px", background: "transparent", border: "1px solid #2a3347", color: "var(--ems-board-text-muted)" }}
                            onClick={() => handleEditUnit(unit)}
                            title="Edit unit"
                          >
                            <FaEdit style={{ fontSize: 10 }} />
                          </button>
                          <button
                            className="btn btn-sm"
                            style={{ fontSize: 11, padding: "3px 7px", background: "transparent", border: "1px solid #dc354533", color: "#ea868f" }}
                            onClick={() => handleDeleteUnit(unit.id)}
                            title="Delete unit"
                          >
                            <FaTrash style={{ fontSize: 10 }} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {/* Patient queue sub-row — sorted by priority, with overdue pulse */}
                    {(() => {
                      const allCalls = sortCallsByPriority(unit.assignedCalls || [], unit.callPriority || []);
                      if (allCalls.length === 0) return null;
                      return (
                        <tr style={{ background: isSelected ? "rgba(13,110,253,0.06)" : "var(--ems-board-bg)", borderLeft: isSelected ? "3px solid #6ea8fe" : "3px solid transparent" }}>
                          <td colSpan={6} style={{ paddingTop: 0, paddingBottom: 6, paddingLeft: 16 }}>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                              <span style={{ fontSize: 10, fontWeight: 700, color: "var(--ems-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginRight: 2 }}>Patients:</span>
                              {allCalls.map((c, idx) => {
                                const overdue = isCallOverdue(c, unit.dispatchStatus);
                                return (
                                  <span key={c.id} className={overdue ? "ems-overdue-card" : ""} style={{
                                    fontSize: 11, fontWeight: 600, padding: "1px 8px", borderRadius: 6,
                                    background: overdue ? "rgba(220,53,69,0.1)" : "var(--ems-board-bg-badge)",
                                    color: overdue ? "#dc3545" : "var(--ems-board-text)",
                                    border: `1px solid ${overdue ? "#dc354555" : "var(--ems-board-border)"}`,
                                    display: "flex", alignItems: "center", gap: 4,
                                  }}>
                                    <span style={{ fontSize: 10, fontWeight: 700, color: overdue ? "#dc3545" : "var(--ems-text-muted)" }}>{idx + 1}.</span>
                                    {c.patient_name || `Call #${c.id}`}
                                    {c.pickup_time && <span className={overdue ? "ems-overdue-text" : ""} style={{ fontSize: 10, color: overdue ? "#dc3545" : "var(--ems-text-muted)", marginLeft: 2 }}>{c.pickup_time}</span>}
                                  </span>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      );
                    })()}
                    </React.Fragment>
                  );
                })}
                {board.units.length === 0 && !loading && (
                  <tr style={{ background: "var(--ems-board-bg)" }}>
                    <td colSpan={5} className="text-center text-muted py-5" style={{ background: "var(--ems-board-bg)" }}>
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
              style={{ height: 5, flexShrink: 0, background: "var(--ems-board-border)", cursor: "row-resize" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#6ea8fe55")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "var(--ems-board-border)")}
            />
          )}

          {/* Selected unit bottom panel */}
          {selectedUnit && (
            <div style={{ background: "var(--ems-board-bg-header)", height: bottomHeight, overflowY: "auto", flexShrink: 0 }}>
              {/* Unit header */}
              <div className="px-3 py-2 d-flex align-items-center gap-3 flex-wrap" style={{ borderBottom: "1px solid var(--ems-board-border)" }}>
                <span className="fw-bold" style={{ color: "var(--ems-board-text)" }}>Unit {selectedUnit.truckNumber}</span>
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
              <div className="px-3 py-2 d-flex flex-wrap gap-2" style={{ borderBottom: "1px solid var(--ems-board-border)" }}>
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
                        background: active ? STATUS_BG[s] : "transparent",
                        color: active ? c : "var(--ems-board-text-muted)",
                        border: `1px solid ${active ? c + "88" : "var(--ems-board-border)"}`,
                        fontWeight: active ? 700 : 400,
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
                {(() => {
                  const sorted = sortCallsByPriority(selectedUnit.assignedCalls || [], selectedUnit.callPriority || []);
                  const manualOrder = (selectedUnit.callPriority || []).length > 0;
                  return (
                    <>
                      {manualOrder && (
                        <div className="d-flex align-items-center justify-content-between mb-2" style={{ fontSize: 11, color: "#ffc107" }}>
                          <span>⚡ Manual priority active</span>
                          <button
                            className="btn btn-sm"
                            style={{ fontSize: 10, padding: "1px 8px", color: "var(--ems-board-text-muted)", background: "transparent", border: "1px solid #2a3347" }}
                            onClick={() => handleResetPriority(selectedUnit)}
                          >Reset to time order</button>
                        </div>
                      )}
                      {sorted.map((call, idx) => (
                        <AssignedCallCard
                          key={call.id}
                          call={call}
                          unitStatus={selectedUnit.dispatchStatus}
                          isCurrent={idx === 0}
                          onUnassign={handleUnassign}
                          onComplete={handleComplete}
                          onCardClick={handleCardClick}
                          onSetPickupTime={handleSetWillCallTime}
                          isFirst={idx === 0}
                          isLast={idx === sorted.length - 1}
                          isOverdue={isCallOverdue(call, selectedUnit.dispatchStatus)}
                          hasPriorityControls={sorted.length > 1}
                          onSetHighPriority={(callId) => handleSetHighPriority(selectedUnit, callId)}
                          onMoveUp={(callId) => handleMoveCall(selectedUnit, callId, "up")}
                          onMoveDown={(callId) => handleMoveCall(selectedUnit, callId, "down")}
                        />
                      ))}
                    </>
                  );
                })()}
                {(selectedUnit.completedCalls || []).length > 0 && (
                  <>
                    <div className="text-muted small mb-2 mt-1" style={{ borderTop: "1px solid var(--ems-board-border)", paddingTop: 8 }}>
                      Completed
                    </div>
                    {(selectedUnit.completedCalls || []).map((call) => (
                      <CompletedCallCard key={call.id} call={call} onCardClick={handleCardClick} />
                    ))}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Call Create/Edit Drawer */}
      <CallDrawer
        open={callDrawer.open}
        callToEdit={callDrawer.call}
        defaultTripDate={date}
        onClose={() => setCallDrawer({ open: false, call: null })}
        onSaved={() => { setCallDrawer({ open: false, call: null }); loadBoard(date); }}
      />

      {/* Unit Create/Edit Drawer */}
      <EntityDrawer
        open={showUnitDrawer}
        onClose={resetUnitForm}
        title={editingUnitId ? "Edit Unit" : "Create Unit"}
        subtitle="Truck info, crew members, and patient order"
        footer={
          <>
            <button type="button" className="btn btn-outline-secondary" onClick={resetUnitForm} disabled={crewSaving}>Cancel</button>
            <button type="submit" form="board-crew-form" className="btn btn-primary d-inline-flex align-items-center gap-2" disabled={crewSaving || employeesLoading}>
              <FaPlus style={{ fontSize: 11 }} />
              {crewSaving ? "Saving..." : editingUnitId ? "Update Unit" : "Create Unit"}
            </button>
          </>
        }
      >
        <form id="board-crew-form" onSubmit={handleSaveUnit}>
          {unitValidationErrors.length > 0 && (
            <div className="alert alert-danger mb-3">
              <ul className="mb-0">{unitValidationErrors.map((m, i) => <li key={i}>{m}</li>)}</ul>
            </div>
          )}
          {unitWarningMessages.length > 0 && (
            <div className="alert alert-warning mb-3">
              <ul className="mb-0">{unitWarningMessages.map((m, i) => <li key={i}>{m}</li>)}</ul>
            </div>
          )}
          <div className="row g-3">
            {/* Shift Date */}
            <div className="col-md-6">
              <label className="form-label fw-semibold">Shift Date</label>
              <input type="date" className="form-control" value={unitForm.shiftDate} onChange={e => setUnitForm(p => ({ ...p, shiftDate: e.target.value }))} disabled={crewSaving} />
            </div>
            {/* Unit Type */}
            <div className="col-md-6">
              <label className="form-label fw-semibold">Unit Type</label>
              <select className="form-select" value={unitForm.unitType} onChange={e => setUnitForm(p => ({ ...p, unitType: e.target.value }))} disabled={crewSaving}>
                {UNIT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            {/* Truck Number */}
            <div className="col-md-6">
              <label className="form-label fw-semibold">Truck Number <span className="badge text-bg-danger ms-1" style={{ fontSize: 10 }}>Required</span></label>
              <input type="text" className="form-control" value={unitForm.truckNumber} onChange={e => setUnitForm(p => ({ ...p, truckNumber: e.target.value }))} disabled={crewSaving} />
            </div>
            {/* Shift Type */}
            <div className="col-md-6">
              <label className="form-label fw-semibold">Shift Type</label>
              <div className="d-flex gap-2">
                {["day", "night"].map(t => (
                  <button key={t} type="button"
                    className={`btn btn-sm flex-fill ${unitForm.shiftType === t ? (t === "night" ? "btn-secondary" : "btn-warning") : "btn-outline-secondary"}`}
                    style={unitForm.shiftType === t && t === "night" ? { background: "#1a2a4a", color: "#6ea8fe", borderColor: "#6ea8fe" } : undefined}
                    onClick={() => setUnitForm(p => ({ ...p, shiftType: t }))}
                  >
                    {t === "day" ? <><FaSun style={{ marginRight: 4 }} />Day</> : <><FaMoon style={{ marginRight: 4 }} />Night</>}
                  </button>
                ))}
              </div>
            </div>
            {/* Start Time */}
            <div className="col-md-6">
              <label className="form-label fw-semibold">Start Time <span className="badge text-bg-danger ms-1" style={{ fontSize: 10 }}>Required</span></label>
              <TimeInput showFormatToggle value={unitForm.startTime} onChange={v => setUnitForm(p => ({ ...p, startTime: v }))} disabled={crewSaving} />
            </div>
            {/* End Time */}
            <div className="col-md-6">
              <label className="form-label fw-semibold">End Time <span className="text-muted fw-normal">(optional)</span></label>
              <TimeInput value={unitForm.endTime} onChange={v => setUnitForm(p => ({ ...p, endTime: v }))} disabled={crewSaving} />
            </div>
            {/* End Date */}
            <div className="col-md-6">
              <label className="form-label fw-semibold">End Date <span className="text-muted fw-normal">(if next day)</span></label>
              <input type="date" className="form-control" value={unitForm.endDate} onChange={e => setUnitForm(p => ({ ...p, endDate: e.target.value }))} disabled={crewSaving} />
            </div>
            {/* Crew */}
            <div className="col-12"><hr /><h5 className="mb-0">Crew</h5></div>
            {renderCrewSelect("driver", "Driver")}
            {isMedicalSlotVisible(unitForm.unitType) && renderCrewSelect("medical", unitForm.unitType === "ALS" ? "Paramedic" : "EMT")}
            {renderCrewSelect("assist1", "Assist 1 (optional)")}
            {renderCrewSelect("assist2", "Assist 2 (optional)")}
            {/* Patient Order */}
            <PatientOrderSection
              patientOrder={unitForm.patientOrder}
              noPatient={unitForm.noPatient}
              openCalls={crewOpenCalls}
              onPatientOrderChange={newOrder => setUnitForm(p => ({ ...p, patientOrder: newOrder }))}
              onNoPatientChange={val => setUnitForm(p => ({ ...p, noPatient: val }))}
              disabled={crewSaving}
            />
          </div>
        </form>
      </EntityDrawer>

      {/* Make Night Dialog */}
      {nightDialog && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1070, background: "rgba(15,23,42,0.65)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "var(--ems-bg-surface, #1e2a3a)", border: "1px solid var(--ems-border, #2a3347)", borderRadius: 16, padding: "1.75rem", width: "100%", maxWidth: 440, boxShadow: "0 8px 32px rgba(0,0,0,0.2)", color: "var(--ems-text-primary, #e2e8f0)" }}>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
              <FaMoon style={{ color: "#6ea8fe" }} /> Make Night Crew
            </div>
            <p style={{ color: "#64748b", fontSize: 14, marginBottom: 16 }}>
              Copying crew from Truck <strong>{nightDialog.sourceUnit.truckNumber}</strong> to a night shift.
              {nightDialog.hasExisting && <span style={{ color: "#f59e0b" }}> A night crew already exists for this date.</span>}
            </p>
            <div className="row g-2 mb-3">
              <div className="col-6">
                <label className="form-label" style={{ fontSize: 12 }}>Night Start Time</label>
                <TimeInput showFormatToggle value={nightForm.startTime} onChange={v => setNightForm(f => ({ ...f, startTime: v }))} />
              </div>
              <div className="col-6">
                <label className="form-label" style={{ fontSize: 12 }}>End Time</label>
                <TimeInput value={nightForm.endTime} onChange={v => setNightForm(f => ({ ...f, endTime: v }))} />
              </div>
              <div className="col-12">
                <label className="form-label" style={{ fontSize: 12 }}>End Date (next day)</label>
                <input type="date" className="form-control form-control-sm" value={nightForm.endDate} onChange={e => setNightForm(f => ({ ...f, endDate: e.target.value }))} />
              </div>
            </div>
            {nightDialog.hasExisting ? (
              <div className="d-flex gap-2 flex-wrap">
                <button className="btn btn-sm btn-danger flex-fill" onClick={() => handleConfirmNight(true)} disabled={crewSaving}>Replace existing night crew</button>
                <button className="btn btn-sm btn-outline-primary flex-fill" onClick={() => handleConfirmNight(false)} disabled={crewSaving}>Keep both</button>
                <button className="btn btn-sm btn-outline-secondary w-100 mt-1" onClick={() => setNightDialog(null)}>Cancel</button>
              </div>
            ) : (
              <div className="d-flex gap-2">
                <button className="btn btn-sm btn-primary flex-fill" onClick={() => handleConfirmNight(false)} disabled={crewSaving}>Create Night Crew</button>
                <button className="btn btn-sm btn-outline-secondary" onClick={() => setNightDialog(null)}>Cancel</button>
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        .badge-als { background: rgba(13,110,253,0.2); color: #6ea8fe; border: 1px solid #6ea8fe44; }
        .badge-bls { background: rgba(25,135,84,0.2); color: #75b798; border: 1px solid #75b79844; }
        .dispatch-board-table { color: var(--ems-board-text); background: var(--ems-board-bg); border-color: var(--ems-board-border); }
        .dispatch-board-table td, .dispatch-board-table th { background: var(--ems-board-bg) !important; color: inherit; border-color: var(--ems-board-border) !important; }
        .dispatch-board-table tr:hover td { background: rgba(13,110,253,0.05) !important; }
        .dispatch-board-table thead th { background: var(--ems-board-bg-header) !important; color: var(--ems-board-text-muted) !important; }
      `}</style>
    </div>
  );
}
