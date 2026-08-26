/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

import pkg from "./package.json" with { type: "json" };

// Vite configuration for the EMS Workflow System frontend.
export default defineConfig({
  // Base path where the app is served. Default matches GitHub Pages
  // (alehsitsko.github.io/ems-workflow-system/) and the desktop build, which
  // serve the SPA under /ems-workflow-system/. The production Docker/Nginx image
  // serves from the root, so it builds with VITE_BASE_PATH="/" (see
  // frontend/Dockerfile.prod) — otherwise index.html would request
  // /ems-workflow-system/assets/* while Nginx serves them at /assets/*.
  base: process.env.VITE_BASE_PATH || "/ems-workflow-system/",
  plugins: [react()],
  // The sidebar footer shows the running version. Injected from package.json so
  // it is the real release rather than a hand-maintained string that drifts.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    rollupOptions: {
      output: {
        // Split the rarely-changing vendor libraries out of the app chunk so they
        // cache independently of app code (a UI change no longer re-downloads
        // React) and the main chunk shrinks. Routes are already lazy-loaded, so
        // this is caching/structure, not a change to what loads on first paint.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("react-icons")) return "icons";
          if (/[\\/]react-router/.test(id) || /[\\/]react-dom[\\/]/.test(id) || /[\\/]react[\\/]/.test(id)) {
            return "react-vendor";
          }
          return "vendor";
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.js",
    css: false,
    // Unit/component tests live under src/. The Playwright browser E2E specs in
    // e2e/ run with a different runner (@playwright/test) and must not be
    // collected by Vitest.
    include: ["src/**/*.{test,spec}.{js,jsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "text"],
      // Default include (files exercised by Vitest) is intentional: the large page
      // components (CrewPlannerPage, CallFormPage, DispatchBoardPage, …) are covered
      // by the Playwright E2E suite, not unit tests, so forcing them in here would
      // report them as 0% and understate real coverage. This gate protects the
      // unit-tested surface (utils, hooks, api, smaller components) from regressing.
      exclude: ["src/**/*.{test,spec}.{js,jsx}", "src/test/**", "src/main.jsx"],
      // Ratchet just below the current baseline (lines 68.5 / stmts 66.1 /
      // funcs 62.0 / branches 60.7): fails on a real drop, tolerates small
      // fluctuation. Raise as coverage improves — never lower silently.
      thresholds: { lines: 67, statements: 64, functions: 60, branches: 59 },
    },
  },
});