"use strict";

/**
 * Owns the packaged Flask backend process: pick a free loopback port, spawn it
 * with the user-data paths, wait for its health check, and shut it down cleanly.
 */

const { spawn } = require("child_process");
const net = require("net");
const http = require("http");
const fs = require("fs");
const path = require("path");

/** An ephemeral 127.0.0.1 port. Bound then released so the child can take it. */
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/** Poll GET /api/health until it answers 200 (parsed body), or time out. */
function waitForHealth(port, timeoutMs = 40000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(
        { host: "127.0.0.1", port, path: "/api/health", timeout: 2000 },
        (res) => {
          let body = "";
          res.on("data", (c) => (body += c));
          res.on("end", () => {
            if (res.statusCode === 200) {
              try { resolve(JSON.parse(body)); } catch { resolve({}); }
            } else retry();
          });
        },
      );
      req.on("error", retry);
      req.on("timeout", () => { req.destroy(); retry(); });
    };
    const retry = () => {
      if (Date.now() > deadline) reject(new Error("backend did not become healthy in time"));
      else setTimeout(attempt, 400);
    };
    attempt();
  });
}

class Backend {
  constructor({ backend, paths, logDir }) {
    this.backend = backend;   // { command, args, cwd, spaDir }
    this.paths = paths;       // resolveDataPaths()
    this.logDir = logDir;
    this.child = null;
    this.port = null;
    this.exited = false;
  }

  async start() {
    // Guard: in dev the packaged exe / venv python may be missing — fail with a
    // clear message rather than a cryptic spawn error.
    if (!fs.existsSync(this.backend.command)) {
      throw new Error(`backend executable not found:\n${this.backend.command}`);
    }
    this.port = await freePort();

    const logFile = path.join(this.logDir, "backend.log");
    const out = fs.openSync(logFile, "a");

    const env = {
      ...process.env,
      EMS_DESKTOP_PORT: String(this.port),
      EMS_INSTANCE_PATH: this.paths.instance,
      DATABASE_URL: this.paths.databaseUrl,
      EMS_SERVE_SPA: this.backend.spaDir,
      // A stable per-install secret would be nicer; for a single-user local app a
      // per-process dev key is acceptable (sessions reset on restart). Not prod web.
      PYTHONUNBUFFERED: "1",
    };

    this.child = spawn(this.backend.command, this.backend.args, {
      cwd: this.backend.cwd,
      env,
      stdio: ["ignore", out, out],
      windowsHide: true,
    });

    this.child.on("exit", (code) => {
      this.exited = true;
      this._onExit && this._onExit(code);
    });

    await waitForHealth(this.port);
    return this.port;
  }

  onUnexpectedExit(cb) { this._onExit = cb; }

  get baseUrl() {
    return `http://127.0.0.1:${this.port}`;
  }

  /** Terminate the backend. SIGTERM first, then hard-kill if it lingers. */
  async stop() {
    if (!this.child || this.exited) return;
    const child = this.child;
    return new Promise((resolve) => {
      const done = () => resolve();
      const timer = setTimeout(() => {
        try { child.kill("SIGKILL"); } catch { /* already gone */ }
        resolve();
      }, 4000);
      child.once("exit", () => { clearTimeout(timer); done(); });
      try { child.kill(); } catch { clearTimeout(timer); resolve(); }
    });
  }
}

module.exports = { Backend, freePort, waitForHealth };
