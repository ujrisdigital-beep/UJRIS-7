#!/usr/bin/env node
/**
 * Resolve Prisma's JS CLI and run migrate deploy with process.execPath.
 * No npx, no platform shims, no shell.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePackageBin, spawnNodeEntrySync } from "./command-runner.mjs";
import { assertDisposableSqliteUrl } from "./sqlite-url.mjs";

export { resolvePackageBin } from "./command-runner.mjs";

export function migrateDeploy(databaseUrl) {
  assertDisposableSqliteUrl(databaseUrl, "prisma migrate");
  const prismaBin = resolvePackageBin("prisma", "prisma");
  const result = spawnNodeEntrySync(prismaBin, ["migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "pipe",
    encoding: "utf8",
  });
  if (result.error) {
    throw new Error(`prisma migrate deploy failed to launch: ${result.error.message}`);
  }
  if (result.signal) {
    throw new Error(`prisma migrate deploy terminated by signal ${result.signal}`);
  }
  if (result.status !== 0) {
    const detail = `${result.stderr || ""}\n${result.stdout || ""}`.trim();
    throw new Error(`prisma migrate deploy failed (${result.status}): ${detail}`);
  }
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const url = process.env.DATABASE_URL;
  try {
    migrateDeploy(url);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
