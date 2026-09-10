# Step 2A-R3 implementation report

Branch: `step-2a-security-test-foundation`  
Failed Codex R2 head: `0b0115c`  
Supabase / Step 2B: **not started**  
UI redesign: **none**  
Forensic runtime: **not expanded**  
Merge: **not performed**

This pass proves **invariants**, not just previously green literals.

## Confirmation invariant

A stored deadline may be confirmed ONLY when:

1. the exact stored source event still exists;
2. it is uniquely identifiable by fingerprint (`eventType|civilKey|raw|occurrenceIndex|inferenceVersion`), not `event_type + date`;
3. its event type is still a qualifying limitation-start type;
4. its normalized UTC civil source date is unchanged;
5. the stored rule is still `ERA_EQA_3M_LESS_1D`;
6. `utcCivilKey(storedDueDate) === utcCivilKey(calculatePrimaryLimitationDate(sourceEventDate).dueDate)`;
7. there is no second unresolved qualifying limitation-start candidate (including a distinct same-day event, and including a later competing date).

Confirmation **refuses** and does **not** rewrite `dueDate`. Reasons include `stored_deadline_mismatch`, `ambiguous`, `source_date_changed`, `source_event_not_found`, `rule_mismatch`.

Boundary: `confirmDeadlineAction` cases A–K in `tests/integration/deadline-confirmation-invariant.test.ts`. Removing due-date recomputation fails B/C/K. Removing unique-source enforcement fails F/G.

## Procedural urgency invariant

Relative dates (`today` / `tomorrow` / `yesterday` / `next Monday` / `in N days`) resolve only against the injectable clock (`src/lib/clock.ts`, Europe/London). Frozen `2026-09-10` + “My hearing is tomorrow.” → civil date `2026-09-11`.

A hearing is `clockKind=procedural_attention`, never a limitation start. Refresh preserves unresolved procedural rows and will backfill a missing hearing from the narrative. It does not rebuild urgency from limitation candidates only, and it does not resurrect a resolved relative hearing.

Overall urgency is `max(unresolved legal clock, unresolved procedural)`. Acknowledgement is not resolution.

Boundary: `tests/integration/hearing-urgency-refresh.test.ts` hits `generateCaseAnalysis` persist + `refreshCaseIntelligence` / `refreshCaseIntelligenceForOwner`.

## Dependency fail-closed invariant

Three identities: advisory, package, path class (`dev_tooling` | `production_runtime` | `unknown`).

EX-DEP-001 accepts only reviewed **dev_tooling** Prisma CLI paths. `@prisma/client` is classified **production_runtime** before any `prisma` substring. UNKNOWN fails closed.

Policy result is `PASS | FAIL | ERROR`. ERROR (malformed JSON, empty output, timeout, `{error:…}`, missing `vulnerabilities`) exits **2**. npm audit exit 1 with a parseable vulnerability report is **evaluated**, not treated as execution failure.

## E2E lifecycle invariant

```
npm run test:e2e
 └─ node scripts/e2e-run.mjs          ← THE ONLY OWNER
      1. disposable prisma/e2e.db + prisma migrate deploy
      2. next build → .next-e2e (reused if BUILD_ID exists)
      3. spawn next start :4127
      4. spawn playwright test (PLAYWRIGHT_SKIP_WEBSERVER=1)
      5. reap Next, bind-check 127.0.0.1:4127, exit Playwright status
```

Playwright is a sibling of Next. There is no script→Playwright→script cycle. Vitest uses `file:./test.db` via `scripts/prisma-migrate.mjs` (resolved Prisma bin, not npx). Prisma resolves the E2E URL `file:./e2e.db` next to the schema (`prisma/e2e.db`, gitignored).

## Local verification (this workspace)

| Command | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run test:unit` | PASS (79) |
| `npm run test:security` | PASS (included in full suite) |
| `npm run test:integration` | PASS (after hearing-refresh fix) |
| `npm run test` | PASS (156) |
| `npm run test:e2e` run 1 | PASS, exit 0, no interruption |
| port 4127 after run 1 | PASS (free) |
| `npm run test:e2e` run 2 | PASS, exit 0, no interruption |
| port 4127 after run 2 | PASS (free) |
| `npm run test:audit-policy` | PASS (exit 0); 3 High Prisma CLI rows, pathClass=dev_tooling |
| `npm audit --audit-level=high` | FAIL (exit 1) as expected: GHSA-ggr8-5vv4-36mx + vitest mocker moderate (audit-level=high still reports the High cluster) |

## Clean clone verification (`/tmp/ujris-r3-clean`)

Genuinely new clone of `step-2a-security-test-foundation` (not this working tree). Sequence: `npm ci` → typecheck → lint → test:unit → test:security → test:integration → test → build → `npx playwright install chromium` → `npm run test:e2e` → port check → `npm run test:e2e` → port check → `npm run test:audit-policy`.

**CLEAN_CLONE_OK.** No undocumented env, no prior `test.db`, no Ctrl+C.

| Command | Result |
|---|---|
| `npm ci` | PASS |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run test:unit` | PASS (79) |
| `npm run test:security` | PASS (33) |
| `npm run test:integration` | PASS (44) |
| `npm run test` | PASS (156) |
| `npm run build` | PASS |
| `npm run test:e2e` run 1 | PASS, exit 0 (includes first `.next-e2e` build) |
| port 4127 after run 1 | PASS |
| `npm run test:e2e` run 2 | PASS, exit 0 |
| port 4127 after run 2 | PASS |
| `npm run test:audit-policy` | PASS |

## Previously passed security areas

Not refactored except where confirmation/refresh required fingerprints. Preserved tests still pass: HTML/SVG evidence download, session revocation + A/B, billing fail-closed, F-TS-001, evidence/custody atomicity, SHA-256 recompute, ownership, acknowledged ≠ hidden, hearing ≠ limitation start.

## Known limitations

- Heuristic event typing from prose can still miss UK phrasing.
- Confirmation is still not legal advice.
- E2E remains smoke-only (landing, login, unauthenticated evidence GET).
- Vitest mocker moderate advisory is visible in raw `npm audit` and is below the High gate.
- Custom JWT / in-memory limiter / SQLite remain interim.

## Residual risks

- A future preview of HTML evidence could reintroduce XSS.
- Rate limiter is single-process.
- Relative-date backfill uses the clock at first persist/refresh; later wall-clock “tomorrow” is not moved, which is intentional.

## Stop condition

STOP. Do not start Supabase. Do not begin Step 2B. Do not merge. Return to Codex for one final independent gate.
