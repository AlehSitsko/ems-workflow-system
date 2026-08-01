import { describe, it, expect, beforeEach, vi } from "vitest";

import {
  installSessionExpiryFetch, onSessionExpired, resetSessionExpiry,
} from "./sessionExpiry.js";
import API_BASE from "./config.js";

// Each test installs the interceptor onto a fresh window.fetch (the idempotence
// flag lives on the wrapper, so a new native fetch re-wraps), points the handler
// at a spy, and re-arms the once-only guard.
let nativeFetch;
let onExpired;

function respondWith(status) {
  nativeFetch = vi.fn(() => Promise.resolve({ status, ok: status < 400 }));
  window.fetch = nativeFetch;
  installSessionExpiryFetch();
}

beforeEach(() => {
  onExpired = vi.fn();
  onSessionExpired(onExpired);
  resetSessionExpiry();
});

describe("session-expiry fetch interceptor", () => {
  it("fires on a 401 from an API request", async () => {
    respondWith(401);
    await window.fetch(`${API_BASE}/api/patients`);
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it("does not fire on a successful response", async () => {
    respondWith(200);
    await window.fetch(`${API_BASE}/api/patients`);
    expect(onExpired).not.toHaveBeenCalled();
  });

  it("ignores a 401 from login (a wrong password, not a revocation)", async () => {
    respondWith(401);
    await window.fetch(`${API_BASE}/api/auth/login`, { method: "POST" });
    expect(onExpired).not.toHaveBeenCalled();
  });

  it("ignores a 401 from the /me probe", async () => {
    respondWith(401);
    await window.fetch(`${API_BASE}/api/auth/me`);
    expect(onExpired).not.toHaveBeenCalled();
  });

  it("ignores a 401 from a non-API host", async () => {
    respondWith(401);
    await window.fetch("https://example.com/thing");
    expect(onExpired).not.toHaveBeenCalled();
  });

  it("fires only once across a burst of 401s until re-armed", async () => {
    respondWith(401);
    await window.fetch(`${API_BASE}/api/patients`);
    await window.fetch(`${API_BASE}/api/calls`);
    expect(onExpired).toHaveBeenCalledTimes(1);

    resetSessionExpiry(); // a fresh login re-arms it
    await window.fetch(`${API_BASE}/api/tasks`);
    expect(onExpired).toHaveBeenCalledTimes(2);
  });

  it("returns the original response unchanged", async () => {
    respondWith(401);
    const res = await window.fetch(`${API_BASE}/api/patients`);
    expect(res.status).toBe(401);
  });
});
