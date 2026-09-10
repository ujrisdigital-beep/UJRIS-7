# Step 2A-R4 plan

Branch: `step-2a-security-test-foundation`  
Failed Codex R3 head: `f6892c8`  
Supabase / Step 2B: **not in this ticket**  
Hearing-urgency (R3 pass): **do not reopen**  
UI / forensic runtime / product features: **none**

This plan exists before production-code changes, as required.

---

## Blocker 1 — Same-day events in one sentence collapse

**REPRODUCTION.** Narrative such as “I was dismissed on 12 March 2026, and the later dismissal decision was also made on 12 March 2026.” yields one qualifying candidate.

**ROOT CAUSE.** `extractDates` splits by sentence, then deduplicates with `raw + context + date.toISOString()`. Two mentions that share sentence, phrase, and civil date collapse. `occurrenceIndex` is assigned **after** that lossy filter, so identity cannot be recovered.

**INVARIANT.** Two distinct source spans are two distinct candidates even when event type, civil date, sentence, and raw phrase match. **SOURCE OCCURRENCE INVARIANT.**

**FIX.** Scan the original source string. Record `sourceId`, `sourceStartOffset`, `sourceEndOffset` at match time, **before** any grouping. Collapse only identical `(sourceId, start, end)` spans (parser duplication). Fingerprint: `sourceId|start|end|eventType|civilDate|inferenceVersion`.

**REAL-BOUNDARY TEST.** `confirmDeadlineAction` with two same-sentence 12 March dismissals → refuse (`ambiguous`). Unit: two candidates, distinct fingerprints.

**WINDOWS IMPACT.** None (pure string offsets).

**PASS CONDITION.** Tests C/D fail if offsets are removed from identity.

---

## Blocker 2 — Same-date replacement still confirms

**REPRODUCTION.** Store provisional deadline from source A (12 March). Replace narrative with source B, also 12 March. Confirmation still allowed.

**ROOT CAUSE.** Confirmation treats a unique remaining candidate as a match when `sourceEventId` is missing, or when identity is legacy `eventType:YYYY-MM-DD`. Date equality is treated as continuity.

**INVARIANT.** A same-date replacement must not inherit confirmation provenance. The re-derived candidate must match the **stored fingerprint**. **SOURCE CONTINUITY INVARIANT.**

**FIX.** Require the stored span fingerprint to equal the unique current candidate’s fingerprint. Legacy `type:date` IDs and missing IDs refuse (`source_identity_changed` / `source_no_longer_present`). Do not rewrite provenance.

**REAL-BOUNDARY TEST.** Persist fingerprint of A, change narrative to B, `confirmDeadlineAction` → refuse. Tests E/F.

**WINDOWS IMPACT.** None.

**PASS CONDITION.** Tests B/C/E fail if identity reverts to type+date.

---

## Blocker 3 — Civil due dates differ by host timezone

**REPRODUCTION.** Same source `2026-03-12` recomputes different due dates under `TZ=UTC` vs `TZ=Europe/London`.

**ROOT CAUSE.** `calculatePrimaryLimitationDate` uses date-fns `addMonths` / `subDays` on a `Date`, which is local-timezone calendar math. `utcCivilKey` then reads UTC components. DST (UK late March / late October) shifts the civil day.

**INVARIANT.** Legal civil-date arithmetic is host-timezone independent. **CIVIL DATE INVARIANT.** `YYYY-MM-DD` / `{year,month,day}` is authoritative. JS `Date` is an I/O carrier only (UTC Y-M-D of a civil date).

**FIX.** `src/lib/legal/civil-date.ts`: add 3 calendar months with **month-end clamp**, then subtract 1 calendar day. No millisecond/24h/local-midnight conversion.

Month-end policy: target day = `min(source.day, lastDayOfTargetMonth)` (31 Jan + 3 months = 30 Apr, then −1 day = 29 Apr).

SQLite `DateTime` fields keep existing values. Read/write interprets UTC civil Y-M-D only. PostgreSQL `DATE` is documented for Step 2B — no destructive SQLite migration.

**REAL-BOUNDARY TEST.** Child Node processes with `TZ=UTC`, `TZ=Europe/London`, `TZ=America/New_York` must print the same due civil date. DST, month-end, leap year.

**WINDOWS IMPACT.** Tests set `TZ` in the child env (Windows: Node respects `TZ` for this UTC-only arithmetic; still spawn children).

**PASS CONDITION.** UTC vs London identical for the same civil source.

---

## Blocker 4 — `spawn npm` ENOENT on Windows

**REPRODUCTION.** `scripts/dependency-policy.mjs` `spawn("npm", …)` → `ENOENT` on Windows (no `npm.exe` on PATH for `CreateProcess`).

**ROOT CAUSE.** Named `npm` is not a portable executable. Windows needs `npm.cmd` or `node npm-cli.js`.

**INVARIANT.** Subprocesses use `process.execPath` + a resolved JS entry. No `shell: true`. **PORTABILITY INVARIANT.**

**FIX.** Shared `scripts/command-runner.mjs`: npm via `process.env.npm_execpath` or `node_modules/npm` next to `process.execPath`. Package bins via `package.json` `bin` + `process.execPath` (already used for Prisma/Next).

**REAL-BOUNDARY TEST.** Resolver returns `execPath + npm_execpath` on simulated win32/linux. Spawn failure → policy ERROR.

**WINDOWS IMPACT.** Primary fix.

**PASS CONDITION.** Audit policy launches without `spawn npm`.

---

## Blocker 5 — Abnormal audit execution fail-open

**REPRODUCTION.** Signal termination / unexpected exit with empty stdout can be classified as “no highs”.

**ROOT CAUSE.** Close handler records `code` only, not `signal` / `launched`. Empty parse after failed launch looks clean.

**INVARIANT.** Failure to execute or parse the audit is ERROR, never PASS. **AUDIT EXECUTION INVARIANT.**

**FIX.** Result model `{ launched, exitCode, signal, stdout, stderr, spawnError, timedOut }`. Signal, ENOENT, timeout, unexpected exit without valid JSON → ERROR. Exit 0/1 + valid JSON → evaluate.

**REAL-BOUNDARY TEST.** ENOENT, timeout, signal, malformed JSON, exit 1 + vulns, exit 0 + empty vulns.

**WINDOWS IMPACT.** ENOENT is the Windows spawn failure mode.

**PASS CONDITION.** No execution failure returns PASS.

---

## Blockers 6–7 — Vitest/E2E bootstrap not portable; E2E DB init fails

**REPRODUCTION.** Review host: Vitest/E2E fail before collection or before Next starts (DB init).

**ROOT CAUSE.** (1) `tests/setup.ts` imports Prisma **before** forcing `DATABASE_URL`, so `.env` / `prisma/dev.db` can bind the client. (2) Relative `file:./e2e.db` is schema-relative and host-dependent. (3) No staged E2E failure messages. (4) `npx` still used in CI Playwright install.

**INVARIANT.** Owned bootstrap sets an absolute disposable SQLite URL, refuses hosted/`dev.db`, migrates via `process.execPath` + Prisma JS CLI, and prints stage failures.

**FIX.** `tests/setup-env.ts` first in `setupFiles`. Absolute `file:` URLs under `prisma/test.db` and `prisma/e2e.db`. `e2e-run.mjs` stages: PREPARE_DB, BUILD, START_SERVER, WAIT_READY, RUN_PLAYWRIGHT, TEARDOWN, VERIFY_PORT; `finally` teardown. Windows CI job on `windows-latest`.

**REAL-BOUNDARY TEST.** Guard rejects `dev.db` and Postgres URLs. Windows + Ubuntu CI run the same npm scripts. Two E2E runs on both.

**WINDOWS IMPACT.** Merge gate.

**PASS CONDITION.** Fresh clone scripts work on Windows CI without manual adaptation.

---

## Preserve

Hearing tomorrow HIGH across refresh; hearing ≠ limitation start; ack ≠ hide; dependency runtime/unknown path rejection; HTML/SVG evidence; session A/B; billing fail-closed; F-TS-001; custody tx; SHA-256; ownership.

## Rollback

Revert R4 commits. Civil-date and span identity are additive at the logic layer; SQLite columns unchanged.
