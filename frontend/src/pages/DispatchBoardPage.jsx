import React, { useState, useEffect, useCallback, useMemo } from "react";
import API_BASE from "../api/config.js";
import { useToast } from "../components/ui/useToast";
import { useConfirm } from "../components/ui/useConfirm";
import {
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
} from "../api/dispatchApi";
import { cancelCall, uncancelCall, getCalls } from "../api/callsApi";
import { getCurrentUser } from "../api/authApi";
import { getEmployees } from "../api/employeesApi";
import { createCrewUnit, updateCrewUnit, deleteCrewUnit, makeNightCrew } from "../api/crewApi";
import EntityDrawer from "../components/ui/EntityDrawer";
import TimeInput from "../components/ui/TimeInput";
import PatientOrderSection from "../components/crew/PatientOrderSection";
import { getEmployeeRoleLabel } from "../utils/employeeRoleUtils";
import CallDrawer from "../components/dispatch/CallDrawer";
import StatusPill from "../components/dispatch/StatusPill";
import UnitTypeBadge from "../components/dispatch/UnitTypeBadge";
import AssignedCallCard from "../components/dispatch/AssignedCallCard";
import CompletedCallCard from "../components/dispatch/CompletedCallCard";
import CallDetailModal from "../components/dispatch/CallDetailModal";
import WarningModal from "../components/dispatch/WarningModal";
import BoardToolbar from "../components/dispatch/BoardToolbar";
import OpenCallsPanel from "../components/dispatch/OpenCallsPanel";
import { useUserSettings } from "../context/useUserSettings";
import { formatTimeForDisplay } from "../utils/timeUtils";
import { isEmployeeEligibleForRole } from "../utils/licenseUtils";
import {
  STATUS_NEXT,
  STATUS_LABELS,
  STATUS_COLORS,
  STATUS_BG,
  SHIFT_SEVERITY_STYLE,
  todayStr,
  isAlsUnit,
  isAlsCall,
  isEmergencyCall,
  hasReturnRide,
  timeToMinutes,
  expandAndSort,
  getShiftAlertSeverity,
  minCrewForType,
} from "../utils/dispatchBoardUtils";
import { usePanelResize, DEFAULT_LEFT_WIDTH, DEFAULT_BOTTOM_HEIGHT } from "../hooks/usePanelResize";
import { useOverdueDetection } from "../hooks/useOverdueDetection";
import { useCallPriority } from "../hooks/useCallPriority";
import { useUnitFormValidation } from "../hooks/useUnitFormValidation";

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
  shiftDurationHours: "",
  shiftStatus: "scheduled",
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
  const timeFormat = userSettings.ui?.time_format || "12h";
  const { getUnitStuckMinutes, isCallOverdue, isUnitStuck } = useOverdueDetection(dispatchThresholds);

  // Left panel tab: "calls" | "staff"
  const [leftPanelTab, setLeftPanelTab] = useState("calls");

  // Crew planner state (embedded)
  const [employees, setEmployees] = useState([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [crewOpenCalls, setCrewOpenCalls] = useState([]);
  const [unitForm, setUnitForm] = useState({ ...initialUnitForm });
  const [editingUnitId, setEditingUnitId] = useState(null);
  const [showUnitDrawer, setShowUnitDrawer] = useState(false);
  // Whether the user has tried to save the unit form yet. Validation errors are
  // only surfaced after this, so a freshly opened blank form doesn't greet the
  // user with a wall of "required" errors before they've typed anything.
  const [hasAttemptedUnitSave, setHasAttemptedUnitSave] = useState(false);
  const [nightDialog, setNightDialog] = useState(null);
  const [nightForm, setNightForm] = useState({ startTime: "", endTime: "", endDate: "" });
  const [crewSaving, setCrewSaving] = useState(false);

  // Call drawer state
  const [callDrawer, setCallDrawer] = useState({ open: false, call: null }); // call=null → create mode

  const { leftWidth, bottomHeight, handleDividerMouseDown, handleRowDividerMouseDown, resetLayout } =
    usePanelResize({ settingsLoaded, userSettings, updateSettings });

  const currentUser = getCurrentUser();

  // Reads selectedUnit via the functional setSelectedUnit updater (not the
  // outer closure) so this callback has no reactive dependencies and stays
  // referentially stable — safe to list in any effect's dependency array
  // without triggering extra reloads whenever a unit is selected.
  const loadBoard = useCallback(async (d, silent = false) => {
    if (!silent) { setLoading(true); setError(null); }
    try {
      const data = await fetchBoard(d);
      setBoard(data);
      setSelectedUnit((prev) => (prev ? data.units.find((u) => u.id === prev.id) || null : prev));
    } catch (e) {
      if (!silent) setError(e.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { loadBoard(date); }, [date, loadBoard]);

  // Auto-refresh every 30 s when viewing today's board.
  useEffect(() => {
    if (date !== todayStr()) return;
    const interval = setInterval(() => loadBoard(date, true), 30_000);
    return () => clearInterval(interval);
  }, [date, loadBoard]);

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

  const { sortCallsByPriority, handleSetHighPriority, handleMoveCall, handleResetPriority } =
    useCallPriority({ loadBoard, date, toast });

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
  }, [toast]);

  useEffect(() => { loadEmployees(); }, [loadEmployees]);

  // When date changes, reload open calls for patient picker
  useEffect(() => {
    getCalls({ trip_date: date }, 1, 100)
      .then(d => setCrewOpenCalls(Array.isArray(d?.items) ? d.items : []))
      .catch(() => {});
  }, [date]);

  const getEmployeeById = useCallback((id) => employees.find(e => String(e.id) === String(id)), [employees]);

  const isMedicalSlotVisible = (t) => t === "ALS" || t === "BLS";

  const getSelectedEmployeeIds = (currentRole) =>
    Object.entries(unitForm.crew).filter(([r, id]) => r !== currentRole && id).map(([, id]) => String(id));

  const getAvailableEmployeesForRole = (role) => {
    const selected = getSelectedEmployeeIds(role);
    return employees.filter(emp => !selected.includes(String(emp.id)) && isEmployeeEligibleForRole(emp, role, unitForm.unitType));
  };

  const getEmployeeAssignmentsInOtherUnits = useCallback((empId) => {
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
  }, [board.units, editingUnitId, unitForm.shiftDate]);

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

  const { errors: unitValidationErrors, warnings: unitWarningMessages } =
    useUnitFormValidation({ unitForm, getEmployeeById, getEmployeeAssignmentsInOtherUnits });

  const buildUnitPayload = () => {
    const dur = parseFloat(unitForm.shiftDurationHours);
    return {
      shiftDate: unitForm.shiftDate,
      unitType: unitForm.unitType,
      truckNumber: unitForm.truckNumber.trim(),
      startTime: unitForm.startTime,
      endTime: unitForm.endTime || null,
      endDate: unitForm.endDate || null,
      shiftType: unitForm.shiftType || "day",
      shiftDurationHours: !isNaN(dur) && dur > 0 ? dur : null,
      shiftStatus: unitForm.shiftStatus || "scheduled",
      crew: { ...unitForm.crew },
      patientOrder: unitForm.noPatient ? [] : unitForm.patientOrder,
      notes: "",
      createdAt: editingUnitId ? undefined : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  };

  const resetUnitForm = () => {
    setUnitForm({ ...initialUnitForm, shiftDate: date });
    setEditingUnitId(null);
    setShowUnitDrawer(false);
    setHasAttemptedUnitSave(false);
  };

  const handleShowCreateUnit = () => {
    setUnitForm({ ...initialUnitForm, shiftDate: date });
    setEditingUnitId(null);
    setShowUnitDrawer(true);
    setHasAttemptedUnitSave(false);
  };

  const handleShowCreateNightUnit = () => {
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);
    setUnitForm({ ...initialUnitForm, shiftDate: date, shiftType: "night", endDate: nextDay.toISOString().slice(0, 10) });
    setEditingUnitId(null);
    setShowUnitDrawer(true);
    setHasAttemptedUnitSave(false);
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
    setHasAttemptedUnitSave(false);
  };

  const handleSaveUnit = async (e) => {
    e.preventDefault();
    if (unitValidationErrors.length > 0) {
      setHasAttemptedUnitSave(true);
      return;
    }
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
      <BoardToolbar
        date={date}
        onDateChange={setDate}
        loading={loading}
        onRefresh={() => loadBoard(date)}
        onCreateDayUnit={handleShowCreateUnit}
        onCreateNightUnit={handleShowCreateNightUnit}
        creatingDisabled={employeesLoading || crewSaving}
        error={error}
        openCallsCount={expandedCalls.length}
        unitsCount={board.units.length}
        showResetLayout={leftWidth !== DEFAULT_LEFT_WIDTH || bottomHeight !== DEFAULT_BOTTOM_HEIGHT}
        onResetLayout={resetLayout}
      />

      {/* Main columns */}
      <div className="d-flex" style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>

        {/* Left: Calls column */}
        <OpenCallsPanel
          leftWidth={leftWidth}
          onNewCall={() => setCallDrawer({ open: true, call: null })}
          leftPanelTab={leftPanelTab}
          onLeftPanelTabChange={setLeftPanelTab}
          callFilter={callFilter}
          onCallFilterChange={setCallFilter}
          emergencyCalls={emergencyCalls}
          scheduledCalls={scheduledCalls}
          expandedCalls={expandedCalls}
          visibleCalls={visibleCalls}
          completedCalls={board.completedCalls}
          cancelledCalls={board.cancelledCalls}
          unassignedStaff={unassignedStaff}
          employeesLoading={employeesLoading}
          loading={loading}
          onDragStart={handleDragStart}
          onCardClick={handleCardClick}
        />

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
                  <th style={{ width: 140, color: "var(--ems-board-text)", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>Shift</th>
                  <th style={{ color: "var(--ems-board-text)", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>Assigned Calls</th>
                  <th style={{ width: 110 }}></th>
                </tr>
              </thead>
              <tbody style={{ background: "var(--ems-board-bg)" }}>
                {board.units.map((unit) => {
                  const isSelected = selectedUnit?.id === unit.id;
                  const isDragOver = dragOverUnitId === unit.id;
                  const shiftSeverity = getShiftAlertSeverity(unit);
                  const shiftStyle = shiftSeverity ? SHIFT_SEVERITY_STYLE[shiftSeverity] : null;
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
                          : shiftStyle
                          ? shiftStyle.bg
                          : "var(--ems-board-bg)",
                        borderLeft: isSelected
                          ? "3px solid #6ea8fe"
                          : shiftStyle
                          ? `3px solid ${shiftStyle.border}`
                          : "3px solid transparent",
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
                        {unit.startTime ? (
                          <div style={{ fontSize: 11, lineHeight: 1.5, color: "var(--ems-board-text)" }}>
                            <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                              {formatTimeForDisplay(unit.startTime, timeFormat)}
                              {unit.plannedEndTime && (
                                <span style={{ color: "var(--ems-text-muted)", fontWeight: 400 }}> → {formatTimeForDisplay(unit.plannedEndTime, timeFormat)}</span>
                              )}
                              {shiftSeverity && (
                                <span style={{
                                  width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                                  background: shiftStyle.border,
                                  boxShadow: `0 0 4px ${shiftStyle.border}`,
                                }} title={`Shift ${shiftSeverity}`} />
                              )}
                            </div>
                            {unit.shiftDurationHours && (
                              <span
                                className="badge"
                                style={{
                                  fontSize: 10,
                                  background: shiftStyle ? shiftStyle.border : "var(--bs-secondary)",
                                  color: "#fff",
                                }}
                              >
                                {unit.shiftDurationHours}h
                              </span>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: "var(--ems-text-muted)", fontSize: 11 }}>—</span>
                        )}
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
                          {unit.shiftType !== "night" && (
                            <button
                              className="btn btn-sm"
                              style={{ fontSize: 11, padding: "3px 7px", background: "transparent", border: "1px solid #2a3347", color: "var(--ems-board-text-muted)" }}
                              onClick={() => handleMakeNight(unit)}
                              title="Make night crew"
                            >
                              <FaMoon style={{ fontSize: 10 }} />
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
                                    {c.pickup_time && <span className={overdue ? "ems-overdue-text" : ""} style={{ fontSize: 10, color: overdue ? "#dc3545" : "var(--ems-text-muted)", marginLeft: 2 }}>{formatTimeForDisplay(c.pickup_time, timeFormat)}</span>}
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
          {hasAttemptedUnitSave && unitValidationErrors.length > 0 && (
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
              <TimeInput value={unitForm.startTime} onChange={v => setUnitForm(p => ({ ...p, startTime: v }))} disabled={crewSaving} />
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
                <TimeInput value={nightForm.startTime} onChange={v => setNightForm(f => ({ ...f, startTime: v }))} />
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
