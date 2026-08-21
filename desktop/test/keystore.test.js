"use strict";

/**
 * Unit tests for the master-key store (no Electron). safeStorage is faked, so the
 * key generation, on-disk format and round-trip are exercised without real DPAPI.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { generateKeyBase64, loadOrCreateMasterKey } = require("../keystore");

function tmpPaths() {
  return { root: fs.mkdtempSync(path.join(os.tmpdir(), "ems-ks-")) };
}

// A stand-in for Electron safeStorage: "encrypts" by hex-encoding (so the on-disk
// bytes never contain the plaintext key), enough to prove the round-trip works and
// that the key is not stored in the clear.
function fakeSafeStorage(available = true) {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (s) => Buffer.from(`ENC:${Buffer.from(s, "utf8").toString("hex")}`, "utf8"),
    decryptString: (b) => Buffer.from(b.toString("utf8").slice(4), "hex").toString("utf8"),
  };
}

test("generateKeyBase64 is a 32-byte base64 key", () => {
  assert.strictEqual(Buffer.from(generateKeyBase64(), "base64").length, 32);
});

test("first run generates and OS-protects the key; second run reuses it", () => {
  const paths = tmpPaths();
  const ss = fakeSafeStorage(true);
  const a = loadOrCreateMasterKey(paths, ss);
  assert.strictEqual(a.created, true);
  assert.strictEqual(a.protected, true);
  assert.strictEqual(Buffer.from(a.key, "base64").length, 32);

  const b = loadOrCreateMasterKey(paths, ss);
  assert.strictEqual(b.created, false);
  assert.strictEqual(b.key, a.key); // same key, round-tripped through safeStorage

  const raw = fs.readFileSync(path.join(paths.root, "key", "master.key"));
  assert.strictEqual(raw[0], 0x01); // protected marker
  assert.ok(!raw.toString("utf8").includes(a.key)); // key not on disk in the clear
});

test("without an OS keychain it stores plaintext (marker 0x00) but still yields a key", () => {
  const paths = tmpPaths();
  const a = loadOrCreateMasterKey(paths, fakeSafeStorage(false));
  assert.strictEqual(a.created, true);
  assert.strictEqual(a.protected, false);
  const raw = fs.readFileSync(path.join(paths.root, "key", "master.key"));
  assert.strictEqual(raw[0], 0x00);
  assert.strictEqual(raw.subarray(1).toString("utf8"), a.key);
});

test("a protected key becomes unreadable if the keychain is gone", () => {
  const paths = tmpPaths();
  loadOrCreateMasterKey(paths, fakeSafeStorage(true));
  assert.throws(
    () => loadOrCreateMasterKey(paths, fakeSafeStorage(false)),
    /cannot be decrypted/,
  );
});
