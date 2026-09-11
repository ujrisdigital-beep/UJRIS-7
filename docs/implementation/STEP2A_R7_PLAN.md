# Step 2A-R7 plan

Branch: `step-2a-security-test-foundation`  
Reviewed R6 head: `2832974`  
Supabase / Step 2B: **not in this ticket**  
R4–R6 passing areas: **do not reopen**

This plan exists before production-code changes.

---

## Blocker 1 — Procedural date assigned to a referenced qualifying event

**REPRODUCTION.** “The hearing for my dismissal is on 20 April 2026” yields a resolved dismissal on 20 April and can confirm a limitation deadline with high confidence.

**ROOT CAUSE.** `nearestEventOwner` picks the last preceding same-sentence mention. In “hearing for my dismissal is on 20 April”, `dismissal` sits between `hearing` and the date, so the qualifying *topic* owns the procedural date.

**VIOLATED INVARIANT.** **CLAUSE-LEVEL EVENT OWNERSHIP INVARIANT:** when a dated procedural event syntactically references another legal event, the date belongs to the procedural event unless the text independently states that the referenced event occurred on that date.

**MINIMAL FIX.**

1. Classify each mention as `occurrence` or `reference`.
2. A qualifying mention is a **reference** when the same-sentence gap back to a preceding procedural mention contains `for|about|concerning|regarding|over|in relation to`, or when it immediately modifies a following procedural noun (“dismissal hearing”).
3. Only **occurrence** mentions may own dates. Skip references in `nearestEventOwner`.
4. Do not emit a missing qualifying occurrence for a reference (avoids a false second source when a real dated dismissal exists elsewhere).
5. Confirmation: a resolved qualifying row must be an occurrence whose owned date is not a reference.

Do not special-case the full phrase “hearing for my dismissal”.

**REAL-BOUNDARY TEST.** Cases A–J plus possessive noun-phrase and preposition variants in `tests/integration/clause-event-ownership.test.ts`.

**MUTATION TEST.** A/B/D/E must fail if ownership falls back to “nearest qualifying mention wins”.

**PASS CONDITION.** Hearing/appeal/grievance own the procedural date. Referenced dismissal/resignation stay unresolved and cannot confirm. Independent “dismissed on 12 March” still owns 12 March.

---

## Blocker 2 — Array-valued advisory ID inherits the exception

**REPRODUCTION.** `ghsaIds: [["GHSA-ggr8-5vv4-36mx"]]` (or `normalizeGhsa` on a non-string) PASSes EX-DEP-001.

**ROOT CAUSE.** `normalizeGhsa` uses `String(id || "").toUpperCase()`. `String(["GHSA-ggr8-5vv4-36mx"]) === "GHSA-ggr8-5vv4-36mx"`. Objects/arrays therefore coerce into the approved scalar.

**VIOLATED INVARIANT.** **ADVISORY ID TYPE INVARIANT:** an advisory identifier is valid only if it is a scalar string matching `^GHSA-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$` after documented trim + case normalisation. Arrays, objects, numbers, booleans, null, undefined, and nested values never match.

**MINIMAL FIX.**

1. Replace `String(id)` coercion with `typeof id === "string"` then trim/upper-case, then canonical regex.
2. Any non-scalar entry in `ghsaIds` / `via` identity fields → malformed → FAIL/ERROR.
3. Iterate collections of IDs; never pass an array into equality with the exception ID.
4. `ghsaFromViaItem` must not `String()` non-scalar `url`/`id` fields.

Do not change EX-DEP-001 itself.

**REAL-BOUNDARY TEST.** Matrix A–J plus nested/empty/null arrays in `tests/unit/dependency-policy.test.ts`.

**MUTATION TEST.** B/C/J must fail if matching returns to `String(advisoryId) === approvedId`.

**PASS CONDITION.** Scalar approved GHSA in exact `dev_tooling` context still temporary PASS. Array/object/null/number/nested IDs never PASS.

---

## Preserve

R6 nearest-mention ownership for undated dismissal + dated hearing in a *separate* clause; source-span identity; unresolved second dismissal; per-advisory set evaluation; civil-date / CI / E2E.

## Rollback

Revert R7 commits. R6 fingerprints for occurrence-owned resolved dates are unchanged.
