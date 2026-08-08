import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Best-effort cleanup of the throwaway E2E database dir. On Windows the backend
// may still hold the SQLite file when teardown runs (Playwright stops the
// webServer after this hook), so a failed delete is not an error — the dir lives
// in the OS temp folder and is swept on the next run and by the OS.
export default function globalTeardown() {
  const dir = process.env.EMS_E2E_DIR;
  if (dir) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* file still locked by the backend — leave it for the OS / next run */
    }
  }
  // Opportunistically remove any earlier leftovers that are now unlocked.
  try {
    const tmp = os.tmpdir();
    for (const name of fs.readdirSync(tmp)) {
      if (name.startsWith("ems-e2e-") && path.join(tmp, name) !== dir) {
        try { fs.rmSync(path.join(tmp, name), { recursive: true, force: true }); } catch { /* still locked */ }
      }
    }
  } catch { /* tmp unreadable — ignore */ }
}
