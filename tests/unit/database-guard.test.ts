import { describe, expect, it } from "vitest";
import { databaseUrlLooksLikeProduction, resolveTestDatabaseUrl } from "../helpers/database-guard";
import {
  assertDisposableSqliteUrl,
  disposablePrismaSqliteUrl,
  sqliteUrlLooksLikeDevDb,
} from "../../scripts/sqlite-url.mjs";

describe("test database guard", () => {
  it("treats sqlite file URLs as safe and non-production", () => {
    expect(databaseUrlLooksLikeProduction("file:./test.db")).toBe(false);
    expect(databaseUrlLooksLikeProduction(disposablePrismaSqliteUrl("test.db"))).toBe(false);
  });

  it("refuses hosted postgres-shaped URLs", () => {
    expect(databaseUrlLooksLikeProduction("postgresql://user:pass@db.supabase.co:5432/postgres")).toBe(true);
    expect(() =>
      resolveTestDatabaseUrl({
        DATABASE_URL: "postgresql://user:pass@db.supabase.co:5432/postgres",
        NODE_ENV: "test",
      })
    ).toThrow(/production/i);
  });

  it("refuses prisma/dev.db for destructive test setup", () => {
    expect(sqliteUrlLooksLikeDevDb("file:./dev.db")).toBe(true);
    expect(sqliteUrlLooksLikeDevDb("file:C:/repo/prisma/dev.db")).toBe(true);
    expect(() =>
      resolveTestDatabaseUrl({ DATABASE_URL: "file:./dev.db", NODE_ENV: "test" })
    ).toThrow(/dev\.db/);
    expect(() => assertDisposableSqliteUrl("file:./dev.db")).toThrow(/dev\.db/);
  });

  it("returns an owned disposable sqlite url under prisma/test.db", () => {
    const url = resolveTestDatabaseUrl({ NODE_ENV: "test" });
    expect(url.startsWith("file:")).toBe(true);
    expect(url.replace(/\\/g, "/")).toMatch(/prisma\/test\.db$/);
    expect(url).not.toMatch(/dev\.db/);
  });

  it("refuses NODE_ENV=production", () => {
    expect(() =>
      resolveTestDatabaseUrl({ NODE_ENV: "production", DATABASE_URL: disposablePrismaSqliteUrl("test.db") })
    ).toThrow(/NODE_ENV=production/);
  });
});
