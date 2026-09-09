# Step 2A — Security Stabilisation + Automated Test Foundation

Branch: `step-2a-security-test-foundation`  
Base: `UJRIS-7/main` at `7e7f86d`  
Supabase: **not** in this ticket.

## Exact findings addressed

From the Codex Step 1 audit (STEP 1 VERDICT: FAIL, 6 High findings plus dormant blockers):

| # | Finding | This ticket |
|---|---------|-------------|
| 1 | Evidence served as active HTML on the app origin | Fix + tests |
| 2 | Authentication lacks rate limits | Interim in-memory limiter + tests |
| 3 | Logout does not revoke captured session tokens | jti + `AuthSession` row; logout revokes + tests |
| 4 | Deadline inference can pick the wrong date and suppress urgency | Conservative/ambiguous date inference + tests |
| 5 | Billing fallback grants paid plans when Stripe is absent | Fail-closed; explicit non-production opt-in only |
| 6 | Evidence/custody writes lack atomicity and reliable integrity verification | Prisma transaction + SHA-256 recompute verification |
| 7 | Dormant exported helper lacks ownership checks | `refreshCaseIntelligence` (server action) — enforce owner |
| 8 | No automated test suite / CI | Vitest + Playwright + GitHub Actions |
| 9 | Forensic findings lack structured provenance | **Design only** (`FORENSIC_DOCUMENT_INSPECTOR.md`) |
| 10 | AI outputs lack grounding / cost monitoring | Out of scope (no expansion of UJU). Residual risk documented. |
| 11 | Reversed timestamp produced an incorrect forensic "later" finding | Deterministic timestamp rule + tests |

## Files expected to change

- `package.json` / lockfile — Vitest, Playwright, test scripts
- `vitest.config.ts`, `playwright.config.ts`, `tests/**`
- `.github/workflows/ci.yml`
- `prisma/schema.prisma` + additive migration (`AuthSession`)
- `src/lib/auth.ts` — jti, revocation lookup
- `src/lib/actions/auth.ts` — rate limit; persist/revoke sessions
- `src/lib/rate-limit.ts` (new)
- `src/lib/evidence-delivery.ts` (new)
- `src/lib/storage.ts` — path containment
- `src/app/api/evidence/[evidenceId]/file/route.ts` — attachment, nosniff, no active inline
- `src/lib/actions/billing.ts`, `src/lib/billing-mode.ts` (new)
- `src/lib/legal/date-inference.ts` (new), `src/lib/ai/heuristics.ts`, `src/lib/ai/gateway.ts`
- `src/lib/forensics/timestamps.ts` (new), `src/lib/forensics/evidence.ts`
- `src/lib/actions/evidence.ts`, `src/lib/evidence-integrity.ts` (new)
- `src/lib/actions/cases.ts`, `src/lib/cases/refresh-intelligence.ts` (new)
- `.env.example`, `PROJECT_STATE.md`, this file, implementation report, security matrix, forensic design doc

## Security implications

- Stops XSS via uploaded HTML/SVG served `inline` with attacker-controlled `Content-Type`.
- Slows credential stuffing (single-instance memory limiter only — not a distributed control).
- Makes logout actually revoke the JWT `jti` (interim until Supabase Auth).
- Stops unpaid users being granted Protect/Advocate because Stripe env vars are missing.
- Closes a callable server action that could recompute another tenant's case intelligence.

## Database implications

Additive only: new `AuthSession` table (`id`/`jti`, `userId`, `expiresAt`, `revokedAt`, timestamps, FK + indexes). No destructive changes. SQLite still the system of record for this ticket.

## Privacy implications

Rate-limiter keys are email + coarse request bucket in process memory; they are not persisted and must not be logged with passwords. Audit logs continue to avoid raw file bytes. Session rows store ids, not plaintext JWTs.

## Acceptance criteria

- `npm ci && npm run typecheck && npm run lint && npm run test && npm run build` succeed on a clean checkout.
- Regression tests exist and pass for findings 1–8 and 11 as specified in the ticket.
- Missing Stripe configuration never grants a paid plan.
- A captured JWT is unusable after logout.
- Uploaded HTML/SVG is not delivered as executable content on the app origin.
- Uncertain deadline input remains visibly uncertain and does not suppress urgency.
- Forensic "later" findings only fire when modification is actually after creation.
- CI workflow runs on push/PR without secrets.
- Branch is pushed; `main` is not merged.

## Rollback

Revert this branch. The `AuthSession` migration is additive; rolling back code without rolling back the table is safe (orphaned session rows). To fully undo, `prisma migrate resolve` / a down migration is documented in the implementation report. No production data exists in this environment.
