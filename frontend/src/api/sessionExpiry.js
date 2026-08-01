import API_BASE from "./config.js";

// Instant sign-out on a revoked session.
//
// The server re-validates the user every request, so a disabled/deleted account
// or a role change takes effect on the *next* API call — which comes back 401.
// Without this, a tab that is sitting idle only discovers that on the next
// navigation or reload. This interceptor watches every API response and, on a
// 401, tells the app to drop its session and bounce to the login screen at once.
//
// It wraps window.fetch a second time (on top of the CSRF wrapper), so it must be
// installed after installCsrfFetch — it sees the final response either way, since
// both call the fetch they captured at install time.

// A 401 is the *expected* answer on these, not a mid-session revocation: a wrong
// password at login, the initial /me probe before a session exists, and logout
// itself. Reacting to them would loop or fight the app's own auth flow.
const EXEMPT = ["/api/auth/login", "/api/auth/me", "/api/auth/logout"];

let handler = null;
// Once a revocation is seen we redirect; a burst of concurrent requests all
// returning 401 must not fire the handler repeatedly. Cleared on a fresh login.
let fired = false;

/** Register the callback that tears down the local session (App wires this to
 *  clearing its user + cache, which sends the router to /login). */
export function onSessionExpired(callback) {
  handler = callback;
}

/** Re-arm the interceptor after a successful login, so a later revocation fires. */
export function resetSessionExpiry() {
  fired = false;
}

function isExpiredResponse(response, url) {
  return (
    response.status === 401 &&
    typeof url === "string" &&
    url.startsWith(API_BASE) &&
    !EXEMPT.some((path) => url.includes(path))
  );
}

/**
 * Wrap window.fetch so a 401 from this API triggers the session-expired handler
 * exactly once. Idempotent (detects its own wrapper) and a no-op outside a
 * browser, so SSR/tests without a window are unaffected.
 */
export function installSessionExpiryFetch() {
  if (typeof window === "undefined" || !window.fetch || window.fetch.__sessionWrapped) return;

  const nativeFetch = window.fetch.bind(window);

  const wrapped = async (input, init = {}) => {
    const response = await nativeFetch(input, init);
    try {
      const url = typeof input === "string" ? input : input?.url || "";
      if (!fired && isExpiredResponse(response, url) && handler) {
        fired = true;
        handler();
      }
    } catch {
      // Never let the interceptor's own error swallow or corrupt the response.
    }
    return response;
  };

  wrapped.__sessionWrapped = true;
  window.fetch = wrapped;
}
