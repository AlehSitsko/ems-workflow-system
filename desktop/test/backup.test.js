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

// ── Collision safety, atomicity, rotation policy, traversal (P0 fix) ──────────

test("five back-to-back backups produce five distinct, unique folders", () => {
  const p = makePaths();
  const folders = [];
  for (let i = 0; i < 5; i++) folders.push(backup.backupTo(p, p.backups, "manual", "1.0.0"));
  const names = folders.map((f) => path.basename(f));
  assert.strictEqual(new Set(names).size, 5, "all five folder names must be unique");
  for (const f of folders) assert.ok(fs.existsSync(path.join(f, "ems.sqlite")));
  // Every real backup is listed exactly once.
  assert.strictEqual(backup.listBackups(p).length, 5);
});

test("listBackups returns real backups newest-first", () => {
  const p = makePaths();
  backup.backupTo(p, p.backups, "manual", "1.0.0");
  backup.backupTo(p, p.backups, "manual", "1.0.0");
  const names = backup.listBackups(p).map((b) => b.name);
  assert.deepStrictEqual(names, [...names].sort().reverse());
});

test("automatic rotation keeps manual and prerestore backups", () => {
  const p = makePaths();
  const manual = backup.backupTo(p, p.backups, "manual", "1.0.0");
  const prerestore = backup.backupTo(p, p.backups, "prerestore", "1.0.0");
  for (let i = 0; i < 8; i++) backup.autoBackup(p, "1.0.0", 3);
  assert.ok(fs.existsSync(manual), "manual backup must survive automatic rotation");
  assert.ok(fs.existsSync(prerestore), "prerestore backup must survive automatic rotation");
  const autos = fs.readdirSync(p.backups).filter((n) => n.startsWith("ems-backup-prelaunch-"));
  assert.strictEqual(autos.length, 3, "exactly the last 3 automatic backups remain");
});

test("a failed backup leaves no valid restore point and no temp dir", () => {
  const p = makePaths(Buffer.from("not a sqlite database")); // invalid source content
  assert.throws(() => backup.backupTo(p, p.backups, "manual", "1.0.0"), /verification failed/i);
  const promoted = fs.readdirSync(p.backups).filter((n) => n.startsWith("ems-backup-"));
  assert.strictEqual(promoted.length, 0, "no promoted backup after a failed write");
  const temps = fs.readdirSync(p.backups).filter((n) => n.startsWith(".ems-backup-tmp-"));
  assert.strictEqual(temps.length, 0, "temp dir must be cleaned up");
});

test("a leftover temp dir is not a restore point and gets swept", () => {
  const p = makePaths();
  const tmp = fs.mkdtempSync(path.join(p.backups, ".ems-backup-tmp-"));
  fs.writeFileSync(path.join(tmp, "ems.sqlite"), SQLITE_HEADER);
  assert.strictEqual(backup.listBackups(p).some((b) => b.path === tmp), false);
  backup.autoBackup(p, "1.0.0", 5);
  assert.strictEqual(fs.existsSync(tmp), false, "autoBackup should sweep stale temp dirs");
});

test("restore copies only the known db files (no traversal via extras)", () => {
  const p = makePaths();
  const src = backup.backupTo(p, p.backups, "manual", "1.0.0");
  fs.writeFileSync(path.join(src, "evil.txt"), "pwned"); // planted extra file
  backup.restoreFrom(p, src, "1.0.0");
  assert.strictEqual(fs.existsSync(path.join(p.database, "evil.txt")), false);
});

test("restore brings back exactly the selected backup's state", () => {
  const p = makePaths();
  fs.writeFileSync(p.dbFile, Buffer.concat([SQLITE_HEADER, Buffer.from("STATE-A")]));
  const a = backup.backupTo(p, p.backups, "manual", "1.0.0");
  fs.writeFileSync(p.dbFile, Buffer.concat([SQLITE_HEADER, Buffer.from("STATE-B")]));
  backup.backupTo(p, p.backups, "manual", "1.0.0");
  fs.writeFileSync(p.dbFile, Buffer.concat([SQLITE_HEADER, Buffer.from("STATE-C")]));

  backup.restoreFrom(p, a, "1.0.0"); // restore the oldest (STATE-A)

  const restored = fs.readFileSync(p.dbFile);
  assert.ok(restored.includes(Buffer.from("STATE-A")), "restored the selected state");
  assert.ok(!restored.includes(Buffer.from("STATE-C")), "did not keep the newer state");
});
