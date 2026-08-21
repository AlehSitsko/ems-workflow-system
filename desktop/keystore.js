"use strict";

/**
 * Standalone master-key store.
 *
 * The backend encrypts sensitive fields at rest when EMS_MASTER_KEY is set. On the
 * desktop we generate that key once and keep it protected by the OS keychain
 * (Windows DPAPI, via Electron `safeStorage`), so the stored key can only be
 * decrypted by the same Windows user account. The base64 key is held only in memory
 * and passed to the backend child process — never written to disk in the clear,
 * unless the platform has no OS keychain, in which case we fall back with a warning.
 *
 * The key file is one marker byte + payload:
 *   0x01  → the rest is safeStorage-encrypted ciphertext (OS-protected)
 *   0x00  → the rest is the base64 key in plaintext (no keychain available)
 *
 * `generateKeyBase64` and the file format are pure and unit-tested; `safeStorage`
 * is injected so tests never need the Electron runtime.
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const MARKER_PROTECTED = 0x01;
const MARKER_PLAINTEXT = 0x00;

/** A 32-byte key, base64 — the shape the backend's EMS_MASTER_KEY expects. */
function generateKeyBase64() {
  return crypto.randomBytes(32).toString("base64");
}

function keyFilePath(paths) {
  return path.join(paths.root, "key", "master.key");
}

/**
 * Return `{ key, created, protected }` for this install, generating and persisting
 * a key on first use. Throws only when a previously OS-protected key can no longer
 * be decrypted on this account (the inherent DPAPI trade-off — the caller decides
 * how to surface it). `safeStorage` is Electron's; injectable for tests.
 */
function loadOrCreateMasterKey(paths, safeStorage) {
  const file = keyFilePath(paths);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const available = !!(safeStorage
    && safeStorage.isEncryptionAvailable
    && safeStorage.isEncryptionAvailable());

  if (fs.existsSync(file)) {
    const raw = fs.readFileSync(file);
    const marker = raw[0];
    const payload = raw.subarray(1);
    if (marker === MARKER_PROTECTED) {
      if (!available) {
        throw new Error(
          "The encryption key was protected by this Windows account and cannot be "
          + "decrypted here. Sign in as the original user, or restore from a backup "
          + "made with the recovery key.",
        );
      }
      return { key: safeStorage.decryptString(payload), created: false, protected: true };
    }
    if (marker === MARKER_PLAINTEXT) {
      return { key: payload.toString("utf8"), created: false, protected: false };
    }
    throw new Error("The encryption key file is corrupt or in an unknown format.");
  }

  const key = generateKeyBase64();
  if (available) {
    const enc = safeStorage.encryptString(key);
    fs.writeFileSync(file, Buffer.concat([Buffer.from([MARKER_PROTECTED]), enc]), { mode: 0o600 });
    return { key, created: true, protected: true };
  }
  // No OS keychain (unusual on Windows): still enable field encryption, but the key
  // file itself is not OS-protected on this platform.
  fs.writeFileSync(
    file,
    Buffer.concat([Buffer.from([MARKER_PLAINTEXT]), Buffer.from(key, "utf8")]),
    { mode: 0o600 },
  );
  return { key, created: true, protected: false };
}

module.exports = { generateKeyBase64, keyFilePath, loadOrCreateMasterKey };
