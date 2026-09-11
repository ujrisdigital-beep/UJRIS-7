# Step 2A-R9 implementation report

Branch: `step-2a-security-test-foundation`  
Reviewed Codex R8 head: `772cb9b944c729cebec569133e68a84dcb5eebe9`  
Supabase / Step 2B: **not started**  
GHSA / advisory policy: **not reopened**  
Named R8 procedural-reference and GHSA URL fixes: **preserved**  
Merge: **not performed**

`CURSOR_BLOCKERS.md` / `FINAL_MERGE_GATE.md` were not on this host. The two
remaining High fixtures were recovered by running the clause structures
named in the R9 ticket against HEAD `772cb9b`. This is not a claim that
those Windows Codex files were read.

This pass remediates **one** previously reported High: two clause structures
that still converted a hearing date into a confirmed/high-confidence
dismissal limitation. Independent review is still required. This is not
production-ready.

## Invariant added

**CLAUSE-BOUNDARY DATE OWNERSHIP INVARIANT.** A date may support limitation
confirmation only when it is independently owned by the qualifying event
occurrence. A date belonging to an outer procedural assertion must not
transfer to a qualifying event mentioned inside that procedural assertion,
regardless of lexical proximity.

R8 procedural-reference / exact-advisory-token invariants remain in force.

## Exact Codex reproductions

1. `The hearing, about my dismissal, is on 20 April 2026.`
2. `The tribunal hearing, which concerns my dismissal, is on 20 April 2026.`

At R8 both assigned 20 April 2026 to a dismissal occurrence (one qualifying
candidate; `inferLimitationStart` status `provisional`).

## Root cause

R8 topic-scope required the gap between a procedural head and a qualifying
word to **be** `relation + optional determiner` only. A comma, `which` /
`that`, or `concerns` made the suffix fail. `nearestEventOwner` then gave
the outer procedural date to the inner `dismissal` noun.

This is a clause-ownership failure, not a vocabulary-only miss. R8 already
covered `against`, `related to`, `relating to`, and `re`.

Blindly labelling every embedded dismissal as `reference` would also be
wrong: `The hearing for the dismissal I received on 12 March 2026 is on
20 April 2026` is a real inner occurrence with its own exact date.

## Clause-boundary / event-assertion ownership model

A small deterministic binder, not an NLP parser.

1. Punctuation-tolerant topic-scope: commas and optional `which|that|who`
   (optional `is|was`) before the existing relation list, including
   `concerns`. The **suffix** check remains so `but I was dismissed on …`
   stays an occurrence.
2. `eventAssertionOwner` binds a date token to the assertion whose
   predicate or local date phrase expresses it:
   - date-first procedural noun (`The 20 April 2026 hearing`);
   - outer predicate (`is/was/took place/scheduled/listed on|for DATE`);
   - wrapping comma/paren span binds to the inner event in that span
     (`local` when that event is qualifying);
   - otherwise a short local `on|for` window after a qualifying mention
     binds to that mention even if it is topic-embedded.
3. `applyEventDateOwnership` prefers assertion binding over nearest-token
   ownership. A local qualifying binding sets `mentionRole` to
   `occurrence` so an inner 12 March can confirm; the outer April stays
   on the hearing.
4. Confirmation refuses when `dateOwnerEventType` does not match the
   qualifying occurrence type, including a tampered dismissal occurrence
   whose stored owner is a hearing.

Not a phrase blacklist. No GHSA matcher edits.

## Direct confirmation defence

`evaluateLimitationConfirmation` refuses when
`dateOwnerEventType !== qualifying type`. Unit tamper: `eventType=
dismissal`, `mentionKind=occurrence`, civil date 20 April 2026,
`dateOwnerEventType=hearing` → REFUSE.

## Mutation check

If ownership falls back to nearest qualifying mention / last preceding
event without assertion binding, fixtures 1 and 2 assign 20 April to
dismissal and fail
`tests/integration/clause-boundary-date-ownership.test.ts`.

## Local verification (this Linux workspace)

| Command | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run test:unit` | PASS (155) |
| `npm run test:security` | PASS (33) |
| `npm run test:integration` | PASS (114) |
| `npm run test` | PASS (302) |
| `npm run build` | PASS |
| `npm run test:audit-policy` | PASS (3 High Prisma CLI rows, exact GHSA, `dev_tooling`) |
| `npm audit --audit-level=high` | nonzero as expected (3 High Prisma CLI + 2 Moderate Vitest) |
| `npm run test:e2e` run 1 | PASS, port 4127 free |
| `npm run test:e2e` run 2 | PASS, port 4127 free |

Windows proof is GitHub Actions `windows-latest` on this branch.

## Residual risks

- Heuristic assertion windows can still miss unusual UK phrasing.
  Uncertain phrases stay unresolved rather than confirmed.
- Nested constructions beyond comma/relative/parenthetical/date-first
  spans may still need a later ownership pass.
- EX-DEP-001 remains dated and temporary. E2E remains smoke-only.
- No GHSA or advisory-policy change in R9.

Requires independent Codex review: **YES**. Do not merge. Do not start
Supabase. Do not start Step 2B. Do not call UJRIS production-ready.
The next Codex gate should test **only the two exact clause fixtures
above, the structural variants, and focused R4–R8 regression**. Do not
reopen the already-passing GHSA fix.
