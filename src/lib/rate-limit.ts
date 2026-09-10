/**
 * Interim in-memory rate limiter for authentication endpoints.
 *
 * Storage: process-local Map. Keys are `action:` + SHA-256 prefix of the
 * normalised email — never the raw email, password, token, or file bytes.
 *
 * Bounds (lazy, no global timer):
 * - Inactive buckets expire after AUTH_RATE_WINDOW_MS and are pruned on use.
 * - AUTH_RATE_MAX_BUCKETS cap with deterministic eviction:
 *   expired first, then least-recently-used buckets that are *not*
 *   currently limited. Currently-limited buckets are not evicted to
 *   create room for a new key (prevents a simple overflow bypass).
 *
 * Not production-grade. Not distributed. Not serverless-safe as a singleton
 * Map. Replace before multi-instance production (Supabase Auth / Redis / WAF).
 * Fail-open if the store throws.
 */

import { createHash } from "node:crypto";

export const AUTH_RATE_WINDOW_MS = 15 * 60 * 1000;
export const AUTH_RATE_MAX_ATTEMPTS = 5;
export function authRateMaxBuckets(): number {
  const n = Number(process.env.UJRIS_RATE_LIMIT_MAX_BUCKETS);
  return Number.isFinite(n) && n >= 4 ? n : 4096;
}

const GENERIC_AUTH_ERROR = "Unable to sign you in.";
export const GENERIC_ACCOUNT_ACTION_MESSAGE =
  "If an account exists for this email, you will receive further instructions.";
export const GENERIC_REGISTRATION_ERROR = "Unable to create an account with these details.";
export const RATE_LIMITED_MESSAGE = "Too many attempts. Please try again later.";

interface Bucket {
  count: number;
  resetAt: number;
  lastAccess: number;
}

const buckets = new Map<string, Bucket>();

let evictions = 0;
let expiredRemovals = 0;

function hashIdentity(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 24);
}

export function loginRateLimitKey(email: string): string {
  return `login:${hashIdentity(email)}`;
}

export function signupRateLimitKey(email: string): string {
  return `signup:${hashIdentity(email)}`;
}

export function recoveryRateLimitKey(email: string): string {
  return `recovery:${hashIdentity(email)}`;
}

export function verificationRateLimitKey(email: string): string {
  return `verify:${hashIdentity(email)}`;
}

export function rateLimitMetrics(): { bucketCount: number; evictions: number; expiredRemovals: number } {
  return { bucketCount: buckets.size, evictions, expiredRemovals };
}

export function resetRateLimitStoreForTests(): void {
  buckets.clear();
  evictions = 0;
  expiredRemovals = 0;
}

/** @deprecated No global timer is used. Kept so existing teardown calls remain safe. */
export function stopRateLimitCleanup(): void {
  // Lazy TTL pruning only — nothing to stop.
}

export function sweepRateLimitBuckets(now = Date.now()): number {
  let removed = 0;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
      removed += 1;
      expiredRemovals += 1;
    }
  }
  return removed;
}

function isLimited(bucket: Bucket, now: number): boolean {
  return bucket.resetAt > now && bucket.count >= AUTH_RATE_MAX_ATTEMPTS;
}

/**
 * Evict expired, then LRU non-limited. Never evict a currently-limited
 * bucket to admit a new identity.
 */
function evictToAdmitNew(now: number): boolean {
  sweepRateLimitBuckets(now);
  if (buckets.size < authRateMaxBuckets()) return true;

  let victim: string | null = null;
  let victimAccess = Infinity;
  for (const [key, bucket] of buckets) {
    if (isLimited(bucket, now)) continue;
    if (bucket.lastAccess < victimAccess) {
      victim = key;
      victimAccess = bucket.lastAccess;
    }
  }
  if (!victim) return false;
  buckets.delete(victim);
  evictions += 1;
  return true;
}

export type RateLimitDecision =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterSec: number; message: string };

function deny(retryAfterSec: number): RateLimitDecision {
  return { allowed: false, retryAfterSec, message: RATE_LIMITED_MESSAGE };
}

export function inspectAuthRateLimit(key: string, now = Date.now()): RateLimitDecision {
  try {
    sweepRateLimitBuckets(now);
    const existing = buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      return { allowed: true, remaining: AUTH_RATE_MAX_ATTEMPTS };
    }
    if (existing.count >= AUTH_RATE_MAX_ATTEMPTS) {
      return deny(Math.max(1, Math.ceil((existing.resetAt - now) / 1000)));
    }
    return { allowed: true, remaining: AUTH_RATE_MAX_ATTEMPTS - existing.count };
  } catch {
    return { allowed: true, remaining: AUTH_RATE_MAX_ATTEMPTS };
  }
}

export function consumeAuthRateLimit(key: string, now = Date.now()): RateLimitDecision {
  try {
    sweepRateLimitBuckets(now);
    const existing = buckets.get(key);
    if (existing && existing.resetAt > now) {
      existing.count += 1;
      existing.lastAccess = now;
      if (existing.count > AUTH_RATE_MAX_ATTEMPTS) {
        return deny(Math.max(1, Math.ceil((existing.resetAt - now) / 1000)));
      }
      return { allowed: true, remaining: AUTH_RATE_MAX_ATTEMPTS - existing.count };
    }

    if (!existing || existing.resetAt <= now) {
      if (existing && existing.resetAt <= now) {
        buckets.delete(key);
        expiredRemovals += 1;
      }
      if (buckets.size >= authRateMaxBuckets() && !evictToAdmitNew(now)) {
        return deny(60);
      }
      buckets.set(key, { count: 1, resetAt: now + AUTH_RATE_WINDOW_MS, lastAccess: now });
      return { allowed: true, remaining: AUTH_RATE_MAX_ATTEMPTS - 1 };
    }

    return { allowed: true, remaining: AUTH_RATE_MAX_ATTEMPTS };
  } catch {
    return { allowed: true, remaining: AUTH_RATE_MAX_ATTEMPTS };
  }
}

export { GENERIC_AUTH_ERROR };
