import API_BASE from "./config.js";

/**
 * A single, shared Server-Sent Events connection for the whole tab.
 *
 * Every subscriber (the app-wide notification engine, the Dispatch Board, …)
 * multiplexes over ONE EventSource rather than opening its own — one SSE
 * connection per client instead of several, which keeps the server's connection
 * (thread) usage proportional to users, not to open components. The connection is
 * tenant-scoped and authenticated server-side by the session cookie; it opens on
 * the first subscribe and closes when the last subscriber leaves.
 */

const listeners = new Map(); // event type -> Set<fn(data, ev)>
let es = null;

function connect() {
  if (es || typeof EventSource === "undefined") return; // no-op under jsdom/SSR
  es = new EventSource(`${API_BASE}/api/events/stream`, { withCredentials: true });
}

function attach(type) {
  es.addEventListener(type, (ev) => {
    let data;
    try { data = JSON.parse(ev.data); } catch { data = null; }
    for (const fn of listeners.get(type) || []) fn(data, ev);
  });
}

/**
 * Subscribe a set of handlers ({ type: fn }) to the shared stream. Returns an
 * unsubscribe function; the shared connection is closed once no handlers remain.
 */
export function subscribe(handlers = {}) {
  connect();
  for (const [type, fn] of Object.entries(handlers)) {
    if (!listeners.has(type)) {
      listeners.set(type, new Set());
      if (es) attach(type);
    }
    listeners.get(type).add(fn);
  }

  return () => {
    for (const [type, fn] of Object.entries(handlers)) {
      listeners.get(type)?.delete(fn);
    }
    const empty = [...listeners.values()].every((s) => s.size === 0);
    if (empty && es) {
      es.close();
      es = null;
      listeners.clear();
    }
  };
}

// Backwards-compatible alias.
export const openEventStream = subscribe;
