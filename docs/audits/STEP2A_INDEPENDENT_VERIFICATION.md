# Step 2A independent verification

**Verdict (original review): FAIL**  
**Readiness at failed head: not production-ready**  
Only a new independent review may change this verdict.

## Review identity

| Field | Value |
|---|---|
| Reviewed range (failed) | Base `7e7f86da152100262d0c114f234f428b824d5fb3` → head `fd78b1e059d9216e03f237145625eacac009a870` |
| Branch | `step-2a-security-test-foundation` |
| Reviewer | Independent Step 2A verification (Codex) |
| Date of failed review | 2026-09-09 |

This document is the authoritative record of that failed review. Later sections
marked **Remediation** are implementation notes and must not be read as a PASS.

## Original blockers

### B1. Deadline confirmation is unsafe (highest priority)

`inferLimitationStart` returned `status: "confirmed"` and
`requiresConfirmation: false` whenever a single date token parsed. JavaScript
`Date` rollover meant values such as `31 February` could become a March civil
date and then be treated as settled fact.

A hearing mention could become the limitation start. Extracted dates had no
explicit confirmation action. Source events and derived deadlines were not
separated; derived deadlines did not record rule id, rule version, or
calculation inputs.

### B2. Acknowledgement suppresses urgency

`refreshCaseIntelligenceForOwner` ignored deadlines with `acknowledged: true`.
Seeing a warning therefore allowed a later refresh (or a new session that
refreshes) to drop case urgency without resolution, reason, or audit of a
downgrade.

### B3. Clean-checkout typecheck is not reproducible

`tsconfig.json` includes `.next/types/**/*.ts`. `next-env.d.ts` is gitignored
and references generated route types. `npm run typecheck` after `npm ci` on a
fresh tree fails unless a human previously ran `next build` or `next dev`.

### B4. Weak / tautological security tests

Examples at the failed head:

- Deadline test asserted `laterWouldBeLessUrgent === conservative || true`.
- Evidence “XSS” tests called `buildEvidenceDownloadHeaders` only — not
  `GET /api/evidence/[id]/file`.
- Session revocation and ownership tests called helpers, not HTTP routes.
- Rate-limit tests used in-memory keys containing raw email.

These do not prove the externally reachable denial.

### B5. Forensic findings lack persisted provenance/versioning

`FORENSIC_DOCUMENT_INSPECTOR.md` was design-only. Runtime findings remained a
JSON blob on `Evidence` with no schema version, rule version, source hashes,
confirmation, supersede linkage, or payload integrity hash.

### B6. Rate-limiter buckets unbounded

In-memory `Map` grew with distinct keys, used raw emails, had no expiry
sweep, no max size, no unref’d cleanup, and no metrics.

### B7. Account enumeration on registration

`signupAction` returned “An account with that email already exists.” Login
skipped a password check when the user row was missing (timing oracle).
No recovery/resend endpoints with uniform responses.

### B8. CI and dependency audit

CI omitted E2E and treated `npm audit --audit-level=high` as a bare failing
job with no exception policy. Playwright was undocumented as a required
managed-server path.

## Behaviours that passed (must be preserved)

- Session revocation via `AuthSession.revokedAt`
- Billing fail-closed without Stripe
- Forensic timestamp ordering (reversed pair ≠ later revision)
- Evidence + custody transaction rollback
- SHA-256 recompute verification
- Cross-user ownership on refresh helper
- Attachment + nosniff evidence delivery (algorithm)

## Remediation status (implementation, not a new verdict)

| Blocker | Status after remediation commits | Evidence |
|---|---|---|
| B1 Deadline confirmation | Addressed in implementation | `tests/unit/strict-date.test.ts`, `tests/unit/date-inference.test.ts`, `tests/integration/deadline-confirmation.test.ts` |
| B2 Urgency after ack | Addressed in implementation | `tests/integration/deadline-urgency.test.ts` |
| B3 Clean checkout | Addressed in implementation | `npm run typecheck` = `next typegen && tsc --noEmit`; `next-env.d.ts` committed |
| B4 Boundary tests | Addressed in implementation | `tests/security/*-route.test.ts`, `tests/e2e/security-boundaries.spec.ts` |
| B5 Forensic provenance | Addressed in implementation | `ForensicFinding` model + `tests/integration/forensic-findings.test.ts` |
| B6 Limiter bounds | Addressed in implementation | `tests/security/rate-limit.test.ts` |
| B7 Enumeration | Partially addressed; residual documented | `tests/security/auth-enumeration.test.ts`, residual-risk report |
| B8 CI / advisories | Addressed in implementation | `.github/workflows/ci.yml`, `scripts/dependency-policy.mjs` |

**Independent review verdict remains FAIL until a new review of the
remediation head is completed.**
