/**
 * First Vitest setup file. Sets DATABASE_URL before any Prisma import.
 * Must not import @/lib/db or Prisma.
 */
import { resolveTestDatabaseUrl } from "./helpers/database-guard";

process.env.AUTH_SECRET = process.env.AUTH_SECRET || "test-auth-secret-that-is-long-enough-32ch";
process.env.DATABASE_URL = resolveTestDatabaseUrl(process.env);
if (process.env.UJRIS_ALLOW_DEV_BILLING === undefined) {
  process.env.UJRIS_ALLOW_DEV_BILLING = "";
}
