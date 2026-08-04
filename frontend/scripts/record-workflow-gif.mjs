/**
 * Record a short workflow GIF for the README with Playwright + ffmpeg.
 *
 * Captures a dispatcher walkthrough (dashboard → dispatch board → a call →
 * calendar) as a video, then converts it to an optimised looping GIF.
 *
 * Prerequisites (same demo stack as the screenshots):
 *   1. Backend on :5050 against a demo database (seed-demo-data)
 *   2. Frontend dev server on :5173  (npm run dev)
 *   3. npx playwright install chromium
 *   4. ffmpeg on PATH (or set FFMPEG=/path/to/ffmpeg.exe)
 *
 * Then:  npm run record-gif
 *
 * Writes docs/workflow.gif. Read-only against the app — it only signs in and
 * navigates; nothing is created or mutated.
 */
import { chromium } from "playwright";
import { spawnSync } from "node:child_process";
import { mkdir, rm, readdir } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS = resolve(__dirname, "../../docs");
const TMP = resolve(__dirname, "../.gif-tmp");
const APP = process.env.APP_URL || "http://localhost:5173/ems-workflow-system/";
const USER = process.env.DEMO_USER || "admin";
const PASS = process.env.DEMO_PASS || "admin";
const FFMPEG = process.env.FFMPEG || "ffmpeg";
const SIZE = { width: 1280, height: 720 };

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// A gentle mouse glide so the cursor motion reads as a person, not a jump-cut.
async function glide(page, x, y, steps = 24) {
  await page.mouse.move(x, y, { steps });
}

async function record() {
  await rm(TMP, { recursive: true, force: true });
  await mkdir(TMP, { recursive: true });
  await mkdir(DOCS, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: SIZE,
    recordVideo: { dir: TMP, size: SIZE },
  });
  const page = await context.newPage();

  // Sign in.
  await page.goto(`${APP}#/login`);
  await page.getByLabel(/username/i).fill(USER);
  await page.getByLabel(/password/i).fill(PASS);
  await page.getByRole("button", { name: /login/i }).click();
  await page.waitForURL(/#\/home/, { timeout: 15000 });
  await page.getByText(/Needs attention/i).first().waitFor({ timeout: 15000 });
  await pause(1400);

  // Dispatch board — the heart of the product.
  await page.goto(`${APP}#/dispatch`);
  await page.getByText(/Dispatch Board/i).first().waitFor({ timeout: 15000 });
  await pause(1600);
  await glide(page, 700, 380);
  await pause(1200);

  // Open a call, if the demo board has one assigned.
  try {
    const call = page.locator(".calendar-day-title, .assigned-call, [class*='CallCard'], .card").first();
    await call.waitFor({ timeout: 2500 });
    await call.click({ trial: false });
    await pause(1800);
    await page.keyboard.press("Escape");
    await pause(600);
  } catch {
    await pause(1200);
  }

  // The operational calendar — the other headline surface.
  await page.goto(`${APP}#/calendar`);
  await page.getByText(/Event sources/i).first().waitFor({ timeout: 15000 });
  await pause(1800);
  await glide(page, 640, 420);
  await pause(1200);

  await context.close();     // flushes the video
  await browser.close();

  const files = (await readdir(TMP)).filter((f) => f.endsWith(".webm"));
  if (!files.length) throw new Error("no video was recorded");
  return join(TMP, files[0]);
}

function toGif(webm) {
  const gif = join(DOCS, "workflow.gif");
  const palette = join(TMP, "palette.png");
  // Skip the initial blank-page load so the GIF's poster frame is real UI, not white.
  const START = process.env.GIF_START || "0.8";
  // Two-pass palette: fps 12, width 900, lanczos — a crisp, small looping GIF.
  const filters = "fps=12,scale=900:-1:flags=lanczos";
  const run = (args) => {
    const r = spawnSync(FFMPEG, args, { stdio: "inherit" });
    if (r.error) throw new Error(`ffmpeg not found (${FFMPEG}); install it or set FFMPEG=…`);
    if (r.status !== 0) throw new Error(`ffmpeg exited ${r.status}`);
  };
  run(["-y", "-ss", START, "-i", webm, "-vf", `${filters},palettegen=stats_mode=diff`, palette]);
  run(["-y", "-ss", START, "-i", webm, "-i", palette,
       "-lavfi", `${filters} [x]; [x][1:v] paletteuse=dither=bayer`, "-loop", "0", gif]);
  return gif;
}

async function main() {
  const webm = await record();
  const gif = toGif(webm);
  await rm(TMP, { recursive: true, force: true });
  console.log(`\nwrote ${gif}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
