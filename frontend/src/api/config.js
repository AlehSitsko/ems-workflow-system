/**
 * Where the API lives.
 *
 * The default follows the page's own hostname rather than hard-coding one.
 * `localhost` and `127.0.0.1` are the same machine but *different sites* to a
 * browser, and the session cookie is SameSite=Lax: opening the app on one while
 * calling the API on the other means the cookie is never sent and every request
 * comes back 401 — while the UI still shows a signed-in user from its cache.
 *
 * Following the page's hostname keeps the request same-site whichever address
 * the developer typed, so Lax can stay — the safer setting — instead of being
 * relaxed to None to work around an address mismatch.
 *
 * VITE_API_BASE_URL still overrides this for deployments where the API really
 * is on a different host.
 */
const DEFAULT_API_PORT = 5050;

function defaultApiBase() {
  // No DOM (a test environment, or any non-browser consumer).
  if (typeof window === "undefined" || !window.location?.hostname) {
    return `http://127.0.0.1:${DEFAULT_API_PORT}`;
  }
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:${DEFAULT_API_PORT}`;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || defaultApiBase();

export default API_BASE;
