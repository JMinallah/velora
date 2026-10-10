import { defineConfig, devices } from "@playwright/test"

/**
 * End-to-end tests (docs/06-DELIVERY-PLAN.md 2.5 exit gate, 7-6).
 *
 * The app runs against a throwaway MongoDB database with AI disabled
 * (GEMINI_API_KEY empty), so these tests prove the zero-AI baseline.
 * Sign-in is bypassed by seeding an Auth.js database session in
 * e2e/global-setup.ts — no app code knows about tests.
 *
 *   TEST_MONGODB_URI=mongodb://127.0.0.1:27017 npm run e2e
 *
 * Locally, PLAYWRIGHT_CHANNEL=chrome uses the installed Chrome instead of
 * Playwright's bundled Chromium (npx playwright install chromium).
 */
const PORT = 3100
const baseURL = `http://127.0.0.1:${PORT}`
const mongoUri = process.env.TEST_MONGODB_URI ?? "mongodb://127.0.0.1:27017"

export const E2E_DB = "velora_e2e"

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false, // one shared database and dev server
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000, // whole multi-step flows; slow machines need the headroom
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL,
    storageState: "e2e/.auth/state.json",
    trace: "retain-on-failure",
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Production build, locally too: the dev server compiles routes on first
    // visit and can full-reload a page mid-test, wiping what was typed.
    // To iterate faster, start `npm run dev -- -p 3100` yourself; it is reused.
    command: `npm run build && npm run start -- -p ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 600_000,
    env: {
      MONGODB_URI: mongoUri,
      MONGODB_DB: E2E_DB,
      AUTH_SECRET: "e2e-secret-".padEnd(40, "x"),
      AUTH_GOOGLE_ID: "e2e-client-id",
      AUTH_GOOGLE_SECRET: "e2e-client-secret",
      AUTH_TRUST_HOST: "true",
      GEMINI_API_KEY: "", // manual mode: every flow must work with no AI
      CRON_SECRET: "e2e-cron-secret",
    },
  },
})
