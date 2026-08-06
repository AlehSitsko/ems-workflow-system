"use strict";

/**
 * Unit tests for the desktop backup/restore logic (pure fs, no Electron).
 * Run: `npm test` in desktop/ (node --test).
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const backup = require("../backup");

const SQLITE_HEADER = Buffer.concat([
  Buffer.from("SQLite format 3\0", "binary"),
  Buffer.alloc(1024, 0),
]);

// Build a fake user-data layout with a seeded database, in a dir whose name has a
// space and a Unicode char (exercises the "paths with spaces/Unicode" case).
function makePaths(content = SQLITE_HEADER) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ems desktop tést "));
  const database = path.join(root, "database");
  const backups = path.join(root, "backups");
  fs.mkdirSync(database, { recursive: true });
  fs.mkdirSync(backups, { recursive: true });
  const dbFile = path.join(database, "ems.sqlite");
  if (content) fs.writeFileSync(dbFile, content);
  return { root, database, backups, dbFile };
}

test("backupTo copies the db + writes a manifest", () => {
  const p = makePaths();
  const folder = backup.backupTo(p, p.backups, "manual", "1.0.0");
  assert.ok(fs.existsSync(path.join(folder, "ems.sqlite")));
  const manifest = JSON.parse(fs.readFileSync(path.join(folder, "manifest.json"), "utf8"));
  assert.strictEqual(manifest.appVersion, "1.0.0");
  assert.strictEqual(manifest.label, "manual");
});

test("backupTo throws when there is no database yet", () => {
  const p = makePaths(null); // no db file
  assert.throws(() => backup.backupTo(p, p.backups), /no database/i);
});

test("validateBackup accepts a real sqlite and rejects junk", () => {
  const p = makePaths();
  const folder = backup.backupTo(p, p.backups);
  assert.strictEqual(backup.validateBackup(folder).ok, true);

  // A folder with no ems.sqlite.
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "empty "));
  assert.strictEqual(backup.validateBackup(empty).ok, false);

  // A file with the wrong magic bytes.
  const bad = path.join(empty, "ems.sqlite");
  fs.writeFileSync(bad, Buffer.from("not a database at all"));
  assert.strictEqual(backup.validateBackup(empty).ok, false);
});

test("restoreFrom replaces the live db and snapshots the current one first", () => {
  const p = makePaths();
  // Take a backup of the original, then mutate the live DB.
  const original = backup.backupTo(p, p.backups, "manual", "1.0.0");
  fs.writeFileSync(p.dbFile, Buffer.concat([SQLITE_HEADER, Buffer.from("MUTATED")]));

  backup.restoreFrom(p, original, "1.0.0");

  // Live db now matches the backup (no "MUTATED" tail).
  const restored = fs.readFileSync(p.dbFile);
  assert.ok(!restored.includes(Buffer.from("MUTATED")));
  // A pre-restore snapshot was created.
  const snaps = fs.readdirSync(p.backups).filter((n) => n.includes("prerestore"));
  assert.ok(snaps.length >= 1);
});

test("restoreFrom rejects an invalid backup before touching the live db", () => {
  const p = makePaths();
  const junk = fs.mkdtempSync(path.join(os.tmpdir(), "junk "));
  fs.writeFileSync(path.join(junk, "ems.sqlite"), Buffer.from("nope"));
  const before = fs.readFileSync(p.dbFile);
  assert.throws(() => backup.restoreFrom(p, junk, "1.0.0"));
  assert.deepStrictEqual(fs.readFileSync(p.dbFile), before); // untouched
});

test("autoBackup keeps only the last N prelaunch snapshots", () => {
  const p = makePaths();
  for (let i = 0; i < 8; i++) {
    // Vary content so the copies differ; the timestamp gives distinct folder names.
    fs.writeFileSync(p.dbFile, Buffer.concat([SQLITE_HEADER, Buffer.from(`v${i}`)]));
    backup.autoBackup(p, "1.0.0", 5);
  }
  const autos = fs.readdirSync(p.backups).filter((n) => n.startsWith("ems-backup-prelaunch-"));
  assert.strictEqual(autos.length, 5);
});
