import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { installCsrfFetch, setCsrfToken } from "./csrf.js";
import API_BASE from "./config.js";

// The interceptor installs onto window.fetch exactly once per module load, so
// each test captures the wrapped fetch and the native spy it delegates to.
let nativeFetch;

beforeEach(() => {
  nativeFetch = vi.fn(() => Promise.resolve({ ok: true }));
  window.fetch = nativeFetch;
  document.cookie = "csrf_token=tok-123";
  installCsrfFetch(); // wraps window.fetch (once across the suite)
});

afterEach(() => {
  document.cookie = "csrf_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  setCsrfToken(null);
});

function headerOf(call, name) {
  const init = call[1] || {};
  return new Headers(init.headers).get(name);
}

describe("CSRF fetch interceptor", () => {
  it("adds the token header to an API mutation", async () => {
    await window.fetch(`${API_BASE}/api/patients`, { method: "POST" });
    expect(headerOf(nativeFetch.mock.calls[0], "X-CSRF-Token")).toBe("tok-123");
  });

  it("does not add it to a safe GET", async () => {
    await window.fetch(`${API_BASE}/api/patients`, { method: "GET" });
    expect(headerOf(nativeFetch.mock.calls[0], "X-CSRF-Token")).toBeNull();
  });

  it("leaves a non-API request untouched", async () => {
    await window.fetch("https://example.com/thing", { method: "POST" });
    expect(headerOf(nativeFetch.mock.calls[0], "X-CSRF-Token")).toBeNull();
  });

  it("preserves headers the caller already set", async () => {
    await window.fetch(`${API_BASE}/api/patients`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const sent = new Headers(nativeFetch.mock.calls[0][1].headers);
    expect(sent.get("Content-Type")).toBe("application/json");
    expect(sent.get("X-CSRF-Token")).toBe("tok-123");
  });

  it("uses the in-memory token even with no cookie (cross-origin API)", async () => {
    document.cookie = "csrf_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    setCsrfToken("from-login-response");
    await window.fetch(`${API_BASE}/api/patients`, { method: "POST" });
    expect(headerOf(nativeFetch.mock.calls[0], "X-CSRF-Token")).toBe("from-login-response");
  });

  it("adds no header when there is no token cookie yet (pre-login)", async () => {
    document.cookie = "csrf_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    await window.fetch(`${API_BASE}/api/auth/login`, { method: "POST" });
    expect(headerOf(nativeFetch.mock.calls[0], "X-CSRF-Token")).toBeNull();
  });
});
