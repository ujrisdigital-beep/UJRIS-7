/**
 * Interim in-memory rate limiter for authentication endpoints.
 *
 * Storage strategy: process-local `Map`. Keys are opaque bucket strings
 * (e.g. `login:<normalized-email>`). Values are `{ count, resetAt }`.
 *
 * Limitations (not production-grade, not distributed):
 * - Does not work across multiple Node processes / serverless instances.
 * - State is lost on restart.
 * - An attacker can rotate IPs; we key primarily by email so stuffing a
 *   single account is still bounded on one instance.
 *
 * Fail-safe: unexpected exceptions inside the limiter allow the request
 * (fail-open) and are the reason this must be replaced with a shared store
 * (e.g. Supabase / Redis / WAF) during production migration. The limiter
 * itself is still enforced on the happy path.
 *
 * This is not a substitute for Supabase Auth / MFA / WAF.
 */

export const AUTH_RATE_WINDOW_MS = 15 * 60 * 1000;
export const AUTH_RATE_MAX_ATTEMPTS = 5;

const GENERIC_AUTH_ERROR = "Incorrect email or password.";
export const RATE_LIMITED_MESSAGE = "Too many attempts. Please try again later.";

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export function resetRateLimitStoreForTests(): void {
  buckets.clear();
}

export type RateLimitDecision =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterSec: number; message: string };

export function inspectAuthRateLimit(key: string, now = Date.now()): RateLimitDecision {
  try {
    const existing = buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      return { allowed: true, remaining: AUTH_RATE_MAX_ATTEMPTS };
    }
    if (existing.count >= AUTH_RATE_MAX_ATTEMPTS) {
      return {
        allowed: false,
        retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
        message: RATE_LIMITED_MESSAGE,
      };
    }
    return { allowed: true, remaining: AUTH_RATE_MAX_ATTEMPTS - existing.count };
  } catch {
    return { allowed: true, remaining: AUTH_RATE_MAX_ATTEMPTS };
  }
}

/** Consume one attempt. Call after the request is well-formed, whether or not the account exists. */
export function consumeAuthRateLimit(key: string, now = Date.now()): RateLimitDecision {
  try {
    const existing = buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + AUTH_RATE_WINDOW_MS });
      return { allowed: true, remaining: AUTH_RATE_MAX_ATTEMPTS - 1 };
    }
    existing.count += 1;
    if (existing.count > AUTH_RATE_MAX_ATTEMPTS) {
      return {
        allowed: false,
        retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
        message: RATE_LIMITED_MESSAGE,
      };
    }
    return { allowed: true, remaining: AUTH_RATE_MAX_ATTEMPTS - existing.count };
  } catch {
    return { allowed: true, remaining: AUTH_RATE_MAX_ATTEMPTS };
  }
}

export function loginRateLimitKey(email: string): string {
  return `login:${email.trim().toLowerCase()}`;
}

export function signupRateLimitKey(email: string): string {
  return `signup:${email.trim().toLowerCase()}`;
}

export { GENERIC_AUTH_ERROR };
