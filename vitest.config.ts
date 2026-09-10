import { defineConfig } from "vitest/config";
import path from "path";
import { disposablePrismaSqliteUrl } from "./scripts/sqlite-url.mjs";

const testDatabaseUrl = disposablePrismaSqliteUrl("test.db");

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup-env.ts", "./tests/setup.ts"],
    include: [
      "tests/unit/**/*.test.ts",
      "tests/integration/**/*.test.ts",
      "tests/security/**/*.test.ts",
    ],
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 20_000,
    hookTimeout: 30_000,
    env: {
      DATABASE_URL: testDatabaseUrl,
      AUTH_SECRET: "test-auth-secret-that-is-long-enough-32ch",
      UJRIS_RATE_LIMIT_MAX_BUCKETS: "32",
      NODE_ENV: "test",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
