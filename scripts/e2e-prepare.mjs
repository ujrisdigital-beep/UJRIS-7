#!/usr/bin/env node
/**
 * Create a disposable E2E SQLite database and apply migrations.
 * Never touches prisma/dev.db or a hosted URL.
 */
import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrateDeploy } from "./prisma-migrate.mjs";
import { assertDisposableSqliteUrl, disposablePrismaSqliteUrl } from "./sqlite-url.mjs";

export function e2eDatabaseUrl(root = process.cwd()) {
  return assertDisposableSqliteUrl(disposablePrismaSqliteUrl("e2e.db", root), "e2e");
}

export const E2E_DATABASE_URL = e2eDatabaseUrl();

function removeIfPresent(filePath) {
  if (existsSync(filePath)) {
    unlinkSync(filePath);
  }
}

export function prepareE2eDatabase(root = process.cwd()) {
  const url = e2eDatabaseUrl(root);
  assertDisposableSqliteUrl(url, "e2e");
  removeIfPresent(path.join(root, "e2e.db"));
  removeIfPresent(path.join(root, "e2e.db-journal"));
  removeIfPresent(path.join(root, "prisma", "e2e.db"));
  removeIfPresent(path.join(root, "prisma", "e2e.db-journal"));
  migrateDeploy(url);
  return url;
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const url = prepareE2eDatabase();
  console.log(`E2E database ready at ${url}`);
}
