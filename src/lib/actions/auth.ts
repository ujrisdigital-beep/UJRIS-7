"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import {
  hashPassword,
  verifyPassword,
  setSessionCookie,
  revokeCurrentSessionAndClearCookie,
} from "@/lib/auth";
import { appendAuditLog } from "@/lib/audit";
import {
  consumeAuthRateLimit,
  loginRateLimitKey,
  signupRateLimitKey,
  recoveryRateLimitKey,
  verificationRateLimitKey,
  GENERIC_AUTH_ERROR,
  GENERIC_REGISTRATION_ERROR,
  GENERIC_ACCOUNT_ACTION_MESSAGE,
  RATE_LIMITED_MESSAGE,
} from "@/lib/rate-limit";

const DISPOSABLE_DOMAINS = new Set(["mailinator.com", "tempmail.com", "10minutemail.com", "guerrillamail.com", "yopmail.com"]);

/** Precomputed bcrypt hash so missing-user login does comparable work. Not a real password. */
const TIMING_HASH = "$2b$10$cVaYQ0XfLiF9NCzIsYMnGOx9o74aNcEDfo772KgDbI0nso96qQNq6";

const signupSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export interface AuthActionResult {
  ok: boolean;
  error?: string;
  message?: string;
}

export async function signupAction(_prev: AuthActionResult | undefined, formData: FormData): Promise<AuthActionResult> {
  const parsed = signupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid details" };
  }
  const { name, email, password } = parsed.data;

  const rate = consumeAuthRateLimit(signupRateLimitKey(email));
  if (!rate.allowed) {
    return { ok: false, error: RATE_LIMITED_MESSAGE };
  }

  const domain = email.split("@")[1];
  if (domain && DISPOSABLE_DOMAINS.has(domain)) {
    return { ok: false, error: GENERIC_REGISTRATION_ERROR };
  }

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    await verifyPassword(password, existing.passwordHash);
    await appendAuditLog({ action: "SIGNUP_REJECTED_GENERIC", detail: "existing_or_unusable" });
    return { ok: false, error: GENERIC_REGISTRATION_ERROR };
  }

  const passwordHash = await hashPassword(password);
  const user = await db.user.create({
    data: {
      name,
      email,
      passwordHash,
      role: "claimant",
      plan: "free",
      subscription: { create: { plan: "free", status: "active" } },
    },
  });

  await appendAuditLog({ userId: user.id, action: "USER_SIGNED_UP", detail: `email=${email}` });
  await setSessionCookie({ userId: user.id, email: user.email, name: user.name, role: user.role });
  redirect("/onboarding");
}

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

export async function loginAction(_prev: AuthActionResult | undefined, formData: FormData): Promise<AuthActionResult> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid details" };
  }
  const { email, password } = parsed.data;

  const rate = consumeAuthRateLimit(loginRateLimitKey(email));
  if (!rate.allowed) {
    return { ok: false, error: RATE_LIMITED_MESSAGE };
  }

  const user = await db.user.findUnique({ where: { email } });
  const hash = user?.passwordHash ?? TIMING_HASH;
  const valid = await verifyPassword(password, hash);
  if (!user || !valid) {
    if (user) {
      await appendAuditLog({ userId: user.id, action: "LOGIN_FAILED", detail: "credentials" });
    }
    return { ok: false, error: GENERIC_AUTH_ERROR };
  }

  await appendAuditLog({ userId: user.id, action: "USER_LOGGED_IN" });
  await setSessionCookie({ userId: user.id, email: user.email, name: user.name, role: user.role });

  const existingCase = await db.case.findFirst({ where: { userId: user.id }, orderBy: { updatedAt: "desc" } });
  redirect(existingCase ? "/home" : "/onboarding");
}

export async function logoutAction(): Promise<void> {
  await revokeCurrentSessionAndClearCookie();
  redirect("/");
}

const emailOnlySchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
});

/** Always the same external message. No mailer is configured in Step 2A. */
export async function requestPasswordResetAction(
  _prev: AuthActionResult | undefined,
  formData: FormData
): Promise<AuthActionResult> {
  const parsed = emailOnlySchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid details" };
  }
  const rate = consumeAuthRateLimit(recoveryRateLimitKey(parsed.data.email));
  if (!rate.allowed) {
    return { ok: false, error: RATE_LIMITED_MESSAGE };
  }
  const user = await db.user.findUnique({ where: { email: parsed.data.email } });
  await verifyPassword("timing", user?.passwordHash ?? TIMING_HASH);
  await appendAuditLog({
    userId: user?.id ?? null,
    action: "PASSWORD_RESET_REQUESTED",
    detail: "generic_response",
  });
  return { ok: true, message: GENERIC_ACCOUNT_ACTION_MESSAGE };
}

export async function resendVerificationAction(
  _prev: AuthActionResult | undefined,
  formData: FormData
): Promise<AuthActionResult> {
  const parsed = emailOnlySchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid details" };
  }
  const rate = consumeAuthRateLimit(verificationRateLimitKey(parsed.data.email));
  if (!rate.allowed) {
    return { ok: false, error: RATE_LIMITED_MESSAGE };
  }
  const user = await db.user.findUnique({ where: { email: parsed.data.email } });
  await verifyPassword("timing", user?.passwordHash ?? TIMING_HASH);
  await appendAuditLog({
    userId: user?.id ?? null,
    action: "VERIFICATION_RESEND_REQUESTED",
    detail: "generic_response",
  });
  return { ok: true, message: GENERIC_ACCOUNT_ACTION_MESSAGE };
}
