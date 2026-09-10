# Step 2A-R4 implementation report

Branch: `step-2a-security-test-foundation`  
Failed Codex R3 head: `f6892c8`  
Supabase / Step 2B: **not started**  
UI redesign: **none**  
Forensic runtime: **not expanded**  
Hearing-urgency R3 work: **left alone**  
Merge: **not performed**

This pass proves **invariants**, not just previously green literals.
Independent review is still required. This is not production-ready.

## Invariants

**SOURCE OCCURRENCE INVARIANT.** Two distinct source spans are two
distinct candidate events even when event type, civil date, sentence, and
raw phrase match. Identity is assigned from
`sourceId + start + end + eventType + civilDate + normalized raw/context +
inferenceVersion` **before** any grouping. Collapse is allowed only for
the exact same `(sourceId, start, end)` parser duplication.

**SOURCE CONTINUITY INVARIANT.** A same-date replacement source may not
inherit confirmation provenance. Confirmation requires the stored `span:`
fingerprint to match the unique current candidate. Legacy `type:date`
identity and missing IDs refuse (`source_identity_changed` /
`source_no_longer_present`).

**CIVIL DATE INVARIANT.** Legal civil-date arithmetic is host-timezone
independent. Authoritative representation is `{year,month,day}` /
`YYYY-MM-DD`. `Date` is a UTC Y-M-D I/O carrier only.

**AUDIT EXECUTION INVARIANT.** Failure to execute or parse the audit is
ERROR (exit 2), never PASS. npm audit exit 0/1 with valid JSON is
evaluated.

**PORTABILITY INVARIANT.** Required repository verification scripts
execute on both Windows and Linux without undocumented shell adaptation.
Windows CI is a merge gate.

## Source occurrence identity

`extractDates` scans the original source string. Each match records
`sourceStartOffset` / `sourceEndOffset` immediately. Dedup is only
identical spans.

Example: “I was dismissed on 12 March 2026, and the later dismissal
decision was also made on 12 March 2026.” → two qualifying candidates →
`confirmDeadlineAction` refuses (`ambiguous`).

Same phrase at two offsets → two fingerprints.

## Same-date source replacement

Store fingerprint of source A (12 March). Replace narrative with source B
(also 12 March). Confirmation returns `source_no_longer_present`. The
provisional row stays `unconfirmed`. Date equality is not continuity.

## Civil dates

`src/lib/legal/civil-date.ts`:

- add 3 calendar months with **month-end clamp**
- subtract 1 calendar day
- 31 January → 30 April → **29 April**
- 30 November → 28 February (non-leap) → **27 February**
- 29 February 2024 + 3 months = 29 May; −1 day = **28 May**.

Child processes with `TZ=UTC`, `TZ=Europe/London`, `TZ=America/New_York`
must print identical due keys, including UK DST windows (late March /
late October).

## SQLite storage (no destructive migration)

`Deadline.dueDate` and `Deadline.sourceEventDate` remain SQLite
`DateTime`. Canonical read/write: UTC civil Y-M-D of the legal date
(`2026-03-12T00:00:00.000Z` means civil 12 March 2026, not midnight in
the host zone).

**Step 2B / PostgreSQL:** store legal civil dates as `DATE` (no timezone).
Do not keep split semantics. No SQLite data rewrite in R4.

## Audit / Windows spawn

`scripts/command-runner.mjs` resolves `npm_execpath` or `npm-cli.js` and
spawns `process.execPath`. Result model:
`{ launched, exitCode, signal, stdout, stderr, spawnError, timedOut }`.

ENOENT, timeout, signal, unexpected exit, malformed JSON → ERROR.
Valid vulnerability JSON + exit 1 → evaluate. Valid empty vulns + exit 0
→ evaluate.

## Bootstrap

Vitest: `tests/setup-env.ts` is the first `setupFiles` entry. Absolute
`file:` URL under `prisma/test.db`. Hosted URLs and `dev.db` refused.
Prisma migrate via `process.execPath` + Prisma JS CLI.

E2E: absolute `prisma/e2e.db`. Stages:

```
PREPARE_DB → BUILD → START_SERVER → WAIT_READY
→ RUN_PLAYWRIGHT → TEARDOWN → VERIFY_PORT
```

Stage failure prints stage, exit code, and a redacted stderr summary.
Teardown runs even if startup fails.

## CI

`.github/workflows/ci.yml` matrix: `ubuntu-latest` and `windows-latest`.
Both run `npm ci`, typecheck, lint, unit, security, integration, two
`npm run test:e2e`, build, `npm run test:audit-policy`.
Playwright install uses `scripts/playwright-install.mjs`
(`--with-deps` on Linux only — Playwright platform constraint).

## Mutation checks

- Fingerprints with the same type+date but different offsets differ.
- Span fingerprints are not `stableSourceIdentity(type, date)`.
- Tests C/D/E would pass incorrectly if identity ignored offsets or
  reverted to type+date.

## Previously passed areas (not reopened)

Hearing ≠ limitation start; relative hearing urgency through refresh;
acknowledgement preservation; dependency runtime/unknown path rejection;
HTML/SVG attachment safety; session A/B isolation; billing fail-closed;
F-TS-001; evidence/custody atomicity; SHA-256 recompute; ownership.

## Local verification (this Linux workspace)

| Command | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run test:unit` | PASS (105) |
| `npm run test:security` | PASS (33) |
| `npm run test:integration` | PASS (52) |
| `npm run test` | PASS (190) |
| `npm run test:e2e` run 1 | PASS, exit 0, stages printed, no interruption |
| port 4127 after run 1 | PASS (free) |
| `npm run test:e2e` run 2 | PASS, exit 0, no interruption |
| port 4127 after run 2 | PASS (free) |
| `npm run build` | PASS |
| `npm run test:audit-policy` | PASS (exit 0); 3 High Prisma CLI rows, pathClass=dev_tooling |
| `npm audit --audit-level=high` | FAIL (exit 1) as expected: GHSA-ggr8-5vv4-36mx + vitest mocker moderate |

Windows proof is GitHub Actions `windows-latest` on this branch, not this Linux host.

## Residual risks

- Heuristic event typing can still miss UK phrasing.
- Windows E2E is proven by GitHub Actions `windows-latest`, not by this
  Linux workspace.
- SQLite `DateTime` can still be misread if a future caller uses local
  `Date` getters instead of UTC civil keys.
- ACAS extension helpers still use date-fns on `Date` (out of R4 primary
  limitation scope).
- Playwright `--with-deps` is Linux-only; Windows CI installs Chromium
  without OS dependency packages.
- E2E remains smoke-only.

Requires independent review: **YES**. Do not merge. Do not start Supabase.
Do not claim production readiness.
