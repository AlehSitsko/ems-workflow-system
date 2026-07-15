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
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.js",
    css: false,
  },
});