import { defineConfig, devices } from "@playwright/test";

/**
 * E2E smoke tests. They expect `npm run dev -- -p 4127` (or `npx playwright
 * test` with `webServer` below). They do not exercise authenticated case
 * flows — those belong in later tickets once onboarding pages are stable.
 *
 * CI: `npm run test:e2e` after `npx playwright install --with-deps chromium`.
 * The default GitHub Actions workflow does **not** run Playwright (browser
 * install + long-lived Next server). See `.github/workflows/ci.yml`.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4127",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? undefined
    : {
        command: "npx next dev -p 4127",
        url: "http://127.0.0.1:4127",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
