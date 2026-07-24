import { useCallback, useEffect, useState } from "react";

import { getAttentionCounts } from "../api/operationsApi";

// Queues nobody is reminded about are queues that grow: a call with no trip
// date, tomorrow's trips nobody has rung, yesterday still unsigned. This polls
// the counts behind the navigation badges.
//
// A minute is deliberately unhurried — these are backlogs measured in hours, and
// a tighter loop would cost more than the freshness is worth.
const REFRESH_MS = 60_000;

export function useAttentionCounts(currentUser) {
  const [counts, setCounts] = useState({});
  // The dashboard needs to tell "nothing waiting" apart from "not asked yet":
  // the first renders as no cards, the second as skeletons.
  const [loading, setLoading] = useState(true);

  // Only the role matters for whether to ask at all; the session says who.
  const role = currentUser?.role;

  const load = useCallback(() => {
    if (!role) return Promise.resolve();
    return getAttentionCounts({})
      .then(setCounts)
      // A failed badge refresh must never interrupt the page: the counts simply
      // stay as they were.
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [role]);

  useEffect(() => {
    if (!role) {
      setCounts({});
      setLoading(false);
      return undefined;
    }
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load, role]);

  return { counts, loading, refresh: load };
}
