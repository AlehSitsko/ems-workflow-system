#!/usr/bin/env node
/**
 * Lockfile integrity guard — catches the class of corruption that shipped in
 * v1.1.16: a blanket version find/replace had rewritten a *transitive* dependency
 * (`@peculiar/json-schema`) to the app's version `1.1.16`, while its `resolved`
 * tarball and `integrity` still pointed at the real `1.1.12`. `npm ci` tolerated
 * it, so nothing caught it before release.
 *
 * For every package-lock.json it checks, per entry, that:
 *   1. the `version` field matches the version embedded in the registry `resolved`
 *      tarball URL (…/-/<name>-<version>.tgz) — an app-version bump must never
 *      touch a dependency's version; and
 *   2. the lock's own root version matches the sibling package.json version.
 *
 * Pure Node, no dependencies. Exits non-zero (and prints every problem) on any
 * inconsistency, so it can gate CI and a release. Run: `node scripts/check-lockfiles.mjs`.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOCKS = ["frontend/package-lock.json", "desktop/package-lock.json"];

// …/-/<name>-<version>.tgz  → capture the version segment after the final '-'.
const TARBALL_VERSION = /\/-\/.*-(\d+\.\d+\.\d+[^/]*)\.tgz$/;

let problems = 0;
const fail = (msg) => { console.error(`  ✗ ${msg}`); problems++; };

for (const rel of LOCKS) {
  const lockPath = join(repoRoot, rel);
  if (!existsSync(lockPath)) { console.log(`- ${rel}: not present, skipped`); continue; }

  const lock = JSON.parse(readFileSync(lockPath, "utf8"));
  const pkgPath = join(dirname(lockPath), "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));

  console.log(`\nChecking ${rel} (app ${pkg.name}@${pkg.version})`);

  // Root version must match package.json (both the top-level and packages[""] copies).
  if (lock.version !== pkg.version)
    fail(`lock root version ${lock.version} != package.json ${pkg.version}`);
  const rootEntry = lock.packages && lock.packages[""];
  if (rootEntry && rootEntry.version && rootEntry.version !== pkg.version)
    fail(`lock packages[""].version ${rootEntry.version} != package.json ${pkg.version}`);

  // Every dependency entry: version must match its resolved registry tarball.
  let checked = 0;
  for (const [name, info] of Object.entries(lock.packages || {})) {
    if (!name || !info || !info.version || !info.resolved) continue;
    const m = String(info.resolved).match(TARBALL_VERSION);
    if (!m) continue; // git/file/link/non-registry sources carry no tarball version
    checked++;
    if (m[1] !== info.version)
      fail(`${name}: version "${info.version}" != tarball "${m[1]}" (${info.resolved})`);
  }
  console.log(`  ${checked} registry-resolved entries checked`);
}

if (problems) {
  console.error(`\n✗ ${problems} lockfile inconsistency(ies) found — a version bump likely edited a transitive dependency.`);
  console.error("  Fix by regenerating the affected lockfile from a clean state (remove node_modules + package-lock.json, then `npm install`), not by hand-editing one line.");
  process.exit(1);
}
console.log("\n✓ All lockfiles consistent.");
