import { defineConfig, devices } from "@playwright/test";

const PORT = process.env.E2E_PORT || "4127";

/**
 * E2E tests expect `npm run test:e2e` (`scripts/e2e-run.mjs`) to own Next.
 * Playwright does not start a webServer in that path (PLAYWRIGHT_SKIP_WEBSERVER=1).
 *
 * Optional: PLAYWRIGHT_WEB_SERVER=1 restores the legacy supervisor for debugging.
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
  webServer:
    process.env.PLAYWRIGHT_SKIP_WEBSERVER || !process.env.PLAYWRIGHT_WEB_SERVER
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
            DATABASE_URL: process.env.DATABASE_URL ?? "file:./e2e.db",
            AUTH_SECRET: process.env.AUTH_SECRET || "test-auth-secret-that-is-long-enough-32ch",
            UJRIS_NEXT_DIST_DIR: ".next-e2e",
          },
        },
});
