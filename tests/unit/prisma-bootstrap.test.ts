import { describe, expect, it } from "vitest";
import { migrateDeploy } from "../../scripts/prisma-migrate.mjs";
import { e2eDatabaseUrl } from "../../scripts/e2e-prepare.mjs";

describe("portable prisma / e2e bootstrap", () => {
  it("refuses hosted URLs for migrate deploy", () => {
    expect(() => migrateDeploy("postgresql://user:pass@db.supabase.co:5432/postgres")).toThrow(/hosted|production/i);
  });

  it("refuses prisma/dev.db for migrate deploy", () => {
    expect(() => migrateDeploy("file:./dev.db")).toThrow(/dev\.db/);
  });

  it("e2e database url is an absolute disposable sqlite file under prisma/e2e.db", () => {
    const url = e2eDatabaseUrl();
    expect(url.startsWith("file:")).toBe(true);
    expect(url.replace(/\\/g, "/")).toMatch(/prisma\/e2e\.db$/);
    expect(url).not.toMatch(/dev\.db/);
  });
});
