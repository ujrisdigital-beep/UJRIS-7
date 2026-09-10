import { describe, expect, it } from "vitest";
import { databaseUrlLooksLikeProduction, resolveTestDatabaseUrl } from "../helpers/database-guard";

describe("test database guard", () => {
  it("treats sqlite file URLs as safe", () => {
    expect(databaseUrlLooksLikeProduction("file:./test.db")).toBe(false);
    expect(resolveTestDatabaseUrl({ DATABASE_URL: "file:./dev.db", NODE_ENV: "test" })).toBe("file:./test.db");
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

  it("refuses NODE_ENV=production", () => {
    expect(() => resolveTestDatabaseUrl({ NODE_ENV: "production", DATABASE_URL: "file:./test.db" })).toThrow(
      /NODE_ENV=production/
    );
  });
});
