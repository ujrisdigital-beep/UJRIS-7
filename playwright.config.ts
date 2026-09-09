import { defineConfig, devices } from "@playwright/test";

/**
 * Managed-server E2E. Playwright starts Next on :4127 and stops it when
 * the run finishes. Do not start or stop the server yourself.
 *
 *   npx playwright install --with-deps chromium
 *   npm run test:e2e
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  fullyParallel: false,
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
        command: "npx prisma migrate deploy && npx next dev -p 4127",
        url: "http://127.0.0.1:4127",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          ...process.env,
          DATABASE_URL: "file:./test.db",
          AUTH_SECRET: process.env.AUTH_SECRET || "test-auth-secret-that-is-long-enough-32ch",
        },
      },
});
