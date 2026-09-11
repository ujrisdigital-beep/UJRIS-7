# Step 2A-R6 plan

Branch: `step-2a-security-test-foundation`  
Reviewed R5 head: `aa86cef`  
Supabase / Step 2B: **not in this ticket**  
R4/R5 passing areas: **do not reopen**

This plan exists before production-code changes.

---

## Blocker 1 — Undated qualifying event inherits another event's date

**REPRODUCTION.** Narratives such as “I was dismissed and my hearing is on 20 April 2026.” or “I attended a hearing on 20 April 2026 and was dismissed.” extract the hearing date as a valid dismissal. Confirmation can then set `confirmed` / `confidence: high`.

**ROOT CAUSE.** `appendMissingQualifyingMentions` assigns dates inside a sentence to qualifying mentions with `following[0] ?? remaining[0]`, then **reclassifies** a non-qualifying date (`hearing`, `grievance`, `appeal`, …) to the qualifying mention type. A later or leftover hearing date is borrowed because it is the nearest remaining token, not because it belongs to the dismissal.

**VIOLATED INVARIANT.** **EVENT/DATE OWNERSHIP INVARIANT:** a civil date may resolve a qualifying occurrence only when it can be deterministically associated with that occurrence. Dates belonging to hearings, grievance meetings, appeals or other events must never be borrowed to resolve an undated dismissal/resignation.

**MINIMUM FIX.**

1. Scan *all* legal event mentions (not only dismissal/resignation).
2. Each date token is owned by the nearest preceding event mention in the same sentence; if none, the nearest following mention in that sentence.
3. Set `eventType` / ownership provenance from that owner. Never fall back to an unowned leftover date. Never reclassify a date owned by a different event.
4. Qualifying mentions with no owned date remain `missing` / `partial`.
5. Confirmation: a resolved qualifying occurrence must still show qualifying ownership provenance; otherwise refuse.

Do not special-case `if eventType === "hearing"`. Grievance, appeal, tribunal order, and similar events use the same ownership rule.

**REAL-BOUNDARY TEST.** `confirmDeadlineAction` / `extractDates` cases A–J plus same-sentence pairs in `tests/integration/event-date-ownership.test.ts`.

**MUTATION TEST.** Cases A/B/C/I must fail if assignment returns to nearest/global leftover-date borrowing (including `remaining[0]` and reclassification of non-qualifying dates).

**PASS CONDITION.** Undated dismissal/resignation stays unresolved. Dated hearing/grievance/appeal keep their own dates. Dated dismissal + dated hearing keep correct ownership in either order and in one sentence. Confirmation cannot become high-confidence via a borrowed date.

---

## Blocker 2 — Approved GHSA immunizes the rest of the record

**REPRODUCTION.** A vulnerability `via` list containing `GHSA-ggr8-5vv4-36mx` plus an unidentified or malformed High still PASSes. Some malformed `via` objects are dropped once any GHSA URL is present.

**ROOT CAUSE.** `resolveGhsaIds` returns as soon as any `via[].url` yields a GHSA, ignoring remaining string `via` entries and objects without an ID. `ghsaFromViaItem` returns `null` for those objects, so they never enter `ghsaIds`. `evaluateExceptionGate` then sees only the approved ID.

**VIOLATED INVARIANT.** **ADVISORY SET INVARIANT:** every High/Critical advisory represented in a record must be independently identified and authorized. One approved advisory never causes a record that also contains unknown, malformed, or unapproved High/Critical advisories to PASS.

**MINIMUM FIX.**

1. Walk **every** `via` entry. Resolve string names through the audit graph; objects must yield an exact GHSA (url / id).
2. Unidentified High, missing ID, empty High `via`, null entries, empty objects, and non-array `via` → FAIL or ERROR.
3. Evaluate each resolved GHSA against an exact exception. Approved + unknown / different / critical / malformed still FAIL/ERROR.
4. Duplicate copies of the same approved GHSA in the same approved context may PASS.
5. Keep graph reconstruction only when it yields a concrete GHSA; otherwise fail closed.

Do not change EX-DEP-001 itself.

**REAL-BOUNDARY TEST.** Matrix A–L in `tests/unit/dependency-policy.test.ts`.

**MUTATION TEST.** C/D/E must fail if logic becomes “any approved GHSA present → PASS record.”

**PASS CONDITION.** Approved GHSA alone on unexpired `dev_tooling` still temporary PASS. Mixed, unknown, missing-ID, malformed, empty High set, and production_runtime mix FAIL/ERROR.

---

## Preserve

R5 unresolved qualifying refusal; source-span identity; civil-date TZ invariance; hearing ≠ limitation start; exact GHSA matching for a *single* identified High; path-class fail-closed; Windows/Linux CI and two-cycle E2E.

## Rollback

Revert R6 commits. R5 fingerprints for correctly owned resolved dates are unchanged.
