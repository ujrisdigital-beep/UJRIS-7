import { describe, expect, it } from "vitest";
import { isDevBillingSimulationAllowed, isPlanId, resolvePaidCheckoutPath } from "@/lib/billing-mode";

describe("billing fail-closed", () => {
  it("does not grant a paid path when Stripe is missing and simulation is off", () => {
    const path = resolvePaidCheckoutPath({
      stripeConfigured: false,
      env: { NODE_ENV: "development" },
    });
    expect(path).toBe("fail_closed");
  });

  it("rejects invalid plan identifiers", () => {
    expect(isPlanId("protect")).toBe(true);
    expect(isPlanId("enterprise")).toBe(false);
    expect(isPlanId("admin")).toBe(false);
    expect(isPlanId({ plan: "advocate" })).toBe(false);
  });

  it("ignores a frontend payload that tries to escalate to an unknown privileged plan", () => {
    expect(isPlanId("superadmin")).toBe(false);
    expect(isPlanId("practice_unlimited")).toBe(false);
  });

  it("cannot enable simulation when NODE_ENV is production even if the flag is set", () => {
    expect(
      isDevBillingSimulationAllowed({
        NODE_ENV: "production",
        UJRIS_ALLOW_DEV_BILLING: "true",
      })
    ).toBe(false);
    expect(
      resolvePaidCheckoutPath({
        stripeConfigured: false,
        env: { NODE_ENV: "production", UJRIS_ALLOW_DEV_BILLING: "true" },
      })
    ).toBe("fail_closed");
  });

  it("allows explicit non-production simulation only when flagged", () => {
    expect(
      resolvePaidCheckoutPath({
        stripeConfigured: false,
        env: { NODE_ENV: "development", UJRIS_ALLOW_DEV_BILLING: "true" },
      })
    ).toBe("dev_simulation");
  });

  it("uses Stripe when configured", () => {
    expect(resolvePaidCheckoutPath({ stripeConfigured: true, env: { NODE_ENV: "production" } })).toBe("stripe");
  });
});
