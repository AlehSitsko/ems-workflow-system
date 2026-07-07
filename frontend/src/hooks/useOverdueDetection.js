import { useState, useEffect } from "react";
import { timeToMinutes } from "../utils/dispatchBoardUtils";

// Overdue-call / stuck-unit detection for the Dispatch Board — extracted
// from DispatchBoardPage.jsx (Phase 2 of its hook/component split, see
// docs/ROADMAP.md Priority 1). Owns its own 30s clock tick so the page
// doesn't need to re-render on a timer for anything else.

export function useOverdueDetection(dispatchThresholds) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

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

  return { getCallOverdueMinutes, getUnitStuckMinutes, isCallOverdue, isUnitStuck };
}
