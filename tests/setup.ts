import { afterAll, beforeAll, vi } from "vitest";
import { disconnectDb } from "@/lib/db";
import { resetRateLimitStoreForTests, stopRateLimitCleanup } from "@/lib/rate-limit";
import { resolveTestDatabaseUrl } from "./helpers/database-guard";
import { migrateDeploy } from "../scripts/prisma-migrate.mjs";

const cookieStore = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieStore.has(name) ? { name, value: cookieStore.get(name) } : undefined),
    set: (name: string, value: string) => {
      cookieStore.set(name, value);
    },
    delete: (name: string) => {
      cookieStore.delete(name);
    },
  }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    const error = new Error(`REDIRECT:${url}`);
    error.name = "NEXT_REDIRECT";
    throw error;
  },
}));

export function clearTestCookies(): void {
  cookieStore.clear();
}

export function setTestCookie(name: string, value: string): void {
  cookieStore.set(name, value);
}

export function getTestCookie(name: string): string | undefined {
  return cookieStore.get(name);
}

process.env.AUTH_SECRET = process.env.AUTH_SECRET || "test-auth-secret-that-is-long-enough-32ch";
const testDatabaseUrl = resolveTestDatabaseUrl(process.env);
process.env.DATABASE_URL = testDatabaseUrl;
if (process.env.UJRIS_ALLOW_DEV_BILLING === undefined) {
  process.env.UJRIS_ALLOW_DEV_BILLING = "";
}

try {
  migrateDeploy(testDatabaseUrl);
} catch (error) {
  console.error("Test database migration failed. Refusing to run tests against an unprepared database.");
  throw error;
}

beforeAll(() => {
  resetRateLimitStoreForTests();
});

afterAll(async () => {
  stopRateLimitCleanup();
  resetRateLimitStoreForTests();
  await disconnectDb();
});
