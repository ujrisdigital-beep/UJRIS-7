# Step 2A implementation report

Branch: `step-2a-security-test-foundation`  
Base: `7e7f86d` on `main`  
Date: 2026-09-09  
Supabase: **not started**  
UI redesign: **none**  
Status for independent review: **PASS FOR INDEPENDENT REVIEW**  
Production readiness: **not claimed**

## What was done

1. Vitest (unit / integration / security) + Playwright smoke E2E + npm scripts + GitHub Actions.
2. Evidence delivery: attachment-only, nosniff, no inline HTML/SVG/JS on the app origin; path containment; filename sanitisation.
3. Auth: in-memory rate limit (5 / 15 min, email key, fail-open, generic messages) + `AuthSession` / JWT `jti` revocation on logout.
4. Billing fail-closed unless Stripe is configured; `UJRIS_ALLOW_DEV_BILLING` cannot run when `NODE_ENV=production`.
5. Deadline inference returns confirmed / provisional / ambiguous / insufficient_data; earliest date is a warning only; urgency is not suppressed.
6. Forensic timestamp rule F-TS-001: “later revision” only when modified is after created by >24h; reversed pair is a metadata inconsistency; no forged/fraud language.
7. Evidence + required custody event in one Prisma transaction; SHA-256 recompute verification that never overwrites the original hash.
8. `refreshCaseIntelligenceForOwner` — User A cannot refresh User B’s case.
9. Forensic inspector tables: **design only**.
10. **STITCH UX REVIEW: PENDING AUTHENTICATED ACCESS** recorded in `PROJECT_STATE.md`.

## Quality checks (this environment)

| Command | Result |
|---|---|
| `npx prisma generate` | pass |
| `npm run typecheck` | pass (`tsc --noEmit`, 0 errors) |
| `npm run lint` | pass (`eslint .`, 0 errors) |
| `npm run test` | pass — 8 files, **42 tests** |
| `npm run test:e2e` | pass — 2 Playwright tests (landing, login) |
| `npm run build` | pass (Next.js 16.3.4). Warning: middleware → `proxy` deprecation (pre-existing, not migrated). |
| `npm audit --audit-level=high` | **fail** — documented in `docs/security/DEPENDENCY_AUDIT.md`. Not force-fixed. |

Vitest breakdown: evidence integrity (6), date inference (7), evidence delivery (6), forensic timestamps (8), ownership (2), rate limit (4), billing (6), session revocation (3).

## Files created (high level)

- `vitest.config.ts`, `playwright.config.ts`, `tests/**`
- `.github/workflows/ci.yml`
- `src/lib/rate-limit.ts`, `evidence-delivery.ts`, `billing-mode.ts`, `evidence-persist.ts`, `evidence-integrity.ts`, `legal/date-inference.ts`, `forensics/timestamps.ts`, `cases/refresh-intelligence.ts`
- `prisma/migrations/20260909174658_auth_session/`
- `docs/implementation/STEP2A_PLAN.md`, this file
- `docs/security/SECURITY_REGRESSION_MATRIX.md`, `docs/security/DEPENDENCY_AUDIT.md`
- `docs/architecture/FORENSIC_DOCUMENT_INSPECTOR.md`

## Known limitations

- Rate limiter is process-local memory. Not distributed. Fail-open on store errors. Not production-grade.
- Session revocation is custom JWT + SQLite `AuthSession`. Middleware still only checks cookie presence.
- Evidence files are still on local disk. Bytes are written before the DB transaction (orphan *files* possible; orphan *rows* should not be).
- Date extraction remains heuristic. Ambiguous results use the earliest date as a conservative warning, which can overstate urgency.
- Forensic findings remain a JSON blob at runtime.
- No password-reset endpoint exists, so none was rate-limited.
- Playwright is not in default CI (browser bootstrap). How to run: `npx playwright install --with-deps chromium && npm run test:e2e`.
- Prisma 6 CLI High advisory (`deepmerge-ts`) is documented, not force-upgraded.

## Residual risks

- XSS if a future ticket inlines untrusted PDF/HTML/SVG on the app origin.
- Credential stuffing across many instances or after process restart.
- Stolen JWT usable until logout/expiry; no “revoke all sessions” UI.
- `User.plan` column can still be written by server code; Stripe is not yet sole SoT.
- Application-layer ownership checks without RLS.
- AI grounding / cost monitoring still absent (finding 10).

## Superseded during Supabase migration (Step 2B+)

- `AuthSession` + custom JWT cookies → Supabase Auth.
- In-memory rate limiter → platform / WAF / shared limiter.
- SQLite Prisma → Postgres + RLS. **Keep the same tests.**
- Local disk evidence → private bucket + signed attachment URLs.
- Optional `UJRIS_ALLOW_DEV_BILLING` → remove; Stripe webhooks only.

## Requires independent review

YES. Do not merge to `main`. Do not start Supabase in this ticket.
