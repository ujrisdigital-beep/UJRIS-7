import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AUTH_RATE_MAX_ATTEMPTS,
  consumeAuthRateLimit,
  inspectAuthRateLimit,
  loginRateLimitKey,
  RATE_LIMITED_MESSAGE,
  rateLimitMetrics,
  resetRateLimitStoreForTests,
  stopRateLimitCleanup,
  sweepRateLimitBuckets,
} from "@/lib/rate-limit";

describe("auth rate limiter", () => {
  beforeEach(() => {
    resetRateLimitStoreForTests();
  });

  afterEach(() => {
    stopRateLimitCleanup();
    resetRateLimitStoreForTests();
  });

  it("allows a normal sequence of attempts under the cap", () => {
    const key = loginRateLimitKey("person@example.com");
    for (let i = 0; i < AUTH_RATE_MAX_ATTEMPTS; i++) {
      expect(consumeAuthRateLimit(key).allowed).toBe(true);
    }
  });

  it("rate-limits further attempts with a generic message", () => {
    const key = loginRateLimitKey("person@example.com");
    for (let i = 0; i < AUTH_RATE_MAX_ATTEMPTS + 1; i++) {
      consumeAuthRateLimit(key);
    }
    const blocked = inspectAuthRateLimit(key);
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) {
      expect(blocked.message).toBe(RATE_LIMITED_MESSAGE);
    }
  });

  it("reuses one bucket for normalised account variants", () => {
    consumeAuthRateLimit(loginRateLimitKey("Pat@Example.com"));
    consumeAuthRateLimit(loginRateLimitKey(" pat@example.com "));
    expect(rateLimitMetrics().bucketCount).toBe(1);
    expect(loginRateLimitKey("Pat@Example.com")).toBe(loginRateLimitKey("pat@example.com"));
    expect(loginRateLimitKey("pat@example.com")).not.toContain("pat@example.com");
  });

  it("removes expired buckets", () => {
    const key = loginRateLimitKey("expire@example.com");
    const now = Date.now();
    consumeAuthRateLimit(key, now);
    expect(rateLimitMetrics().bucketCount).toBe(1);
    sweepRateLimitBuckets(now + 16 * 60 * 1000);
    expect(rateLimitMetrics().bucketCount).toBe(0);
  });

  it("limits parallel attempts on the same key", async () => {
    const key = loginRateLimitKey("parallel@example.com");
    const results = await Promise.all(
      Array.from({ length: AUTH_RATE_MAX_ATTEMPTS + 3 }, () => Promise.resolve(consumeAuthRateLimit(key)))
    );
    expect(results.filter((r) => !r.allowed).length).toBeGreaterThanOrEqual(3);
  });

  it("enforces a maximum bucket count without evicting an active limited key", () => {
    const max = Number(process.env.UJRIS_RATE_LIMIT_MAX_BUCKETS);
    const now = Date.now();
    const limited = loginRateLimitKey("abuser@example.com");
    for (let i = 0; i <= AUTH_RATE_MAX_ATTEMPTS; i++) {
      consumeAuthRateLimit(limited, now);
    }
    expect(inspectAuthRateLimit(limited, now).allowed).toBe(false);

    for (let i = 0; i < max + 5; i++) {
      consumeAuthRateLimit(loginRateLimitKey(`filler-${i}@example.com`), now + i);
    }
    expect(rateLimitMetrics().bucketCount).toBeLessThanOrEqual(max);
    expect(inspectAuthRateLimit(limited, now).allowed).toBe(false);
    expect(consumeAuthRateLimit(limited, now).allowed).toBe(false);
  });

  it("fails open if the store throws", () => {
    const original = Map.prototype.get;
    Map.prototype.get = () => {
      throw new Error("store down");
    };
    try {
      expect(consumeAuthRateLimit("login:x").allowed).toBe(true);
    } finally {
      Map.prototype.get = original;
    }
  });

  it("exposes metrics without identifiers", () => {
    consumeAuthRateLimit(loginRateLimitKey("metric@example.com"));
    const metrics = rateLimitMetrics();
    expect(metrics.bucketCount).toBe(1);
    expect(JSON.stringify(metrics)).not.toContain("metric@example.com");
  });
});
