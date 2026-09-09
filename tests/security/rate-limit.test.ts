import { describe, expect, it, beforeEach } from "vitest";
import {
  AUTH_RATE_MAX_ATTEMPTS,
  consumeAuthRateLimit,
  inspectAuthRateLimit,
  loginRateLimitKey,
  RATE_LIMITED_MESSAGE,
  resetRateLimitStoreForTests,
} from "@/lib/rate-limit";

describe("auth rate limiter", () => {
  beforeEach(() => {
    resetRateLimitStoreForTests();
  });

  it("allows a normal sequence of attempts under the cap", () => {
    const key = loginRateLimitKey("person@example.com");
    for (let i = 0; i < AUTH_RATE_MAX_ATTEMPTS; i++) {
      const result = consumeAuthRateLimit(key);
      expect(result.allowed).toBe(true);
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
      expect(blocked.message.toLowerCase()).not.toContain("account");
      expect(blocked.message.toLowerCase()).not.toContain("exist");
    }
  });

  it("uses the same limiter key for the same email regardless of casing so existence cannot be probed via limit differences", () => {
    const a = loginRateLimitKey("Pat@Example.com");
    const b = loginRateLimitKey("pat@example.com");
    expect(a).toBe(b);
  });

  it("fails open if the store throws (availability over lockout)", () => {
    const original = Map.prototype.get;
    Map.prototype.get = () => {
      throw new Error("store down");
    };
    try {
      const result = consumeAuthRateLimit("login:x@y.z");
      expect(result.allowed).toBe(true);
    } finally {
      Map.prototype.get = original;
    }
  });
});
