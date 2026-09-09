import { beforeEach, describe, expect, it } from "vitest";
import { resetTestDatabase } from "../helpers/db";
import { seedUser } from "../helpers/seed";
import {
  loginAction,
  requestPasswordResetAction,
  resendVerificationAction,
  signupAction,
} from "@/lib/actions/auth";
import {
  GENERIC_ACCOUNT_ACTION_MESSAGE,
  GENERIC_AUTH_ERROR,
  GENERIC_REGISTRATION_ERROR,
  resetRateLimitStoreForTests,
} from "@/lib/rate-limit";

function form(entries: Record<string, string>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(entries)) data.set(k, v);
  return data;
}

describe("auth enumeration boundaries", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    resetRateLimitStoreForTests();
  });

  it("login uses the same error for unknown and known-bad passwords", async () => {
    await seedUser("known@example.com");
    const missing = await loginAction(undefined, form({ email: "missing@example.com", password: "password12" }));
    const wrong = await loginAction(undefined, form({ email: "known@example.com", password: "wrong-pass" }));
    expect(missing).toEqual({ ok: false, error: GENERIC_AUTH_ERROR });
    expect(wrong).toEqual({ ok: false, error: GENERIC_AUTH_ERROR });
    expect(missing.error).toBe(wrong.error);
  });

  it("signup does not say that an account exists", async () => {
    await seedUser("taken@example.com");
    const result = await signupAction(
      undefined,
      form({ name: "Alex Claimant", email: "taken@example.com", password: "password12" })
    );
    expect(result.ok).toBe(false);
    expect(result.error).toBe(GENERIC_REGISTRATION_ERROR);
    expect(result.error?.toLowerCase()).not.toContain("already");
    expect(result.error?.toLowerCase()).not.toContain("exists");
  });

  it("password recovery is identical whether or not the account exists", async () => {
    await seedUser("recover@example.com");
    const known = await requestPasswordResetAction(undefined, form({ email: "recover@example.com" }));
    const unknown = await requestPasswordResetAction(undefined, form({ email: "no-such@example.com" }));
    expect(known).toEqual({ ok: true, message: GENERIC_ACCOUNT_ACTION_MESSAGE });
    expect(unknown).toEqual({ ok: true, message: GENERIC_ACCOUNT_ACTION_MESSAGE });
  });

  it("valid login still establishes a session", async () => {
    await seedUser("ok-login@example.com");
    await expect(
      loginAction(undefined, form({ email: "ok-login@example.com", password: "password12" }))
    ).rejects.toThrow(/REDIRECT:\/onboarding/);
  });

  it("verification resend is identical whether or not the account exists", async () => {
    await seedUser("verify@example.com");
    const known = await resendVerificationAction(undefined, form({ email: "verify@example.com" }));
    const unknown = await resendVerificationAction(undefined, form({ email: "absent@example.com" }));
    expect(known).toEqual({ ok: true, message: GENERIC_ACCOUNT_ACTION_MESSAGE });
    expect(unknown).toEqual({ ok: true, message: GENERIC_ACCOUNT_ACTION_MESSAGE });
  });
});
