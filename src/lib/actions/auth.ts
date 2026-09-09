"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword, setSessionCookie, clearSessionCookie } from "@/lib/auth";
import { appendAuditLog } from "@/lib/audit";

const DISPOSABLE_DOMAINS = new Set(["mailinator.com", "tempmail.com", "10minutemail.com", "guerrillamail.com", "yopmail.com"]);

const signupSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export interface AuthActionResult {
  ok: boolean;
  error?: string;
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
  const domain = email.split("@")[1];
  if (domain && DISPOSABLE_DOMAINS.has(domain)) {
    return { ok: false, error: "Please use a permanent email address." };
  }

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return { ok: false, error: "An account with that email already exists. Try logging in instead." };
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
  const user = await db.user.findUnique({ where: { email } });
  if (!user) {
    return { ok: false, error: "Incorrect email or password." };
  }
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    await appendAuditLog({ userId: user.id, action: "LOGIN_FAILED", detail: `email=${email}` });
    return { ok: false, error: "Incorrect email or password." };
  }

  await appendAuditLog({ userId: user.id, action: "USER_LOGGED_IN" });
  await setSessionCookie({ userId: user.id, email: user.email, name: user.name, role: user.role });

  const existingCase = await db.case.findFirst({ where: { userId: user.id }, orderBy: { updatedAt: "desc" } });
  redirect(existingCase ? "/home" : "/onboarding");
}

export async function logoutAction(): Promise<void> {
  await clearSessionCookie();
  redirect("/");
}
