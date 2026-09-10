#!/usr/bin/env node
/**
 * Create a disposable E2E SQLite database and apply migrations.
 * Never touches prisma/dev.db or a hosted URL.
 */
import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrateDeploy } from "./prisma-migrate.mjs";

export const E2E_DATABASE_URL = "file:./e2e.db";

function removeIfPresent(filePath) {
  if (existsSync(filePath)) {
    unlinkSync(filePath);
  }
}

export function prepareE2eDatabase(root = process.cwd()) {
  removeIfPresent(path.join(root, "e2e.db"));
  removeIfPresent(path.join(root, "e2e.db-journal"));
  migrateDeploy(E2E_DATABASE_URL);
  return E2E_DATABASE_URL;
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  prepareE2eDatabase();
  console.log(`E2E database ready at ${E2E_DATABASE_URL}`);
}
