import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.browser,
        // Injected at build time by Vite from package.json (see vite.config.js).
        __APP_VERSION__: 'readonly',
      },
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^[A-Z_]' }],
    },
  },
  {
    // Tests run in Vitest under Node, so they may use node globals (e.g. reading
    // a source file to assert it against config). App code stays browser-only.
    files: ['**/*.test.{js,jsx}', 'src/test/**/*.{js,jsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    // Playwright E2E specs, config and setup run under Node (fs/os/process), and
    // import test/expect from @playwright/test rather than using globals.
    files: ['e2e/**/*.js', 'playwright.config.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    // The push service worker runs in the ServiceWorkerGlobalScope, not a window.
    // Declaring its globals here (rather than a deprecated /* eslint-env */ comment,
    // which flat config drops in ESLint 10) keeps `self`, `clients`, etc. defined.
    files: ['public/sw.js'],
    languageOptions: {
      globals: { ...globals.serviceworker },
    },
  },
])
