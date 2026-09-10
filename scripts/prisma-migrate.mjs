#!/usr/bin/env node
/**
 * Resolve package bins and run Prisma migrate without npx/PATH fragility.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

export function resolvePackageBin(pkg, binName) {
  const pkgJsonPath = require.resolve(`${pkg}/package.json`);
  const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
  const binField = pkgJson.bin;
  const rel = typeof binField === "string" ? binField : binField?.[binName];
  if (!rel) {
    throw new Error(`Package ${pkg} has no bin named ${binName}`);
  }
  return path.resolve(path.dirname(pkgJsonPath), rel);
}

export function migrateDeploy(databaseUrl) {
  const prismaBin = resolvePackageBin("prisma", "prisma");
  const result = spawnSync(process.execPath, [prismaBin, "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "pipe",
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) {
    const detail = `${result.stderr || ""}\n${result.stdout || ""}`.trim();
    throw new Error(`prisma migrate deploy failed (${result.status}): ${detail}`);
  }
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }
  try {
    migrateDeploy(url);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
