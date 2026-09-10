/**
 * Absolute Prisma SQLite URLs. Relative file: URLs are schema-relative and
 * host-dependent. Destructive test setup must never target hosted DBs or dev.db.
 */
import path from "node:path";

export function toPrismaSqliteUrl(filePath) {
  const abs = path.resolve(filePath);
  const posix = abs.replace(/\\/g, "/");
  return `file:${posix}`;
}

export function sqliteUrlLooksLikeDevDb(url) {
  if (!url) return false;
  const pathPart = url.replace(/^file:/, "").split("?")[0];
  return /(?:^|[\\/])dev\.db(?:-journal)?$/i.test(pathPart);
}

export function sqliteUrlLooksLikeProduction(url) {
  if (!url) return false;
  const trimmed = url.trim();
  if (trimmed.startsWith("file:")) return false;
  if (/postgres(?:ql)?:\/\//i.test(trimmed)) return true;
  if (/supabase|neon\.tech|amazonaws\.com|azure|gcp|prisma\+postgres|\bprod\b/i.test(trimmed)) return true;
  return false;
}

export function disposablePrismaSqliteUrl(fileName, root = process.cwd()) {
  if (fileName === "dev.db") {
    throw new Error("Refusing to use prisma/dev.db as a disposable test database.");
  }
  return toPrismaSqliteUrl(path.join(root, "prisma", fileName));
}

export function assertDisposableSqliteUrl(url, label = "database") {
  if (!url) {
    throw new Error(`${label}: DATABASE_URL is required.`);
  }
  if (sqliteUrlLooksLikeProduction(url)) {
    throw new Error(`Refusing destructive ${label} setup: URL resembles a production/hosted database.`);
  }
  if (sqliteUrlLooksLikeDevDb(url)) {
    throw new Error(`Refusing destructive ${label} setup against prisma/dev.db.`);
  }
  if (!url.startsWith("file:")) {
    throw new Error(`Refusing destructive ${label} setup: only disposable SQLite file: URLs are allowed.`);
  }
  return url;
}
