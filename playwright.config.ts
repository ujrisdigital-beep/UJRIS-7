import { defineConfig, devices } from "@playwright/test";

const PORT = process.env.E2E_PORT || "4127";

/**
 * Managed-server E2E. Playwright starts a Node supervisor which owns Next,
 * then reaps the process tree on shutdown (Unix process group / Windows taskkill).
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
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${PORT}`,
    trace: "on-first-retry",
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? undefined
    : {
        command: "node scripts/e2e-webserver.mjs",
        url: `http://127.0.0.1:${PORT}`,
        reuseExistingServer: false,
        timeout: 180_000,
        gracefulShutdown: { signal: "SIGTERM", timeout: 20_000 },
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...process.env,
          E2E_PORT: PORT,
          DATABASE_URL: "file:./test.db",
          AUTH_SECRET: process.env.AUTH_SECRET || "test-auth-secret-that-is-long-enough-32ch",
        },
      },
});
