import { useEffect, useRef } from "react";
import { openEventStream } from "../api/realtime";

/**
 * Subscribe to the organisation's realtime event stream for the lifetime of the
 * component. `handlers` maps event type -> callback. One connection is opened; the
 * latest handler closures are always used (via a ref), so callers don't need to
 * memoise. The event types are read once from the initial handlers object.
 */
export function useOrgEvents(handlers) {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const types = Object.keys(ref.current || {});
    if (types.length === 0) return undefined;
    const dispatch = Object.fromEntries(
      types.map((t) => [t, (data, ev) => ref.current[t]?.(data, ev)]),
    );
    const close = openEventStream(dispatch);
    return close;
    // Intentionally connect once; the latest handlers are dispatched via the ref.
  }, []);
}
