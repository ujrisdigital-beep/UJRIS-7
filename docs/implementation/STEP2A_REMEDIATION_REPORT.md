# Step 2A remediation report

This is an implementation report. It does **not** mark the independent
review as PASS.

| Field | Value |
|---|---|
| Previous failed head | `fd78b1e059d9216e03f237145625eacac009a870` |
| New head | tip of `step-2a-security-test-foundation` after these remediation commits |
| Step 2B started | **No** |
| Merged to `main` | **No** |
| Independent review | Still **FAIL** until re-review of this head |

## Finding-by-finding resolution

| Blocker | Resolution | Tests |
|---|---|---|
| B1 Deadline confirmation | Strict civil-date round-trip; extraction never `confirmed`; hearing ≠ limitation; `confirmDeadlineAction` is the only confirmation; derived deadlines carry rule id/version/inputs | `tests/unit/strict-date.test.ts`, `tests/unit/date-inference.test.ts`, `tests/integration/deadline-confirmation.test.ts` |
| B2 Urgency after ack | Refresh uses unresolved deadlines only; ack cannot set urgency/resolution; `resolveDeadlineAction` requires reason + audit | `tests/integration/deadline-urgency.test.ts` |
| B3 Clean checkout | `npm run typecheck` = `next typegen && tsc --noEmit`; `next-env.d.ts` committed; tests force `file:./test.db` and fail if migrate fails | documented sequence below |
| B4 Weak tests | Tautology removed; `GET` evidence route + cookie-backed actions + Playwright HTTP 401 | `tests/security/evidence-route.test.ts`, `tests/security/auth-enumeration.test.ts`, `tests/e2e/security-boundaries.spec.ts` |
| B5 Forensic provenance | Additive `ForensicFinding` rows, append/version, payload hash, confirmation does not follow supersede | `tests/integration/forensic-findings.test.ts` |
| B6 Limiter bounds | Expiry sweep, max buckets, hashed keys, unref timer, metrics | `tests/security/rate-limit.test.ts` |
| B7 Enumeration | Uniform login/recovery/resend; signup existing-email generic error + dummy work | `tests/security/auth-enumeration.test.ts` — **residual**: successful new signup still redirects |
| B8 CI / advisories | Policy check with dated Prisma CLI exception; E2E in CI; artifacts on failure | `scripts/dependency-policy.mjs`, `.github/workflows/ci.yml` |

## Commands executed (this environment)

```bash
npm run typecheck    # PASS (next typegen && tsc --noEmit)
npm run lint         # PASS
npm test             # PASS — 79 tests, 0 skipped
npm run build        # PASS
npm run test:audit-policy  # PASS (3 high, all excepted Prisma CLI cluster)
npm audit --json     # 5 total (3 high, 2 moderate, 0 critical)
npm run test:e2e     # PASS — 4 tests, managed server started and stopped
```

Teardown: Vitest process exited 0 after `disconnectDb` + limiter `stopRateLimitCleanup`. Playwright webServer terminated with the test run.

## Counts

| Suite | Count |
|---|---|
| Unit | 32 |
| Security | 28 |
| Integration | 19 |
| E2E | 4 |
| Skipped | 0 |
| Advisories | high 3, moderate 2, critical 0 |

## Accepted dependency exception

`GHSA-ggr8-5vv4-36mx` (`deepmerge-ts` via Prisma 6 CLI / `@prisma/config`). Development-only, expires 2026-12-31. Snapshot: `docs/audits/npm-audit.step2a-remediation.json`.

## Remaining risks

See `docs/audits/STEP2A_RESIDUAL_RISK.md`. Principal residual: signup success vs generic failure can still indicate a registered email.

## Files changed (high level)

Deadline/date modules, `Deadline` + `ForensicFinding` schema/migration, auth/rate-limit, refresh/urgency, evidence route tests, CI/policy, audit docs, this report.
