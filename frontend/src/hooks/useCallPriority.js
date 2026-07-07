import { updateCallOrder } from "../api/dispatchApi";
import { timeToMinutes } from "../utils/dispatchBoardUtils";

// Call priority queue helpers for the Dispatch Board — extracted from
// DispatchBoardPage.jsx (Phase 2b of its hook/component split, see
// docs/ROADMAP.md Priority 1). Depends on the page's board-refresh
// mechanics (loadBoard/date) and toast, passed in as params.

export function useCallPriority({ loadBoard, date, toast }) {
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

  return { sortCallsByPriority, handleSetHighPriority, handleMoveCall, handleResetPriority };
}
