# Step 2A-R7 implementation report

Branch: `step-2a-security-test-foundation`  
Reviewed Codex R6 head: `28329746435006d67f345e329c93c5db73fef204`  
Supabase / Step 2B: **not started**  
UI redesign: **none**  
R4–R6 passing areas: **not reopened** except the two reproduced blockers  
Merge: **not performed**

This pass remediates **two** Codex R6 blockers only. Independent review
is still required. This is not production-ready.

## Invariants added

**CLAUSE-LEVEL EVENT OWNERSHIP INVARIANT.** A qualifying event referenced
as the topic, object or subject of a dated procedural event does not
inherit that procedural event's date. Only a qualifying event occurrence
with its own deterministically owned date can support confirmation.

**ADVISORY ID TYPE INVARIANT.** Dependency exception matching accepts only
validated scalar advisory identifiers. Arrays, objects, nested values or
other malformed identities never inherit an exception and must fail closed.

R6 event/date ownership and advisory-set invariants remain in force, as
do R5 unresolved-source / exception-identity and R4 source-span /
civil-date / portability invariants.

## Blocker 1 — Hearing-for-dismissal date treated as a dismissal occurrence

**Root cause.** `nearestEventOwner` assigned the date to the last
preceding same-sentence mention. In “The hearing for my dismissal is on
20 April 2026”, `dismissal` sits between `hearing` and the date, so the
topic word owned the procedural date and confirmation could succeed.

**Model.** Mentions are classified as `occurrence` or `reference`.

- A qualifying mention is a **reference** when it is the object of a
  same-clause topic phrase (`for|about|concerning|regarding|over|in
  relation to`) after a procedural noun (hearing, appeal, grievance,
  meeting, tribunal hearing), or when it immediately modifies a following
  procedural noun (“dismissal hearing”).
- The preposition check is a **tight gap**, so “hearing for my dismissal
  … I was dismissed on 12 March” keeps the later dismissal as an
  occurrence.
- Only **occurrence** mentions may own dates. If no scanned occurrence
  owns the date, the last procedural noun before the date in the clause
  owns it (covers “the meeting concerning my resignation”).
- References still emit missing rows for explainability but are skipped
  by `qualifyingSourceOccurrences`, so they do not create a second
  unresolved source next to a real dated dismissal.
- Confirmation refuses when the stored source is not a resolved
  qualifying **occurrence**.

Do not special-case the full phrase “hearing for my dismissal”.

Extraction copy when the only qualifying words are references:
“Possible limitation issue — relevant dismissal/resignation date is
unresolved.”

## Blocker 2 — Array-valued advisory ID inherited EX-DEP-001

**Root cause.** `normalizeGhsa` used `String(id || "").toUpperCase()`.
`String(["GHSA-ggr8-5vv4-36mx"]) === "GHSA-ggr8-5vv4-36mx"`.

**Fix.** `canonicalGhsa` requires `typeof id === "string"`, then trim +
uppercase, then `^GHSA-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$`.
`collectCanonicalGhsas` iterates a collection of IDs and marks any
non-scalar or non-canonical entry malformed. Via identity fields that
are not strings fail closed. No `String()` / template coercion on
advisory identity. EX-DEP-001 itself is unchanged. Documented
canonicalisation is trim + case-normalisation of an already-scalar
string.

## Mutation checks

- A/B/D/E of the hearing-for-dismissal matrix have zero resolved
  qualifying candidates. Returning to “nearest qualifying mention wins”
  would make them confirmable.
- Array / multi-id-array / array-plus-viaName cases fail if matching
  returns to `String(advisoryId) === approvedId`.

## Local verification (this Linux workspace)

| Command | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run test:unit` | PASS (145) |
| `npm run test:security` | PASS (33) |
| `npm run test:integration` | PASS (90) |
| `npm run test` | PASS (268) |
| `npm run build` | PASS |
| `npm run test:audit-policy` | PASS (3 High Prisma CLI rows, exact GHSA, `dev_tooling`) |
| `npm audit --audit-level=high` | nonzero as expected (3 High Prisma CLI + 2 Moderate Vitest) |
| `npm run test:e2e` run 1 | PASS, port 4127 free |
| `npm run test:e2e` run 2 | PASS, port 4127 free |

Windows proof is GitHub Actions `windows-latest` on this branch.

## Residual risks

- Heuristic occurrence/reference classification can still miss unusual
  UK phrasing. Uncertain phrases stay unresolved rather than confirmed.
  Not a full NLP parser. Not legal advice.
- `meeting` as a procedural noun is used for date ownership; it is not
  a new limitation-start type.
- EX-DEP-001 remains dated and temporary. Raw `npm audit` stays nonzero.
- E2E remains smoke-only.

Requires independent Codex review: **YES**. Do not merge. Do not start
Supabase. Do not start Step 2B. Do not call UJRIS production-ready.
 The next Codex review should test **only the two exact repros plus
 focused regression**.
