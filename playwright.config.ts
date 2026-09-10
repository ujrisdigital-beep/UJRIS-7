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
  globalTimeout: process.env.CI ? 10 * 60_000 : undefined,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  globalTeardown: "./tests/e2e/global-teardown.ts",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4127",
    trace: "on-first-retry",
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? undefined
    : {
        command: "npx prisma migrate deploy && npx next dev --hostname 127.0.0.1 -p 4127",
        url: "http://127.0.0.1:4127",
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        gracefulShutdown: { signal: "SIGTERM", timeout: 15_000 },
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...process.env,
          DATABASE_URL: "file:./test.db",
          AUTH_SECRET: process.env.AUTH_SECRET || "test-auth-secret-that-is-long-enough-32ch",
          NODE_ENV: process.env.NODE_ENV || "development",
        },
      },
});
