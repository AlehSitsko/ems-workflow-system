/**
 * Capture README screenshots of the flagship screens with Playwright.
 *
 * Prerequisites (see README → Screenshots):
 *   1. Backend running on :5050 against a demo database
 *        cd backend && DATABASE_URL="sqlite:///demo.db" flask --app app db upgrade
 *        DATABASE_URL="sqlite:///demo.db" flask --app app seed-demo-data
 *        DATABASE_URL="sqlite:///demo.db" python app.py
 *   2. Frontend dev server running on :5173  (npm run dev)
 *   3. npx playwright install chromium
 *
 * Then:  npm run screenshots
 *
 * Writes PNGs to docs/screenshots/. Read-only — it only logs in and navigates.
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "../../docs/screenshots");
const APP = process.env.APP_URL || "http://localhost:5173/ems-workflow-system/";
const USER = process.env.DEMO_USER || "admin";
const PASS = process.env.DEMO_PASS || "admin";

const SHOTS = [
  { hash: "#/home", name: "dashboard", wait: "Needs attention" },
  { hash: "#/dispatch", name: "dispatch-board", wait: "Dispatch Board" },
  { hash: "#/calendar", name: "calendar", wait: "Event sources" },
  { hash: "#/reports", name: "reports", wait: "Operational Reports" },
  { hash: "#/compliance", name: "compliance", wait: "Compliance" },
];

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // Sign in once; the session cookie carries the rest of the walkthrough.
  await page.goto(APP, { waitUntil: "networkidle" });
  await page.getByRole("textbox", { name: "Username" }).fill(USER);
  await page.getByRole("textbox", { name: "Password" }).fill(PASS);
  await page.getByRole("button", { name: "Login" }).click();
  await page.getByText("Needs attention").first().waitFor({ timeout: 20000 });

  for (const { hash, name, wait } of SHOTS) {
    await page.goto(APP + hash, { waitUntil: "load" });
    if (wait) {
      await page.getByText(wait, { exact: false }).first()
        .waitFor({ timeout: 15000 }).catch(() => {});
    }
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(1200); // let charts/animations settle
    const file = `${OUT}/${name}.png`;
    await page.screenshot({ path: file });
    console.log(`captured ${name} → ${file}`);
  }

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
