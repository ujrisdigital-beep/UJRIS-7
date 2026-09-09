# Step 2A test quality review

Review of tests at failed head `fd78b1e059d9216e03f237145625eacac009a870`.
Remediation notes below do not constitute a PASS.

## Defects at the failed head

### Tautology

`tests/unit/date-inference.test.ts` contained:

```ts
expect(laterWouldBeLessUrgent === conservative || true).toBe(true);
```

This cannot fail.

### Helper presented as security proof

| Claim | What the test actually called |
|---|---|
| HTML/SVG cannot execute on origin | `buildEvidenceDownloadHeaders` only |
| Logout invalidates session | `issueSession` / `verifySessionToken` only |
| Rate limit on login | `consumeAuthRateLimit` only |
| User A cannot refresh User B | `refreshCaseIntelligenceForOwner` only |

None of those issued an HTTP request through `GET /api/evidence/[id]/file`
or a cookie-backed server action as the primary assertion.

### Missing denials

No tests for:

- Unauthenticated evidence download
- Non-owner evidence download
- Malformed evidence id
- Revoked session on the file route
- Denied request has no custody side effect
- Parallel conflicting requests on the file route
- Route-level account enumeration
- Acknowledgement must not change urgency
- `31 February` rejected (invalid dates were only loosely covered)

### Environment

- Typecheck depended on `.next/types` from a prior build
- `next-env.d.ts` gitignored
- E2E not in CI; managed-server teardown undocumented
- Prisma connections / limiter timers had no explicit test teardown

## Required replacements (remediation contract)

Keep algorithm unit tests. Add boundary tests that use:

- The actual route module or Playwright HTTP
- Session cookie / token
- Persistent SQLite test DB
- Assertions on status, headers, and side effects

Remove or replace tautologies.

## Remediation status (implementation)

| Gap | Replacement |
|---|---|
| Tautological deadline assert | Removed; strict-date + inference tests assert concrete statuses |
| Evidence helper-only | `tests/security/evidence-route.test.ts` calls `GET` |
| Session helper-only | Route + action tests with real `AuthSession` cookie |
| Ownership helper-only | Kept unit ownership test; added action/route denials |
| Auth limiter helper-only | Kept algorithm tests; added `loginAction` / signup / recovery |
| Urgency | `tests/integration/deadline-urgency.test.ts` |
| Clean checkout | `next typegen` in `typecheck`; committed `next-env.d.ts` |
| Teardown | Vitest `afterAll` disconnect + limiter `unref` / stop |
