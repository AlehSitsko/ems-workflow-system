"use strict";

/**
 * Unit tests for the update-check helpers (no Electron, no network). The GitHub
 * fetch is injected, so these exercise version comparison, release parsing, and
 * the check decision deterministically.
 */

const test = require("node:test");
const assert = require("node:assert");

const {
  parseVersion,
  compareVersions,
  isNewer,
  parseRelease,
  checkForUpdate,
} = require("../updater");

test("parseVersion accepts x.y.z, a v prefix, and prereleases", () => {
  assert.deepStrictEqual(parseVersion("1.2.3"), { nums: [1, 2, 3], pre: "" });
  assert.deepStrictEqual(parseVersion("v1.1.3"), { nums: [1, 1, 3], pre: "" });
  assert.deepStrictEqual(parseVersion("2.0.0-rc.1"), { nums: [2, 0, 0], pre: "rc.1" });
  assert.strictEqual(parseVersion("not-a-version"), null);
  assert.strictEqual(parseVersion(""), null);
  assert.strictEqual(parseVersion(undefined), null);
});

test("compareVersions orders numerically and ranks a release above its prerelease", () => {
  assert.strictEqual(compareVersions("1.2.4", "1.2.3"), 1);
  assert.strictEqual(compareVersions("1.2.3", "1.2.4"), -1);
  assert.strictEqual(compareVersions("2.0.0", "1.9.9"), 1);
  assert.strictEqual(compareVersions("1.2.3", "1.2.3"), 0);
  assert.strictEqual(compareVersions("1.2.3", "1.2.3-rc.1"), 1); // release > prerelease
  assert.strictEqual(compareVersions("1.2.3-rc.1", "1.2.3"), -1);
  assert.strictEqual(compareVersions("bad", "1.2.3"), 0); // unparsable → no opinion
});

test("isNewer is true only when the remote strictly exceeds the local version", () => {
  assert.strictEqual(isNewer("1.1.4", "1.1.3"), true);
  assert.strictEqual(isNewer("1.1.3", "1.1.3"), false);
  assert.strictEqual(isNewer("1.1.2", "1.1.3"), false);
});

test("parseRelease pulls version + prefers the Windows Setup .exe asset", () => {
  const rel = parseRelease({
    tag_name: "v1.2.0",
    html_url: "https://github.com/o/r/releases/tag/v1.2.0",
    prerelease: false,
    assets: [
      { name: "EMS-Workflow-System-Setup.exe", browser_download_url: "https://dl/setup.exe" },
      { name: "latest.yml", browser_download_url: "https://dl/latest.yml" },
    ],
  });
  assert.strictEqual(rel.version, "1.2.0");
  assert.strictEqual(rel.downloadUrl, "https://dl/setup.exe");
  assert.strictEqual(rel.releaseUrl, "https://github.com/o/r/releases/tag/v1.2.0");
});

test("parseRelease falls back to the release page when no Setup asset is attached", () => {
  const rel = parseRelease({
    tag_name: "1.2.0",
    html_url: "https://github.com/o/r/releases/tag/1.2.0",
    assets: [],
  });
  assert.strictEqual(rel.downloadUrl, "https://github.com/o/r/releases/tag/1.2.0");
});

test("parseRelease ignores drafts and unparsable tags", () => {
  assert.strictEqual(parseRelease({ tag_name: "v9.9.9", draft: true }), null);
  assert.strictEqual(parseRelease({ tag_name: "nightly" }), null);
  assert.strictEqual(parseRelease(null), null);
});

test("checkForUpdate reports an available update when GitHub is ahead", async () => {
  const fake = async () => ({
    tag_name: "v1.2.0",
    html_url: "https://github.com/o/r/releases/tag/v1.2.0",
    assets: [{ name: "EMS-Workflow-System-Setup.exe", browser_download_url: "https://dl/setup.exe" }],
  });
  const r = await checkForUpdate({ currentVersion: "1.1.3", _fetchJson: fake });
  assert.strictEqual(r.updateAvailable, true);
  assert.strictEqual(r.latestVersion, "1.2.0");
  assert.strictEqual(r.downloadUrl, "https://dl/setup.exe");
});

test("checkForUpdate reports no update when already current or ahead", async () => {
  const same = async () => ({ tag_name: "v1.1.3", assets: [] });
  const r = await checkForUpdate({ currentVersion: "1.1.3", _fetchJson: same });
  assert.strictEqual(r.updateAvailable, false);
  assert.strictEqual(r.latestVersion, "1.1.3");
});

test("checkForUpdate degrades quietly to no-update when the fetch fails", async () => {
  const dead = async () => null;
  const r = await checkForUpdate({ currentVersion: "1.1.3", _fetchJson: dead });
  assert.strictEqual(r.updateAvailable, false);
  assert.strictEqual(r.currentVersion, "1.1.3");
});
