import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: [
      "tests/unit/**/*.test.ts",
      "tests/integration/**/*.test.ts",
      "tests/security/**/*.test.ts",
    ],
    fileParallelism: false,
    sequence: { concurrent: false },
    env: {
      DATABASE_URL: "file:./test.db",
      AUTH_SECRET: "test-auth-secret-that-is-long-enough-32ch",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
