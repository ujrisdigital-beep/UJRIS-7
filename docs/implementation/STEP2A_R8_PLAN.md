# Step 2A-R8 plan

Branch: `step-2a-security-test-foundation`  
Reviewed R7 head: `1cc9e893f4189c536c1a07105e408ad6e82dd2c7`  
Supabase / Step 2B: **not in this ticket**  
R4–R7 passing areas: **do not reopen**

`CURSOR_BLOCKERS.md` and `FINAL_MERGE_GATE.md` were **not** present on this
host. The three HIGH fixtures below are the only complete procedural-reference
phrases named in the R8 Codex return ticket.

This plan exists before production-code changes.

---

## Blocker A — Procedural-reference classification is incomplete

**BLOCKER.** Three procedural-reference phrasings still confirm a
high-confidence dismissal limitation.

**EXACT REPRO.**

1. `The appeal against my dismissal was on 20 April 2026.`
2. `The tribunal hearing related to my dismissal was on 20 April 2026.`
3. `The hearing re my dismissal was on 20 April 2026.`

**ROOT CAUSE.** R7 reference detection only recognises
`for|about|concerning|regarding|over|in relation to`. `against`,
`related to`, and `re` are ordinary relation forms, so `dismissal` remains
an occurrence and `nearestEventOwner` assigns 20 April to it.

**GENERAL INVARIANT.** **PROCEDURAL REFERENCE INVARIANT:** a qualifying-event
term used solely as the subject matter, target, modifier, basis, or
reference of a dated procedural event does not inherit that procedural
event's date and does not become a limitation candidate.

**MINIMAL FIX.** Expand the same-clause relation vocabulary and procedural
head list (hearing / tribunal hearing / appeal / appeal hearing / grievance
/ grievance meeting / meeting / review / investigation / disciplinary,
preliminary, final, and case-management hearings). Keep the **tight suffix**
check so an independent later “I was dismissed on …” stays an occurrence.
Treat a qualifying word that immediately modifies a procedural head
(“dismissal tribunal hearing”, “dismissal appeal”) as a reference. Do not
phrase-blacklist the three Codex strings.

**NEGATIVE TESTS.** Codex 1–3 plus `related to` / `re` / `against` /
`concerned` / date-first / compound-noun / mixed real occurrence +
reference / second real unresolved dismissal.

**MUTATION TEST.** If relation detection falls back to the R7 preposition
list (or nearest qualifying mention wins), Codex 1–3 fail.

**PASS CONDITION.** Procedural event owns 20 April. Dismissal stays
unresolved. Confirmation refused. High confidence must not attach. A real
“dismissed on 12 March” still confirms subject to existing safeguards.

---

## Blocker B — GHSA URL prefix truncation

**BLOCKER.** URL parsing extracts a valid approved GHSA prefix from a longer
malformed token and inherits EX-DEP-001.

**EXACT REPRO.** Advisory URL / token of the class
`.../GHSA-ggr8-5vv4-36mx<extra malformed suffix>` currently matches
`/GHSA-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}/` and resolves to
`GHSA-ggr8-5vv4-36mx`.

**ROOT CAUSE.** `ghsaFromScalarString` uses an unanchored regex substring
on URL-like strings and does not require the entire path segment to be
canonical.

**GENERAL INVARIANT.** **EXACT ADVISORY TOKEN INVARIANT:** a dependency
advisory exception may match only an exact canonical advisory identity.
A valid GHSA substring or prefix extracted from a larger malformed token
or URL segment is invalid and must fail closed.

**MINIMAL FIX.** Known-provider URL parse: GitHub `/advisories/<segment>`
must have that entire decoded segment equal
`^GHSA-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$`. Nested `/extra` suffixes,
query/fragment contamination, encoded extra suffixes, and non-GitHub
hosts that only contain a GHSA-looking prefix fail closed. Direct scalar
IDs still use `canonicalGhsa` (R7 type safety unchanged). No first-substring
extraction.

**NEGATIVE TESTS.** Exact GitHub advisory URL (PASS in approved context);
`-extra`, `XYZ` glued suffix, encoded `%2Dextra`, adjacent `A`/`AGHSA`/
`_` / `.other`; query and fragment malformed IDs; R7 non-scalar matrix.

**MUTATION TEST.** Restoring “find first GHSA-looking substring” must make
the suffix/prefix tests fail.

**PASS CONDITION.** Exact scalar / exact GitHub advisory URL still
temporary PASS in `dev_tooling`. Prefix, suffix, and truncated tokens
never inherit EX-DEP-001.

---

## Preserve

R7 occurrence/reference for `for|about|concerning…`; R6 nearest-mention
ownership for undated dismissal + dated hearing in a separate clause;
source-span identity; unresolved second dismissal; per-advisory set
evaluation; scalar advisory type safety; civil-date / CI / E2E.

## Rollback

Revert R8 commits. R7 fingerprints for occurrence-owned resolved dates
and scalar GHSA matching are unchanged.
