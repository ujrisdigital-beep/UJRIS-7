import { execSync } from "node:child_process";

// Always isolate tests from prisma/dev.db. Vite/Vitest may load `.env`,
// so we overwrite rather than using `||`.
process.env.AUTH_SECRET = process.env.AUTH_SECRET || "test-auth-secret-that-is-long-enough-32ch";
process.env.DATABASE_URL = "file:./test.db";
if (process.env.UJRIS_ALLOW_DEV_BILLING === undefined) {
  process.env.UJRIS_ALLOW_DEV_BILLING = "";
}

execSync("npx prisma migrate deploy", {
  env: { ...process.env, DATABASE_URL: "file:./test.db" },
  stdio: "pipe",
});
