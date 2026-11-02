import { defineConfig, devices } from "@playwright/test"

import { BASE_URL } from "./e2e/helpers/env"

/**
 * Browser end-to-end configuration for the AccessAudit frontend.
 *
 * The suite intentionally runs without a backend or database: each spec
 * intercepts the browser -> backend requests it needs with `page.route()`
 * and authenticates by minting a NextAuth session cookie (see
 * `e2e/helpers/session.ts`).
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  outputDir: "playwright-results",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // Run the suite against a production build: it removes dev-server HMR
    // recompiles during the run (a source of cross-test flakiness) and matches
    // the artifact that CI ships in the `frontend-build` job.
    command: "npm run build && npm run start -- --hostname 127.0.0.1 --port 3000",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    stdout: "pipe",
    stderr: "pipe",
  },
})
