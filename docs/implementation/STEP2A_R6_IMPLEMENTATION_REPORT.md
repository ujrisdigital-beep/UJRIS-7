# Step 2A-R6 implementation report

Branch: `step-2a-security-test-foundation`  
Reviewed Codex R5 head: `aa86cefc31a6415a28e4eb940038370148f8bbbe`  
Supabase / Step 2B: **not started**  
UI redesign: **none**  
R4/R5 passing areas: **not reopened**  
Merge: **not performed**

This pass remediates **two** Codex R5 blockers only. Independent review
is still required. This is not production-ready.

## Invariants added

**EVENT/DATE OWNERSHIP INVARIANT.** A date may only resolve a qualifying
event when the date can be deterministically associated with that event's
source occurrence. Dates belonging to hearings, grievance meetings,
appeals or other events must never be borrowed to resolve an undated
dismissal/resignation.

**ADVISORY SET INVARIANT.** Every High/Critical advisory must be
independently identified and authorized. One approved advisory never
causes an entire vulnerability record containing additional unknown,
malformed or unapproved High/Critical advisories to pass.

R5 unresolved-qualifying-source and exception-identity invariants remain
in force, as do R4 source-span / civil-date / portability invariants.

## Blocker 1 — Hearing date inherited by undated dismissal

**Root cause.** `appendMissingQualifyingMentions` assigned leftover
sentence dates with `following[0] ?? remaining[0]` and reclassified
non-qualifying dates (hearing, grievance, appeal) onto the qualifying
mention.

**Model.** `scanLegalEventMentions` records every legal event span. Each
date token is owned by the nearest preceding same-sentence mention (else
the nearest following mention). Ownership is stored as
`dateOwnerEventType` / `dateOwnerStart` / `dateOwnerEnd`. Qualifying
mentions without an owned date remain `missing` or `partial`. Confirmation
requires that a resolved candidate's owner is still a qualifying type
(`date_ownership_unresolved` otherwise).

Extraction copy for an undated qualifying event:
“Possible limitation issue — relevant dismissal/resignation date is
unresolved.”

## Blocker 2 — Approved GHSA immunized the rest of the record

**Root cause.** `resolveGhsaIds` returned as soon as any `via[].url`
yielded a GHSA, dropping remaining string entries and objects without an
ID. `evaluateExceptionGate` then saw only the approved ID.

**Fix.** Every `via` entry is analyzed. String names reconstruct a GHSA
only from the named sibling. Objects must yield an exact GHSA. Unidentified
Highs FAIL. Empty High `via`, null entries, empty objects, and non-array
`via` FAIL or ERROR. Each resolved GHSA is matched independently. Duplicate
copies of the same approved GHSA in the approved context may PASS.
EX-DEP-001 itself is unchanged.

## Mutation checks

- A/B/C/I have zero resolved qualifying candidates plus a missing
  dismissal. Returning to leftover-date borrowing would make them
  confirmable.
- C/D/E fail if “any approved GHSA present → PASS record.”

## Local verification (this Linux workspace)

| Command | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run test:unit` | PASS (132) |
| `npm run test:security` | PASS (33) |
| `npm run test:integration` | PASS (75) |
| `npm run test` | PASS (240) |
| `npm run build` | PASS |
| `npm run test:audit-policy` | PASS (3 High Prisma CLI rows, exact GHSA, `dev_tooling`) |
| `npm audit --audit-level=high` | nonzero as expected |
| `npm run test:e2e` run 1 | PASS, port 4127 free |
| `npm run test:e2e` run 2 | PASS, port 4127 free |

Windows proof is GitHub Actions `windows-latest` on this branch.

## Residual risks

- Heuristic nearest-mention ownership can still miss unusual clause
  structure. Not a full NLP parser.
- Audit-graph GHSA reconstruction still depends on sibling `via` URLs;
  an unresolvable string via fails closed.
- EX-DEP-001 remains dated and temporary. Raw `npm audit` stays nonzero.
- E2E remains smoke-only.

Requires independent Codex review: **YES**. Do not merge. Do not start
Supabase. Do not start Step 2B. Do not call UJRIS production-ready.
