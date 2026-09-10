# Step 2A-R2 plan

Branch: `step-2a-security-test-foundation`  
Failed Codex re-check head: `cfcd139`  
Supabase / Step 2B: **not in this ticket**  
UI: **no product redesign** — only acknowledged-deadline visibility  
Forensic runtime: **not expanded**

This plan exists before implementation, as required.

## Finding 1 — Deadline confirmation source mismatch

**ROOT CAUSE.** `evaluateLimitationConfirmation` re-infers the narrative and, if status is `provisional`, allows confirm. It does **not** require the stored `sourceEventDate` / `sourceEventType` to match the re-derived candidate. A stored 12 March dismissal can be confirmed because the narrative now contains an 18 March dismissal (or any other single allow-listed date).

**CHANGE.** Bind confirmation to provenance: `sourceEventType`, `sourceEventDate` (UTC civil key), `sourceRawDate`, `sourceEventId`/`sourceReference`, `ruleId`, `inferenceVersion`. Re-derive qualifying candidates; require exactly one match to the stored source; refuse type/date/rule drift; refuse when the stored source is missing, invalid, or no longer present.

**SECURITY/LEGAL IMPACT.** Prevents confirming a limitation clock against the wrong act/dismissal date — a high legal-safety defect.

**TEST.** Stored 12 Mar + narrative 12 Mar may confirm; stored 12 Mar + narrative 18 Mar refuse; stored hearing 12 Mar + narrative dismissal 12 Mar refuse; two dismissals refuse; source deleted/changed refuse; rule changed refuse; invalid stored source refuse; equivalent civil UTC dates accept.

**PASS CRITERIA.** No confirm unless the stored source uniquely matches a current qualifying candidate of compatible type and rule.

## Finding 2 — Urgency regression (hearing tomorrow → STANDARD)

**ROOT CAUSE.** Case creation merges keyword urgency (`hearing` → high) with limitation-derived urgency, then `refreshCaseIntelligenceForOwner` **overwrites** `case.urgency` from **Deadline rows only**. Hearings are not limitation starts, so they are not stored as deadlines. Refresh drops HIGH to STANDARD/low.

**CHANGE.** Separate `clockKind`: `legal_limitation` vs `procedural_attention`. Persist dated hearings (and similar procedural events) as unresolved procedural attention rows whose `dueDate` is the hearing date. Aggregate urgency as the **max** of all unresolved items. Refresh must not last-writer-wins a limitation-only value.

**SECURITY/LEGAL IMPACT.** Hearing remains not a limitation start. Imminent hearings still demand attention. Acknowledgement still cannot reduce that urgency.

**TEST.** Hearing tomorrow is not a confirmed limitation start; hearing tomorrow yields high/critical procedural urgency; limitation medium + hearing high → overall high; ack + refresh does not drop it.

**PASS CRITERIA.** `legal_clock_status` and `procedural_urgency` are distinct; overall urgency is max unresolved risk.

## Finding 3 — Logout test does not replay the captured cookie

**ROOT CAUSE.** After `logoutAction` the test cookie store is cleared. The following GET uses an empty cookie, not the captured JWT. Implementation may still revoke `jti`; the test does not prove replay of the stolen credential.

**CHANGE.** Capture the exact pre-logout cookie value, logout, **restore that value**, then GET evidence. Add a second-session test: logout of B does not revoke A.

**SECURITY/LEGAL IMPACT.** Test quality only unless implementation is wrong (Codex already saw denial). Do not change working revocation unless the replay test fails.

**TEST.** Capture → access 200 → logout → restore captured token → 401; session A survives logout of B.

**PASS CRITERIA.** Removing `revokeSession` would fail this test even if the cookie were still present.

## Finding 4 — Acknowledged deadline hidden on overview

**ROOT CAUSE.** `nextDeadline = deadlines.filter((d) => !d.acknowledged)[0]` and home query `deadlines: { where: { acknowledged: false } }`. Acknowledgement hides “Most important date”.

**CHANGE.** Select the most important **unresolved** deadline (soonest / highest urgency). Acknowledgement may change copy (“Acknowledged”) but not remove the card. Resolved/completed may leave the active view.

**SECURITY/LEGAL IMPACT.** Users must keep seeing time-critical dates after they have merely seen the warning.

**TEST.** Unack urgent visible; ack urgent still visible; resolved may hide; multiple → highest unresolved; hearing tomorrow acknowledged still visible.

**PASS CRITERIA.** Selector used by overview/home ignores `acknowledged` and honours `resolutionStatus`.

## Finding 5 — Dependency exception matches by package name

**ROOT CAUSE.** Matcher is `(idOk || packageOk) && (pathOk || packageOk)`, so package name alone exempts any High on `deepmerge-ts` / `prisma` / `@prisma/config`.

**CHANGE.** Require explicit advisory ID (`GHSA-ggr8-5vv4-36mx`). Parent packages without a GHSA in `via` may inherit **only** if `via` names the excepted package. Different GHSA on the same package fails. Expired / critical-vs-high / unknown High fail. Enrich exception metadata.

**SECURITY/LEGAL IMPACT.** Prevents a future High on the same package being silently accepted.

**TEST.** Exact GHSA accepted; same package different GHSA fail; expired fail; unknown High fail; unexpected runtime path fail.

**PASS CRITERIA.** No package-only match.

## Finding 6 — Playwright teardown hang

**ROOT CAUSE.** `npx prisma && npx next dev` is a shell pipeline; SIGTERM may not reap Next children. `fuser -k` is Linux-specific and can stall.

**CHANGE.** Node supervisor (`scripts/e2e-webserver.mjs`) owns the Next child, forwards signals, kills the process group (Unix) or `taskkill /T` (Windows). Teardown verifies the port can be rebound. No `fuser`.

**SECURITY/LEGAL IMPACT.** Lifecycle only; assertions already passed.

**TEST.** E2E exits; teardown attempts bind on the configured port.

**PASS CRITERIA.** `npm run test:e2e` starts, waits, runs, terminates children, releases port, exits with the test status.

## Finding 7 — Portable test environment

**ROOT CAUSE.** Shell-specific teardown and Cursor-local assumptions.

**CHANGE.** Node scripts for typegen pin, test DB guard (already), E2E supervisor. Document `npm ci` → typecheck → lint → test → build → e2e with no extra env. Vitest forces disposable SQLite and refuses production URLs.

**PASS CRITERIA.** Documented sequence uses npm/Node only; no PowerShell/bash-only steps required for the default path.

## Preserve

Active HTML/SVG evidence, session revocation implementation, billing fail-closed, F-TS-001, evidence/custody tx, SHA-256 recompute, ownership. Do not expand forensic runtime or limiter architecture.

## Rollback

Revert 2A-R2 commits. Additive Deadline columns default safely.
