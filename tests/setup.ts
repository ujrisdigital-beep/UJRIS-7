import { afterAll, beforeAll, vi } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { disconnectDb } from "@/lib/db";
import { resetRateLimitStoreForTests, stopRateLimitCleanup } from "@/lib/rate-limit";

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

try {
  const migrateScript = path.join(process.cwd(), "scripts", "prisma-migrate.mjs");
  const result = spawnSync(process.execPath, [migrateScript], {
    env: { ...process.env },
    encoding: "utf8",
    windowsHide: true,
    shell: false,
  });
  if (result.error || result.status !== 0) {
    const detail = `${result.error?.message ?? ""}\n${result.stderr ?? ""}\n${result.stdout ?? ""}`.trim();
    throw new Error(`prisma migrate deploy failed (${result.status}): ${detail}`);
  }
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
