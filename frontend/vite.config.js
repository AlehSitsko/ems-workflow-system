/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

import pkg from "./package.json" with { type: "json" };

// Vite configuration for the EMS Workflow System frontend.
export default defineConfig({
  base: "/ems-workflow-system/",
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
  },
});