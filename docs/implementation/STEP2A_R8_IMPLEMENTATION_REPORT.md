# Step 2A-R8 implementation report

Branch: `step-2a-security-test-foundation`  
Reviewed Codex R7 head: `1cc9e893f4189c536c1a07105e408ad6e82dd2c7`  
Supabase / Step 2B: **not started**  
UI redesign: **none**  
R4–R7 passing areas: **not reopened** except the two reproduced blockers  
Merge: **not performed**

`CURSOR_BLOCKERS.md` / `FINAL_MERGE_GATE.md` were not on this host. The
three HIGH fixtures are the phrases named in the R8 return ticket.

This pass remediates **two** Codex R7 blockers only. Independent review
is still required. This is not production-ready.

## Invariants added

**PROCEDURAL REFERENCE INVARIANT.** A qualifying-event term used solely as
the subject matter, target, modifier, basis, or reference of a dated
procedural event does not inherit that procedural event's date and does
not become a limitation candidate.

**EXACT ADVISORY TOKEN INVARIANT.** A dependency advisory exception may
match only an exact canonical advisory identity. A valid GHSA substring
or prefix extracted from a larger malformed token or URL segment is
invalid and must fail closed.

R7 clause-ownership / scalar-ID invariants remain in force.

## Blocker 1 — Incomplete procedural-reference vocabulary

**Exact reproductions.**

1. `The appeal against my dismissal was on 20 April 2026.`
2. `The tribunal hearing related to my dismissal was on 20 April 2026.`
3. `The hearing re my dismissal was on 20 April 2026.`

**Root cause.** R7 only treated `for|about|concerning|regarding|over|in
relation to` as topic relations. `against`, `related to`, and `re` left
`dismissal` as an occurrence, so nearest-mention ownership assigned 20
April to the dismissal.

**Model.** Same tight suffix grammar, expanded relation list (`against`,
`related to`, `relating to`, `re`, `concerned`, …) and procedural heads
(including review, investigation, tribunal/disciplinary/preliminary/final
/case-management hearings). A qualifying word that immediately modifies a
procedural head (“dismissal tribunal hearing”, “dismissal appeal”) is a
reference. Confirmation additionally refuses when the stored civil date is
owned by a procedural occurrence and no qualifying occurrence owns it.

Not a phrase blacklist.

## Blocker 2 — GHSA URL prefix truncation

**Exact repro class.** `.../GHSA-ggr8-5vv4-36mx<extra malformed suffix>`
matched `/GHSA-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}/` and resolved to
`GHSA-ggr8-5vv4-36mx`.

**Fix.** `extractAdvisoryGhsa` accepts a scalar canonical GHSA, or a
GitHub URL whose pathname is exactly `/advisories/<canonical-ghsa>`.
The entire decoded path segment must match. Nested `/extra`, encoded
`%2Dextra`, glued suffixes, query/fragment contamination, and non-GitHub
hosts that contain a GHSA-looking prefix fail closed. No first-substring
extraction. EX-DEP-001 itself is unchanged. Live Prisma CLI advisory URLs
still PASS.

## Mutation checks

- Codex 1–3 have zero resolved qualifying candidates. Restoring the R7
  preposition list or “nearest qualifying mention wins” would make them
  confirmable.
- Suffix/prefix URL tests fail if extraction returns to “first
  GHSA-looking substring”.

## Local verification (this Linux workspace)

| Command | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run test:unit` | PASS (154) |
| `npm run test:security` | PASS (33) |
| `npm run test:integration` | PASS (102) |
| `npm run test` | PASS (289) |
| `npm run build` | PASS |
| `npm run test:audit-policy` | PASS (3 High Prisma CLI rows, exact GHSA, `dev_tooling`) |
| `npm audit --audit-level=high` | nonzero as expected (3 High Prisma CLI + 2 Moderate Vitest) |
| `npm run test:e2e` run 1 | PASS, port 4127 free |
| `npm run test:e2e` run 2 | PASS, port 4127 free |

Windows proof is GitHub Actions `windows-latest` on this branch.

## Residual risks

- Heuristic relation/head lists can still miss unusual UK phrasing.
  Uncertain phrases stay unresolved rather than confirmed.
- Unknown-host URLs that contain a GHSA-looking token fail closed even
  if a future registry used a different advisory URL shape.
- EX-DEP-001 remains dated and temporary. E2E remains smoke-only.

Requires independent Codex review: **YES**. Do not merge. Do not start
Supabase. Do not start Step 2B. Do not call UJRIS production-ready.
The next Codex gate should test **only the three procedural-reference
repros, the malformed-URL advisory repro, and focused regression**.
