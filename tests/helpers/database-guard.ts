/**
 * Guards for disposable test databases. Never run destructive setup against
 * a URL that resembles hosted/production Postgres, or against prisma/dev.db.
 */
import {
  assertDisposableSqliteUrl,
  disposablePrismaSqliteUrl,
  sqliteUrlLooksLikeDevDb,
  sqliteUrlLooksLikeProduction,
} from "../../scripts/sqlite-url.mjs";

export function databaseUrlLooksLikeProduction(url: string | undefined): boolean {
  return sqliteUrlLooksLikeProduction(url);
}

export function resolveTestDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  if (env.UJRIS_ALLOW_DESTRUCTIVE_PROD_DB === "true") {
    throw new Error("UJRIS_ALLOW_DESTRUCTIVE_PROD_DB is not a supported override.");
  }
  if (env.NODE_ENV === "production" && env.UJRIS_ALLOW_TEST_IN_PRODUCTION !== "true") {
    throw new Error("Refusing destructive test DB setup because NODE_ENV=production.");
  }
  const incoming = env.DATABASE_URL;
  if (sqliteUrlLooksLikeProduction(incoming) || databaseUrlLooksLikeProduction(incoming)) {
    throw new Error(
      "Refusing destructive test DB setup: DATABASE_URL resembles a production/hosted database."
    );
  }
  if (sqliteUrlLooksLikeDevDb(incoming)) {
    throw new Error("Refusing destructive test DB setup against prisma/dev.db.");
  }
  return assertDisposableSqliteUrl(disposablePrismaSqliteUrl("test.db"), "vitest");
}
