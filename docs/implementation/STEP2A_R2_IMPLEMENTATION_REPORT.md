# Step 2A-R2 implementation report

Branch: `step-2a-security-test-foundation`  
Plan: `docs/implementation/STEP2A_R2_PLAN.md`  
Supabase / Step 2B: **not started**  
UI redesign: **none** (acknowledged-deadline visibility only)  
Forensic worker: **not implemented**  
Merged to `main`: **No**  
Production readiness: **not claimed**  
Independent review: **required (Codex)**

This report remediates the Codex re-check of Step 2A-R. It does not mark
that review PASS and does not authorise merge or Supabase.

## Codex findings and remediation

| Finding | Root cause | Fix |
|---|---|---|
| Confirmation source mismatch | Confirm allowed when *some* qualifying date existed in the narrative | Confirm binds `sourceEventType` + UTC civil `sourceEventDate` + `ruleId` + `inferenceVersion`; unique match required; hearing cannot confirm as dismissal |
| Urgency HIGH → STANDARD on hearing tomorrow | Refresh overwrote `case.urgency` from limitation rows only; hearings were not stored | `clockKind`: `legal_limitation` vs `procedural_attention`. Overall urgency = max unresolved risk. Hearing is not a limitation start |
| Logout test did not replay the cookie | After `logoutAction` the cookie store was empty | Test captures the JWT, restores it after logout, GET evidence, expects 401. Session A survives logout of B |
| Acknowledged deadline hidden | Overview filtered `!acknowledged`; home queried `acknowledged: false` | Selector is unresolved-only. Ack copy: "Acknowledged — still active" |
| Dependency exception by package name | `(idOk \|\| packageOk) && (pathOk \|\| packageOk)` | Exact `GHSA-ggr8-5vv4-36mx`. Same package + different GHSA fails. Extra GHSA on the same record fails |
| Playwright teardown hang | Shell `npx` pipeline + Linux `fuser -k` | Node supervisor + Unix child-walk / Windows `taskkill /T`. Teardown rebinds port 4127 |
| Portable test env | Shell-specific teardown | Node scripts; Vitest forces `file:./test.db`; no PowerShell required |

## Architectural distinction

**Legal deadline calculation** (`legalClockStatus` / `clockKind=legal_limitation`):
when might an Employment Tribunal limitation clock expire? Only allow-listed
start events (dismissal, incident, resignation) under `ERA_EQA_3M_LESS_1D`.

**Case urgency** (`proceduralUrgency` + aggregation): what requires the user's
attention most urgently? An imminent hearing is not a limitation start and
must not become one, but it is high procedural urgency.

**Acknowledgement ≠ resolution.** Ack records that the user has seen the
warning. It does not hide the date, drop urgency, confirm the source, or
close the item. Only `resolutionStatus=resolved` (or equivalent
completed / superseded / invalidated) removes it from active attention.

Normalization for confirmation: UTC civil key (`YYYY-MM-DD` from UTC
Y/M/D). Equivalent timezone forms of the same UTC calendar day match.

## Previously verified security fixes

Left in place; regression tests still hit real boundaries:

- Active HTML/SVG/JS evidence served as attachments (`tests/security/evidence-delivery.test.ts`, evidence GET)
- Session revocation implementation (`logoutAction` + `AuthSession.revokedAt`)
- Billing fail-closed (`startCheckoutAction`)
- Forensic timestamp F-TS-001
- Evidence + custody transaction
- SHA-256 recompute verification
- Ownership on refresh / upload

## Clean-environment verification

Generated state removed (`.next`, test DBs, coverage, Playwright output),
then `npm ci` (702 packages).

| Command | Result |
|---|---|
| `npm ci` | PASS (702 packages; postinstall `prisma generate`) |
| `npm run typecheck` | PASS (`next typegen` + pin `next-env.d.ts` + `tsc --noEmit`) |
| `npm run lint` | PASS |
| `npm run test:unit` | PASS — 9 files, **69** tests |
| `npm run test:security` | PASS — 7 files, **33** tests (cookie replay + session A/B) |
| `npm run test:integration` | PASS — 6 files, **30** tests |
| `npm run test` | PASS — 22 files, **132** tests |
| `npm run build` | PASS (Next.js 16.3.4). Pre-existing middleware → proxy deprecation warning. |
| `npm run test:e2e` | PASS — 4 tests. Supervisor: migrate → `next build` (`.next-e2e`) → `next start :4127`. Teardown rebound port 4127. Second run also exited 0. |
| `node scripts/e2e-teardown.mjs` | PASS — `E2E port 4127 is free` |
| `npm run test:audit-policy` | PASS — 3 High packages, all the dated Prisma CLI `GHSA-ggr8-5vv4-36mx` cluster |
| `npm audit --audit-level=high` | **fails as visibility** — GHSA-ggr8-5vv4-36mx (dev) + Vitest mocker moderate. Not hidden. |

## Known limitations

- Heuristic event typing from prose can still mis-label mixed sentences.
- Confirmation uniqueness refuses any second distinct qualifying
  limitation-start date (stricter than “materially earlier” only).
- In-memory limiter is not distributed / not serverless-safe.
- Forensic inspector runtime is still not built.
- Signup success vs failure can still enumerate (redirect vs error).
- Edge middleware still checks cookie presence only.
- Parent npm-audit records that inherit via package name without a GHSA
  id still match the registered exception package; a second GHSA on the
  leaf package itself fails.

## Residual risks

SQLite tests are not Postgres RLS. Custom JWT + `AuthSession` is interim.
Prisma CLI `deepmerge-ts` High remains a dated **dev-only** exception.
E2E is still smoke-level for product flows; lifecycle is now a Node
supervisor rather than a shell pipeline.

Do not begin Step 2B or Supabase until Codex passes this remediation round.
Do not merge to `main`.
