# Step 2A-R5 plan

Branch: `step-2a-security-test-foundation`  
Reviewed R4 head: `3beebae`  
Supabase / Step 2B: **not in this ticket**  
R4 passing areas: **do not reopen**

This plan exists before production-code changes.

---

## Blocker 1 — Ambiguous / incomplete second dismissal ignored

**REPRODUCTION.** Narratives with one complete dismissal date plus a second qualifying mention whose date is incomplete, invalid, or missing (for example “dismissed again later that month”, “31 February”, “in April”, “another dismissal decision”) still confirm. The unresolved occurrence is dropped.

**ROOT CAUSE.** `qualifyingCandidatesFromDates` keeps only `parseStatus === "valid"` rows with a civil date. Incomplete phrases such as “later that month” / “in April” are not extracted at all. Qualifying *event mentions* without a date token never become candidates. Confirmation therefore sees a single resolved source.

**SAFETY INVARIANT.** A deadline may not be confirmed while another potentially qualifying source occurrence exists with an unresolved, partial, ambiguous, invalid, or missing date. **UNRESOLVED QUALIFYING SOURCE INVARIANT.**

**MINIMAL FIX.**

1. Extract incomplete date phrases (month-only, “later that month”, invalid civil tokens already present) and keep them as `ExtractedDate` with `parseStatus` `partial` / `invalid` / `ambiguous`.
2. Scan dismissal/resignation mention spans. A mention in the same sentence with no assigned date token becomes a `missing` occurrence. Overlapping mentions (for example “constructive dismissal”) collapse to one span.
3. Do not scan incident keywords as bare mentions (avoids treating “discrimination” context as a second limitation start).
4. Confirmation: if any qualifying occurrence is not safely resolved, refuse (`unresolved_qualifying_source`). Existing multi-resolved refusal stays.
5. `inferLimitationStart` treats resolved+unresolved as `ambiguous` so extraction copy cannot imply certainty.
6. Confirmation still cannot set `confidence: high` / `confirmed` when refused.

Do not invent dates. Do not change R4 span fingerprints for resolved valid dates.

**REAL-BOUNDARY TEST.** `confirmDeadlineAction` cases A–J in `tests/integration/unresolved-qualifying-source.test.ts`.

**MUTATION TEST.** If the unresolved-occurrence check is removed, B/C/D must fail (they currently refuse only because of that check, not because two *resolved* dates exist).

**PASS CONDITION.** B/C/D refuse. A still confirms. E/F (hearing / grievance) do not block. G/H still refuse. I collapses same span. J does not false-block a stray non-qualifying malformed date.

---

## Blocker 2 — Unknown High inherits approved exception

**REPRODUCTION.** A High finding on an approved Prisma CLI `dev_tooling` path without `GHSA-ggr8-5vv4-36mx` (missing ID, different ID, or via-name-only) can match EX-DEP-001.

**ROOT CAUSE.** `exceptionMatchesRecord` treats empty `ghsaIds` as a match when `viaNames` intersects the exception package aliases. `evaluateExceptionGate` then searches exceptions for that via-name match. Advisory identity is optional.

**SAFETY INVARIANT.** A dependency exception applies only to the exact approved advisory identity and approved dependency context. Unknown or different High advisories never inherit another advisory’s exception. **EXCEPTION IDENTITY INVARIANT.**

**MINIMAL FIX.**

1. Require exactly one GHSA on the record, equal to `exception.id` / `exception.advisoryId`.
2. Remove via-name-only advisory matching.
3. Empty `ghsaIds` → no exception (FAIL).
4. Resolve GHSA IDs inside `recordsFromAudit` from the same audit graph: string `via` entries copy GHSAs from the named vulnerability’s `via[].url`. That reconstructs advisory *identity* for inherited npm parent rows; it does not grant an exception without an ID.
5. Malformed vulnerability objects → policy ERROR.
6. Do not change EX-DEP-001 itself.

**REAL-BOUNDARY TEST.** `tests/unit/dependency-policy.test.ts` cases A–J. Live `npm run test:audit-policy` still PASSes the dated Prisma CLI High once the audit graph supplies `GHSA-ggr8-5vv4-36mx`.

**MUTATION TEST.** If matching is relaxed to package/path without advisory ID, B/C/D must fail.

**PASS CONDITION.** Different/unknown/missing GHSA on the approved path is FAIL. Exact GHSA + `dev_tooling` + unexpired remains the only temporary PASS.

---

## Preserve

Source-span identity; civil-date TZ invariance; hearing ≠ limitation start; audit spawn ERROR; Windows/Linux CI and E2E; evidence/session/billing/ownership.

## Rollback

Revert R5 commits. Fingerprints for resolved valid dates are unchanged.
