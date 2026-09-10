/**
 * Guards for disposable test databases. Never run destructive setup against
 * a URL that resembles hosted/production Postgres.
 */

const PRODUCTION_URL = /postgres(?:ql)?:\/\//i;
const HOSTED_HINT = /supabase|neon\.tech|amazonaws\.com|azure|gcp|prisma\+postgres|prod/i;

export function databaseUrlLooksLikeProduction(url: string | undefined): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  if (trimmed.startsWith("file:")) return false;
  if (PRODUCTION_URL.test(trimmed)) return true;
  if (HOSTED_HINT.test(trimmed)) return true;
  return false;
}

export function resolveTestDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  if (env.UJRIS_ALLOW_DESTRUCTIVE_PROD_DB === "true") {
    throw new Error("UJRIS_ALLOW_DESTRUCTIVE_PROD_DB is not a supported override.");
  }
  if (env.NODE_ENV === "production" && env.UJRIS_ALLOW_TEST_IN_PRODUCTION !== "true") {
    throw new Error("Refusing destructive test DB setup because NODE_ENV=production.");
  }
  const incoming = env.DATABASE_URL;
  if (databaseUrlLooksLikeProduction(incoming)) {
    throw new Error(
      "Refusing destructive test DB setup: DATABASE_URL resembles a production/hosted database."
    );
  }
  return "file:./test.db";
}
