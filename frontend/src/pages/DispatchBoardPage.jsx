import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import API_BASE from "../api/config.js";
import { useToast } from "../components/ui/useToast";
import { useConfirm } from "../components/ui/useConfirm";
import { FaSun, FaMoon, FaPlus } from "react-icons/fa";
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
import CallDetailModal from "../components/dispatch/CallDetailModal";
import WarningModal from "../components/dispatch/WarningModal";
import BoardToolbar from "../components/dispatch/BoardToolbar";
import OpenCallsPanel from "../components/dispatch/OpenCallsPanel";
import UnitTable from "../components/dispatch/UnitTable";
import UnitDetailPanel from "../components/dispatch/UnitDetailPanel";
import { useUserSettings } from "../context/useUserSettings";
import { isEmployeeEligibleForRole } from "../utils/licenseUtils";
import {
  STATUS_NEXT,
  todayStr,
  isIsoDate,
  addDays,
  boardMode,
  BOARD_MODE_META,
  canEditAssignments,
  canUseLiveStatus,
  isAlsUnit,
  isAlsCall,
  isEmergencyCall,
  timeToMinutes,
  expandAndSort,
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

// Find a call anywhere on a loaded board (open/completed/cancelled columns or
// any unit's assigned/completed lists) by id. Used to focus a ?call= deep link.
function findCallOnBoard(board, callId) {
  const id = String(callId);
  for (const pool of [board.openCalls, board.completedCalls, board.cancelledCalls]) {
    const found = (pool || []).find((c) => String(c.id) === id);
    if (found) return found;
  }
  for (const unit of board.units || []) {
    for (const pool of [unit.assignedCalls, unit.completedCalls]) {
      const found = (pool || []).find((c) => String(c.id) === id);
      if (found) return found;
    }
  }
  return null;
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function DispatchBoardPage() {
  const toast = useToast();
  const confirm = useConfirm();

  // The board's date, its optional focused call/unit, and the operational mode
  // all come from the URL (?date=&call=&unit=) so a Calendar link or a shared
  // URL lands on the right day. Falls back to today's local date.
  const [searchParams, setSearchParams] = useSearchParams();
  const urlDate = searchParams.get("date");
  const [date, setDate] = useState(() => (isIsoDate(urlDate) ? urlDate : todayStr()));

  const mode = useMemo(() => boardMode(date), [date]);
  const canEdit = canEditAssignments(mode);
  const canLive = canUseLiveStatus(mode);

  // Change the board date and reflect it in the URL. Manual navigation clears
  // any focused call/unit (those are one-shot deep links, see below).
  const changeDate = useCallback((newDate) => {
    if (!isIsoDate(newDate)) return;
    setDate(newDate);
    setSearchParams({ date: newDate }, { replace: true });
  }, [setSearchParams]);

  // Keep local date in sync when the URL date changes underneath us (e.g. the
  // user follows another Calendar link while already on the board).
  useEffect(() => {
    const p = searchParams.get("date");
    if (isIsoDate(p)) setDate((prev) => (p !== prev ? p : prev));
  }, [searchParams]);
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

  // Auto-refresh every 30 s only in Live mode (today). Planning/History are
  // static snapshots and don't poll.
  useEffect(() => {
    if (mode !== "live") return;
    const interval = setInterval(() => loadBoard(date, true), 30_000);
    return () => clearInterval(interval);
  }, [mode, date, loadBoard]);

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

    if (!canEdit) {
      toast.error("Read-only day", "Assignments can't be changed on a past date.");
      return;
    }

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
    if (!canEdit) {
      toast.error("Read-only day", "Assignments can't be changed on a past date.");
      return;
    }
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
    // Double-click advances live status — Live mode only.
    if (!canLive) return;
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
    if (!canLive) {
      toast.error("Live status unavailable", `${BOARD_MODE_META[mode].label} mode — status changes only apply to today.`);
      return;
    }
    try {
      await updateUnitStatus(unitId, status);
      await loadBoard(date);
    } catch (e) { toast.error("Status update failed", e.message); }
  }

  async function handleUnassign(assignmentId) {
    if (!canEdit) {
      toast.error("Read-only day", "Assignments can't be changed on a past date.");
      return;
    }
    try {
      await unassignCall(assignmentId);
      await loadBoard(date);
    } catch (e) { toast.error("Unassign failed", e.message); }
  }

  async function handleComplete(assignmentId) {
    if (!canLive) {
      toast.error("Live action unavailable", `${BOARD_MODE_META[mode].label} mode — completing calls only applies to today.`);
      return;
    }
    try {
      await completeAssignment(assignmentId);
      await loadBoard(date);
    } catch (e) { toast.error("Complete failed", e.message); }
  }

  async function handleReopen(assignmentId) {
    if (!canLive) {
      toast.error("Live action unavailable", `${BOARD_MODE_META[mode].label} mode — reopening calls only applies to today.`);
      return;
    }
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

  // One-shot linked selection from a Calendar deep link (?call= / ?unit=). Once
  // the board for the date has loaded, focus the matching unit (inspector) or
  // call (detail modal), then strip the focus params — the date stays as the
  // shareable state. A missing entity shows a toast instead of crashing.
  const focusAppliedRef = useRef("");
  useEffect(() => {
    if (loading) return;
    const focusCall = searchParams.get("call");
    const focusUnit = searchParams.get("unit");
    if (!focusCall && !focusUnit) return;

    const key = `${date}|${focusCall || ""}|${focusUnit || ""}`;
    if (focusAppliedRef.current === key) return;
    focusAppliedRef.current = key;

    if (focusUnit) {
      const unit = board.units.find((u) => String(u.id) === String(focusUnit));
      if (unit) setSelectedUnit(unit);
      else toast.error("Unit not found", `Unit ${focusUnit} has no shift on ${date}.`);
    }
    if (focusCall) {
      const call = findCallOnBoard(board, focusCall);
      if (call) setCallModal({ call, isCompleted: call.status === "completed" });
      else toast.error("Call not found", `Call ${focusCall} is not scheduled on ${date}.`);
    }

    setSearchParams({ date }, { replace: true });
  }, [loading, board, date, searchParams, setSearchParams, toast]);

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

  // Crew units can be created/edited in Planning + Live, but a past (History)
  // day is read-only.
  const guardEditable = () => {
    if (canEdit) return true;
    toast.error("Read-only day", "Crew units can't be changed on a past date.");
    return false;
  };

  const handleShowCreateUnit = () => {
    if (!guardEditable()) return;
    setUnitForm({ ...initialUnitForm, shiftDate: date });
    setEditingUnitId(null);
    setShowUnitDrawer(true);
    setHasAttemptedUnitSave(false);
  };

  const handleShowCreateNightUnit = () => {
    if (!guardEditable()) return;
    setUnitForm({ ...initialUnitForm, shiftDate: date, shiftType: "night", endDate: addDays(date, 1) });
    setEditingUnitId(null);
    setShowUnitDrawer(true);
    setHasAttemptedUnitSave(false);
  };

  const handleEditUnit = (unit) => {
    if (!guardEditable()) return;
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
    if (!guardEditable()) return;
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
    if (!guardEditable()) return;
    const hasExisting = board.units.some(u => u.shiftType === "night");
    setNightForm({ startTime: unit.startTime || "", endTime: "", endDate: addDays(date, 1) });
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
        onDateChange={changeDate}
        mode={mode}
        onPrevDay={() => changeDate(addDays(date, -1))}
        onToday={() => changeDate(todayStr())}
        onNextDay={() => changeDate(addDays(date, 1))}
        loading={loading}
        onRefresh={() => loadBoard(date)}
        onCreateDayUnit={handleShowCreateUnit}
        onCreateNightUnit={handleShowCreateNightUnit}
        creatingDisabled={employeesLoading || crewSaving || !canEdit}
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
          <UnitTable
            units={board.units}
            selectedUnit={selectedUnit}
            dragOverUnitId={dragOverUnitId}
            timeFormat={timeFormat}
            isUnitStuck={isUnitStuck}
            getUnitStuckMinutes={getUnitStuckMinutes}
            isCallOverdue={isCallOverdue}
            sortCallsByPriority={sortCallsByPriority}
            onUnitClick={handleUnitClick}
            onUnitDoubleClick={handleUnitDoubleClick}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onMakeNight={handleMakeNight}
            onEditUnit={handleEditUnit}
            onDeleteUnit={handleDeleteUnit}
            loading={loading}
            liveControlsEnabled={canLive}
            editEnabled={canEdit}
          />

          {/* Selected unit row divider + bottom panel */}
          {selectedUnit && (
            <UnitDetailPanel
              selectedUnit={selectedUnit}
              bottomHeight={bottomHeight}
              liveControlsEnabled={canLive}
              onRowDividerMouseDown={handleRowDividerMouseDown}
              onStatusChange={handleStatusChange}
              sortCallsByPriority={sortCallsByPriority}
              isCallOverdue={isCallOverdue}
              onUnassign={handleUnassign}
              onComplete={handleComplete}
              onCardClick={handleCardClick}
              onSetPickupTime={handleSetWillCallTime}
              onSetHighPriority={handleSetHighPriority}
              onMoveCall={handleMoveCall}
              onResetPriority={handleResetPriority}
            />
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
