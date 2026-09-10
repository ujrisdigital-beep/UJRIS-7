# Step 2A-R5 implementation report

Branch: `step-2a-security-test-foundation`  
Reviewed Codex R4 head: `3beebaec2f87e6d8e22e3b8ca8cc0609cf60669e`  
Supabase / Step 2B: **not started**  
UI redesign: **none**  
R4 passing areas: **not reopened**  
Merge: **not performed**

This pass remediates **two** Codex R4 blockers only. Independent review
is still required. This is not production-ready.

## Invariants added

**UNRESOLVED QUALIFYING SOURCE INVARIANT.** A deadline may not be
confirmed while another potentially qualifying source occurrence exists
with an unresolved, partial, ambiguous, invalid, or missing date.

**EXCEPTION IDENTITY INVARIANT.** A dependency exception applies only to
the exact approved advisory identity and approved dependency context.
Unknown or different High advisories never inherit another advisory's
exception.

R4 source-span, civil-date, hearing-urgency, audit-execution, and
Windows/Linux portability invariants remain in force.

## Blocker 1 — Ambiguous / incomplete second dismissal

**Root cause.** `qualifyingCandidatesFromDates` kept only
`parseStatus === "valid"` rows. Incomplete phrases (“later that month”,
“in April”) were not extracted. Qualifying mentions without a date token
never became candidates. Confirmation therefore saw a single resolved
source and could set `confirmed` / `confidence: high`.

**Representation.** Qualifying occurrences now include unresolved rows
with source identity (`sourceId`, offsets, event type, raw/context,
`parseStatus`, empty civil date, inference version). States used:
`valid` (RESOLVED_DATE), `ambiguous`, `partial`, `invalid`, `missing`.
No invented civil dates.

**Confirmation.** `evaluateLimitationConfirmation` refuses with
`unresolved_qualifying_source` when any qualifying occurrence is not
safely resolved. `confirmDeadlineAction` therefore cannot write
`confirmed` / `high`. Extraction copy:
“Possible limitation date — another potentially relevant event date is
unresolved.”

**Non-qualifying events.** Unresolved hearing or grievance mentions do
not block. Malformed calendar tokens not attached to a qualifying event
do not block. Exact same-span parser duplication remains one source.

## Blocker 2 — Dependency exception inheritance

**Root cause.** `exceptionMatchesRecord` treated empty `ghsaIds` as a
match when `viaNames` intersected exception package aliases. An unknown
High on an approved Prisma CLI path could inherit
`GHSA-ggr8-5vv4-36mx`.

**Fix.** Matching requires exactly one GHSA equal to
`exception.advisoryId` / `exception.id`, the approved package cluster,
`pathClass = dev_tooling`, and an unexpired exception. Missing IDs fail
closed. Via-name, package-only, path-only, parent-package, and severity
fallbacks are gone.

`recordsFromAudit` may reconstruct a GHSA from the audit graph (string
`via` copies IDs from the named sibling’s `via[].url`). That restores
advisory *identity* for inherited npm parent rows; it does not grant an
exception without that ID.

EX-DEP-001 itself is unchanged (dated temporary Prisma CLI High).
Malformed vulnerability objects are ERROR.

## Mutation checks

- Narratives B/C/D have exactly one *resolved* qualifying candidate plus
  at least one unresolved qualifying occurrence. Removing the unresolved
  check would let confirmation proceed.
- Missing/different/unknown GHSA tests fail if matching is relaxed to
  package/path without advisory identity.

## Previously passed areas (not reopened)

SOURCE OCCURRENCE IDENTITY; SAME-SENTENCE SAME-DAY SAFETY; SAME-DATE
SOURCE REPLACEMENT; MULTIPLE RESOLVED CANDIDATE SAFETY; PURE CIVIL DATE
ARITHMETIC; UTC/LONDON/NEW_YORK INVARIANCE; DST INVARIANCE; DUE-DATE
RECOMPUTATION; HEARING NOT LIMITATION START; RELATIVE HEARING URGENCY;
REFRESH URGENCY; ACKNOWLEDGEMENT; WINDOWS COMMAND RESOLUTION; AUDIT
EXECUTION FAIL-CLOSED; TEST DB SAFETY; PRISMA BOOTSTRAP; ACTIVE CONTENT
SAFETY; AUTH RATE LIMIT; SESSION REVOCATION; SESSION A/B ISOLATION;
BILLING FAIL-CLOSED; OWNERSHIP / IDOR; EVIDENCE/CUSTODY ATOMICITY;
SHA-256 RECOMPUTE; F-TS-001.

## Local verification (this Linux workspace)

| Command | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run test:unit` | PASS (119) |
| `npm run test:security` | PASS (33) |
| `npm run test:integration` | PASS (62) |
| `npm run test` | PASS (214) |
| `npm run build` | PASS |
| `npm run test:audit-policy` | PASS (3 High Prisma CLI rows, exact GHSA, `dev_tooling`) |
| `npm audit --audit-level=high` | nonzero as expected (`GHSA-ggr8-5vv4-36mx` + vitest mocker moderate) |
| `npm run test:e2e` run 1 | PASS, port 4127 free |
| `npm run test:e2e` run 2 | PASS, port 4127 free |

Windows proof is GitHub Actions `windows-latest` on this branch.

## Residual risks

- Heuristic mention/date ownership can still miss unusual UK phrasing.
- Audit-graph GHSA reconstruction follows string `via` names one
  connected component; a corrupted sibling graph without any GHSA URL
  fails closed (missing advisory id).
- EX-DEP-001 remains a dated temporary exception. Raw `npm audit` stays
  nonzero.
- E2E remains smoke-only.
- Windows CI is the merge-gate proof for that OS, not this Linux host.

Requires independent Codex review: **YES**. Do not merge. Do not start
Supabase. Do not start Step 2B. Do not call UJRIS production-ready.
