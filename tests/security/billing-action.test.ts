import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetTestDatabase } from "../helpers/db";
import { loginAs, seedUser } from "../helpers/seed";
import { startCheckoutAction } from "@/lib/actions/billing";

describe("billing server action fail-closed", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_PRICE_PROTECT;
    process.env.UJRIS_ALLOW_DEV_BILLING = "";
  });

  it("does not activate a paid plan when Stripe is missing", async () => {
    const user = await seedUser();
    await loginAs(user);
    const result = await startCheckoutAction("protect");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not configured/i);
    const stored = await db.user.findUnique({ where: { id: user.id } });
    expect(stored?.plan).toBe("free");
    expect(await db.subscription.findUnique({ where: { userId: user.id } })).toBeNull();
  });

  it("rejects an unknown plan id at the action boundary", async () => {
    const user = await seedUser();
    await loginAs(user);
    const result = await startCheckoutAction("superadmin");
    expect(result.ok).toBe(false);
    expect((await db.user.findUnique({ where: { id: user.id } }))?.plan).toBe("free");
  });

  it("requires an authenticated session", async () => {
    const result = await startCheckoutAction("protect");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/log in/i);
  });
});
