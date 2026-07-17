import StatusPill from "./StatusPill";
import UnitTypeBadge from "./UnitTypeBadge";
import AssignedCallCard from "./AssignedCallCard";
import CompletedCallCard from "./CompletedCallCard";
import { STATUS_LABELS, STATUS_COLORS, STATUS_BG, minCrewForType } from "../../utils/dispatchBoardUtils";

// Dispatch Board selected-unit bottom panel — extracted from
// DispatchBoardPage.jsx (Phase 2d of its hook/component split, see
// docs/ROADMAP.md Priority 1). Renders the row-resize divider and the panel
// body together, since both are gated by the same "selectedUnit present"
// condition in the parent. Priority-queue callbacks are bound here using
// this component's own `selectedUnit` prop.

export default function UnitDetailPanel({
  selectedUnit, bottomHeight, liveControlsEnabled = true, onRowDividerMouseDown,
  onStatusChange, sortCallsByPriority, isCallOverdue,
  onUnassign, onComplete, onCardClick, onSetPickupTime,
  onSetHighPriority, onMoveCall, onResetPriority,
}) {
  const sorted = sortCallsByPriority(selectedUnit.assignedCalls || [], selectedUnit.callPriority || []);
  const manualOrder = (selectedUnit.callPriority || []).length > 0;

  return (
    <>
      {/* Row drag divider */}
      <div
        onMouseDown={onRowDividerMouseDown}
        style={{ height: 5, flexShrink: 0, background: "var(--ems-board-border)", cursor: "row-resize" }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(var(--color-primary-rgb), 0.33)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "var(--ems-board-border)")}
      />

      {/* Selected unit bottom panel */}
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
            {liveControlsEnabled
              ? "Double-click row to advance · or use buttons:"
              : "Live status is available on today's board only."}
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
                disabled={active || !liveControlsEnabled}
                style={{
                  fontSize: 12,
                  background: active ? STATUS_BG[s] : "transparent",
                  color: active ? c : "var(--ems-board-text-muted)",
                  border: `1px solid ${active ? c + "88" : "var(--ems-board-border)"}`,
                  fontWeight: active ? 700 : 400,
                }}
                onClick={() => onStatusChange(selectedUnit.id, s)}
              >
                {STATUS_LABELS[s]}
              </button>
            );
          })}
          {selectedUnit.dispatchStatus !== "out_of_service" ? (
            <button
              className="btn btn-sm btn-outline-danger ms-auto"
              style={{ fontSize: 12 }}
              disabled={!liveControlsEnabled}
              onClick={() => onStatusChange(selectedUnit.id, "out_of_service")}
            >
              Out of Service
            </button>
          ) : (
            <button
              className="btn btn-sm btn-outline-success ms-auto"
              style={{ fontSize: 12 }}
              disabled={!liveControlsEnabled}
              onClick={() => onStatusChange(selectedUnit.id, "available")}
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
          {manualOrder && (
            <div className="d-flex align-items-center justify-content-between mb-2" style={{ fontSize: 11, color: "var(--color-warning)" }}>
              <span>⚡ Manual priority active</span>
              <button
                className="btn btn-sm"
                style={{ fontSize: 10, padding: "1px 8px", color: "var(--ems-board-text-muted)", background: "transparent", border: "1px solid var(--color-border)" }}
                onClick={() => onResetPriority(selectedUnit)}
              >Reset to time order</button>
            </div>
          )}
          {sorted.map((call, idx) => (
            <AssignedCallCard
              key={call.id}
              call={call}
              unitStatus={selectedUnit.dispatchStatus}
              isCurrent={idx === 0}
              onUnassign={onUnassign}
              onComplete={onComplete}
              onCardClick={onCardClick}
              onSetPickupTime={onSetPickupTime}
              isFirst={idx === 0}
              isLast={idx === sorted.length - 1}
              isOverdue={isCallOverdue(call, selectedUnit.dispatchStatus)}
              hasPriorityControls={sorted.length > 1}
              onSetHighPriority={(callId) => onSetHighPriority(selectedUnit, callId)}
              onMoveUp={(callId) => onMoveCall(selectedUnit, callId, "up")}
              onMoveDown={(callId) => onMoveCall(selectedUnit, callId, "down")}
            />
          ))}
          {(selectedUnit.completedCalls || []).length > 0 && (
            <>
              <div className="text-muted small mb-2 mt-1" style={{ borderTop: "1px solid var(--ems-board-border)", paddingTop: 8 }}>
                Completed
              </div>
              {(selectedUnit.completedCalls || []).map((call) => (
                <CompletedCallCard key={call.id} call={call} onCardClick={onCardClick} />
              ))}
            </>
          )}
        </div>
      </div>
    </>
  );
}
