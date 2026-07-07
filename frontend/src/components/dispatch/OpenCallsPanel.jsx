import { FaPlus } from "react-icons/fa";
import CallCard from "./CallCard";
import { getEmployeeRoleLabel } from "../../utils/employeeRoleUtils";

// Dispatch Board left column (calls/staff list) — extracted from
// DispatchBoardPage.jsx (Phase 2c of its hook/component split, see
// docs/ROADMAP.md Priority 1). Purely presentational; all state/derived
// data is computed in the page and passed in as props.

export default function OpenCallsPanel({
  leftWidth, onNewCall,
  leftPanelTab, onLeftPanelTabChange,
  callFilter, onCallFilterChange,
  emergencyCalls, scheduledCalls, expandedCalls, visibleCalls,
  completedCalls, cancelledCalls,
  unassignedStaff, employeesLoading,
  loading, onDragStart, onCardClick,
}) {
  return (
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
          onClick={onNewCall}
        >
          <FaPlus style={{ fontSize: 10 }} /> New Call
        </button>

        {/* Calls / Staff toggle */}
        <div style={{ display: "flex", gap: 3, marginBottom: 8, background: "var(--ems-board-bg)", borderRadius: 8, padding: 3 }}>
          {[
            { key: "calls", label: "Calls", count: expandedCalls.length },
            { key: "staff", label: "Staff", count: unassignedStaff.length, warn: unassignedStaff.length > 0 },
          ].map(({ key, label, count, warn }) => (
            <button key={key} onClick={() => onLeftPanelTabChange(key)} style={{
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
            { key: "completed", label: "Done",       count: (completedCalls||[]).length, color: "#75b798" },
            { key: "cancelled", label: "Cancelled",  count: (cancelledCalls||[]).length, color: "#ea868f" },
            { key: "all",       label: "All",        count: expandedCalls.length + (completedCalls||[]).length + (cancelledCalls||[]).length, color: "#94a3b8" },
          ].map(({ key, label, count, color }) => (
            <button
              key={key}
              onClick={() => onCallFilterChange(key)}
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
                  <CallCard key={`${call.id}-${call._slot}-${i}`} call={call} onDragStart={onDragStart} onCardClick={onCardClick} />
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
                  <CallCard key={`${call.id}-${call._slot}-${i}`} call={call} onDragStart={onDragStart} onCardClick={onCardClick} />
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
                onDragStart={callFilter === "all" && call.status === "new" ? onDragStart : () => {}}
                onCardClick={onCardClick}
                statusOverride={callFilter !== "open" ? call.status : null}
              />
            ))}
          </>
        )}
      </div>}
    </div>
  );
}
