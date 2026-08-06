"use strict";

/**
 * Unit tests for the backend process manager's helpers (no Electron): free-port
 * picking, the health-check poll, and the missing-executable guard.
 */

const test = require("node:test");
const assert = require("node:assert");
const http = require("http");

const { freePort, waitForHealth, Backend } = require("../backend");

test("freePort returns a usable loopback port", async () => {
  const p = await freePort();
  assert.ok(Number.isInteger(p) && p > 1024 && p < 65536, `got ${p}`);
});

test("waitForHealth resolves against a 200 /api/health", async () => {
  const server = http.createServer((req, res) => {
    if (req.url === "/api/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", qa_mode: false }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  const port = await freePort();
  await new Promise((r) => server.listen(port, "127.0.0.1", r));
  try {
    const body = await waitForHealth(port, 5000);
    assert.strictEqual(body.status, "ok");
  } finally {
    server.close();
  }
});

test("waitForHealth times out when nothing is listening", async () => {
  const port = await freePort(); // nobody listening here
  await assert.rejects(() => waitForHealth(port, 800), /did not become healthy/i);
});

test("Backend.start fails clearly when the executable is missing", async () => {
  const backend = new Backend({
    backend: { command: "C:/does/not/exist/ems-backend.exe", args: [], cwd: ".", spaDir: "." },
    paths: { instance: ".", databaseUrl: "sqlite:///x", dbFile: "x" },
    logDir: require("os").tmpdir(),
  });
  await assert.rejects(() => backend.start(), /not found/i);
});
