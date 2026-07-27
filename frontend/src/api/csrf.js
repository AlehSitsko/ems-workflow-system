import API_BASE from "./config.js";

// CSRF for the session-cookie API.
//
// The backend requires a matching X-CSRF-Token header on every state-changing
// request, and hands the token to the client in a JS-readable `csrf_token`
// cookie. Rather than thread that header through all ~18 api/ modules, one
// fetch interceptor adds it — only for this API's unsafe methods, so ordinary
// GETs and any non-API request are untouched.

const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// The token the API returned in the login / me response, held in memory. This is
// the path that works cross-origin (the dev setup serves the SPA and the API on
// different ports, so JS cannot read a cookie the API set). The cookie is a
// same-origin fallback for a single-origin production deployment.
let inMemoryToken = null;

/** Record the CSRF token from a login or /me response. */
export function setCsrfToken(token) {
  inMemoryToken = token || null;
}

/** The CSRF token: the one from the auth response, else the same-origin cookie. */
function readCsrfToken() {
  if (inMemoryToken) return inMemoryToken;
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Wrap window.fetch so this API's mutations carry the CSRF header. Idempotent by
 * detecting its own wrapper (not a module flag), so it re-wraps a fresh fetch if
 * one is installed later, and a no-op outside a browser so SSR is unaffected.
 */
export function installCsrfFetch() {
  if (typeof window === "undefined" || !window.fetch || window.fetch.__csrfWrapped) return;

  const nativeFetch = window.fetch.bind(window);

  const wrapped = (input, init = {}) => {
    const url = typeof input === "string" ? input : input?.url || "";
    const method = (init.method || (typeof input !== "string" ? input?.method : "") || "GET").toUpperCase();

    if (UNSAFE.has(method) && url.startsWith(API_BASE)) {
      const token = readCsrfToken();
      if (token) {
        const headers = new Headers(
          init.headers || (typeof input !== "string" ? input.headers : undefined),
        );
        // Respect an explicit header if a caller set one; otherwise supply it.
        if (!headers.has("X-CSRF-Token")) headers.set("X-CSRF-Token", token);
        init = { ...init, headers };
      }
    }

    return nativeFetch(input, init);
  };

  wrapped.__csrfWrapped = true;
  window.fetch = wrapped;
}
