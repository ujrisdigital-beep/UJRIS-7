# Step 2A-R3 plan

Branch: `step-2a-security-test-foundation`  
Failed Codex R2 head: `0b0115c`  
Supabase / Step 2B: **not in this ticket**  
UI redesign: **none**  
Forensic runtime: **not expanded**  
Already-passed security: **do not refactor**

This plan exists before production-code changes, as required.

## Process tree (E2E) — current vs target

### Current (hangs in Codex)

```
npm run test:e2e
 └─ playwright test
      ├─ webServer: node scripts/e2e-webserver.mjs
      │    ├─ prisma migrate deploy
      │    ├─ next build (.next-e2e)
      │    └─ next start :4127   (child of supervisor)
      ├─ tests
      └─ globalTeardown: node scripts/e2e-teardown.mjs (kills pidfile)
         + Playwright gracefulShutdown SIGTERM (20s) on supervisor
```

Two owners wait on the same tree (Playwright and the supervisor). `next build` inside the webServer command inflates startup and can rewrite `next-env.d.ts` / `tsconfig.json`. Teardown then races.

### Target (single owner, no cycle)

```
npm run test:e2e
 └─ node scripts/e2e-run.mjs          ← THE ONLY OWNER
      1. scripts/e2e-prepare.mjs
         disposable file:./e2e.db + prisma migrate deploy
         next build → .next-e2e (if missing or forced)
      2. spawn next start :4127        ← child of e2e-run
      3. wait until GET / returns
      4. spawn playwright test
         PLAYWRIGHT_SKIP_WEBSERVER=1   ← Playwright does not start e2e-run
      5. on playwright exit:
         SIGTERM next, wait, SIGKILL tree if needed
         bind-check 127.0.0.1:4127
         exit with playwright status
```

No script→Playwright→script cycle. Playwright is a sibling of Next, both children of `e2e-run.mjs`.

---

## Blocker 1 — Confirmation accepts wrong due dates / same-day collapse / competing candidates

**ROOT CAUSE.** `evaluateLimitationConfirmation` matches `eventType + UTC civil date` (`stableSourceIdentity`) and uniqueness of **civil dates**, not of **source events**. It never recomputes `expectedDueDate` from the source + rule. Two dismissals on 12 March collapse to one key. A tampered `dueDate` still confirms if the source date/rule match.

**REPRODUCTION.** Stored due date off-by-one with a matching dismissal source confirms. Two distinct “dismissed on 12 March” sentences confirm. Dismissal 12 March + incident 18 March currently refuses on date-set size, but same-day distinct events do not.

**FIX.** Confirmation invariant: exact stored source still exists, is uniquely identifiable (fingerprint ≠ type+date), type still qualifying, normalized source date unchanged, rule matches, **stored due date === recomputed due date** (UTC civil key via `calculatePrimaryLimitationDate`), and there is **no second qualifying limitation-start candidate**. Do not rewrite `dueDate` in the confirm operation.

Candidate fingerprint: `eventType|civilKey|raw|occurrenceIndex|inferenceVersion`.

**BOUNDARY TEST.** `confirmDeadlineAction` cases A–K (correct; wrong due; off-by-one; wrong rule; source gone; two same-day; 12+18 March; hearing vs dismissal; invalid source; source changed; tampered due). Removing due-date recompute or unique-source checks must fail a test.

**PASS CRITERIA.** Confirm only when provenance and recomputed due date both match and the qualifying set has size 1.

---

## Blocker 2 — “My hearing is tomorrow” HIGH → STANDARD after refresh

**ROOT CAUSE.** `extractDates` does not resolve relative words (`today` / `tomorrow` / `yesterday` / `next Monday` / `in N days`). Keyword scan still sets `hasUrgencySignal` → create-time HIGH. No procedural `Deadline` row is persisted. `refreshCaseIntelligenceForOwner` overwrites `case.urgency` from stored deadline rows only → STANDARD.

**REPRODUCTION.** Narrative “My hearing is tomorrow.” Create/analyze → HIGH. Refresh → STANDARD. Frozen date 2026-09-10 Europe/London.

**FIX.** Injectable clock (`src/lib/clock.ts`). Relative dates resolve only against that reference in Europe/London civil days. Persist `clockKind=procedural_attention` for hearings. Refresh re-syncs procedural rows from the narrative **without** dropping existing unresolved procedural items and **without** treating them as limitation starts. Aggregate max unresolved urgency.

**BOUNDARY TEST.** Frozen 2026-09-10: create + refresh + ack + refresh stay HIGH/CRITICAL; hearing date 2026-09-11; not a limitation start. Resolve may drop. Also: today, past, 30 days (threshold policy). Hits `refreshCaseIntelligence` / `refreshCaseIntelligenceForOwner`, not helpers only.

**PASS CRITERIA.** End-to-end refresh cannot drop an unresolved tomorrow-hearing below HIGH/CRITICAL.

---

## Blocker 3 — Dependency policy accepts runtime paths and audit-service errors

**ROOT CAUSE.** Path match is suffix/`leaf` based, so unexpected runtime paths can inherit EX-DEP-001. `npm audit --json` non-zero with `{error:…}` or empty/`{}` is parsed as “no highs” → PASS. No PASS/FAIL/ERROR distinction.

**REPRODUCTION.** Same GHSA on `@prisma/client` or unknown node accepted. Malformed JSON / empty stdout after crash / `{error:{code:"ENOAUDIT"}}` exits 0.

**FIX.** Classify each finding: `dev_tooling` | `production_runtime` | `unknown`. EX-DEP-001 accepts only reviewed `dev_tooling` paths. Unknown and production_runtime FAIL. Policy result `PASS | FAIL | ERROR`; ERROR = nonzero (exit 2). Detect audit-service errors, malformed JSON, truncated bodies, missing `vulnerabilities` object after a failed spawn. npm audit exit 1 **with** a parseable vulnerability report is FAIL/PASS per exceptions, not ERROR.

**BOUNDARY TEST.** A–K as specified (approved path PASS; runtime FAIL; unknown FAIL; different GHSA FAIL; extra High FAIL; expired FAIL; Critical FAIL; malformed ERROR; empty failed command ERROR; network ERROR; nonzero+parseable evaluated).

**PASS CRITERIA.** Fail closed. Parser failure never looks like a clean audit.

---

## Blocker 4 — E2E teardown hang + Vitest/E2E clean-checkout failure

**ROOT CAUSE.** Dual ownership (Playwright webServer + custom supervisor + globalTeardown). E2E shared `file:./test.db` with Vitest. Vitest bootstrap uses `npx prisma migrate deploy` in `tests/setup.ts` (PATH/npx fragile on clean clones). No `engines` / `.nvmrc`.

**REPRODUCTION.** Codex: assertions green, process must be interrupted. Clean clone: Vitest fails before collection; E2E DB init fails.

**FIX.** Single-owner `scripts/e2e-run.mjs` as above; disposable `file:./e2e.db` (gitignored); Playwright `PLAYWRIGHT_SKIP_WEBSERVER=1` when launched by the owner. Vitest migrate via `scripts/prisma-migrate.mjs` using `require.resolve("prisma")` (no npx). Pin Node `>=20 <23` and `.nvmrc` `22`. `npm run test:e2e` twice must exit 0 with port 4127 free after each.

**BOUNDARY TEST.** Two consecutive `npm run test:e2e` from a temp clone; port bind after each; `npm run test:unit` on a tree with no `test.db` / no `.next`.

**PASS CRITERIA.** Commands exit without Ctrl+C. Clean clone needs only `npm ci` and documented scripts.

---

## Preserve

HTML/SVG evidence, session replay + A/B, billing fail-closed, F-TS-001, evidence/custody tx, SHA-256, ownership, acknowledged ≠ hidden, hearing ≠ limitation start.

## Rollback

Revert 2A-R3 commits. Fingerprint / relative-date / clock are additive.
