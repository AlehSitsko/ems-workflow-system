"use strict";

/**
 * Standalone update check (notify-only).
 *
 * Asks GitHub for the latest published release and, if it is newer than the
 * running app, lets the caller offer to update. It never downloads or applies
 * anything itself: the user opens the release/installer and runs it over the
 * existing install, which preserves their %APPDATA% data (database, documents,
 * settings) — it is not a clean reinstall. A future *signed* release can swap
 * this for `electron-updater` to get a fully install-free apply-on-restart.
 *
 * The version/parse helpers are pure and unit-tested; `fetchJson` is injectable
 * so tests never touch the network, and nothing here throws — a failed check is
 * a silent no-op, never a crash or a scary dialog.
 */

const https = require("https");

const DEFAULT_OWNER = "AlehSitsko";
const DEFAULT_REPO = "ems-workflow-system";

// "1.2.3" / "v1.2.3" / "1.2.3-rc.1"  →  { nums:[1,2,3], pre:"rc.1" }  |  null
function parseVersion(str) {
  if (typeof str !== "string") return null;
  const m = str.trim().replace(/^v/i, "").match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/);
  if (!m) return null;
  return { nums: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] || "" };
}

// Semver-ish compare → -1 | 0 | 1. A final release outranks a prerelease of the
// same x.y.z; two different prereleases of the same x.y.z are treated as equal
// (we would rather not nag than order prerelease identifiers incorrectly).
function compareVersions(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return 0;
  for (let i = 0; i < 3; i++) {
    if (pa.nums[i] !== pb.nums[i]) return pa.nums[i] < pb.nums[i] ? -1 : 1;
  }
  if (pa.pre === pb.pre) return 0;
  if (!pa.pre) return 1;   // release > prerelease
  if (!pb.pre) return -1;  // prerelease < release
  return 0;
}

function isNewer(remote, local) {
  return compareVersions(remote, local) > 0;
}

// From a GitHub `releases/latest` payload, pull the version and the links we need.
// Drafts are ignored; the Windows Setup .exe asset is preferred for the download
// link, falling back to the release page when no matching asset is attached.
function parseRelease(json) {
  if (!json || typeof json !== "object" || json.draft) return null;
  const tag = (json.tag_name || json.name || "").trim();
  if (!parseVersion(tag)) return null;
  const assets = Array.isArray(json.assets) ? json.assets : [];
  const setup = assets.find(
    (a) => a && typeof a.name === "string" && /setup.*\.exe$/i.test(a.name),
  );
  const releaseUrl = json.html_url || "";
  return {
    version: tag.replace(/^v/i, ""),
    prerelease: !!json.prerelease,
    releaseUrl,
    downloadUrl: setup ? setup.browser_download_url : releaseUrl,
  };
}

// GET a JSON document over HTTPS. Resolves the parsed object, or null on any
// network / timeout / non-200 / parse error. Never rejects.
function fetchJson(url, { timeoutMs = 8000 } = {}) {
  return new Promise((resolve) => {
    let req;
    try {
      req = https.get(
        url,
        {
          headers: {
            "User-Agent": "ems-workflow-desktop-updater",
            Accept: "application/vnd.github+json",
          },
        },
        (res) => {
          if (res.statusCode !== 200) {
            res.resume();
            return resolve(null);
          }
          let body = "";
          res.setEncoding("utf8");
          res.on("data", (c) => {
            body += c;
            if (body.length > 1_000_000) req.destroy(); // cap: releases JSON is small
          });
          res.on("end", () => {
            try {
              resolve(JSON.parse(body));
            } catch {
              resolve(null);
            }
          });
        },
      );
    } catch {
      return resolve(null);
    }
    req.on("error", () => resolve(null));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(null);
    });
  });
}

/**
 * Check whether a newer release exists.
 *
 * Resolves (never rejects) with:
 *   { updateAvailable, currentVersion, latestVersion?, releaseUrl?, downloadUrl? }
 * A network/parse failure resolves `{ updateAvailable:false, currentVersion }`.
 * `_fetchJson` is injectable for tests.
 */
async function checkForUpdate({
  currentVersion,
  owner = DEFAULT_OWNER,
  repo = DEFAULT_REPO,
  _fetchJson = fetchJson,
} = {}) {
  const url = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
  const json = await _fetchJson(url);
  const rel = parseRelease(json);
  if (!rel) return { updateAvailable: false, currentVersion };
  return {
    updateAvailable: isNewer(rel.version, currentVersion),
    currentVersion,
    latestVersion: rel.version,
    releaseUrl: rel.releaseUrl,
    downloadUrl: rel.downloadUrl,
  };
}

module.exports = {
  parseVersion,
  compareVersions,
  isNewer,
  parseRelease,
  fetchJson,
  checkForUpdate,
  DEFAULT_OWNER,
  DEFAULT_REPO,
};
