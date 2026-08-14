import API_BASE from "./config.js";

/**
 * Open the tenant-scoped realtime stream (Server-Sent Events).
 *
 * `handlers` maps an event type ("call.created", …) to a callback receiving the
 * parsed event data. The connection carries the session cookie (the server scopes
 * the stream to the caller's organisation); EventSource auto-reconnects on a
 * network drop. Returns a function that closes the stream.
 */
export function openEventStream(handlers = {}, { onOpen, onError } = {}) {
  // EventSource is absent in non-browser environments (SSR, jsdom tests) — no-op
  // there so subscribing components stay safe.
  if (typeof EventSource === "undefined") return () => {};

  const url = `${API_BASE}/api/events/stream`;
  const es = new EventSource(url, { withCredentials: true });
  if (onOpen) es.addEventListener("open", onOpen);
  if (onError) es.addEventListener("error", onError);

  for (const [type, fn] of Object.entries(handlers)) {
    es.addEventListener(type, (ev) => {
      let data = null;
      try { data = JSON.parse(ev.data); } catch { data = null; }
      fn(data, ev);
    });
  }

  return () => es.close();
}
