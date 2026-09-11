# UJRIS — Project State

> **Read this file, and the ADRs in `docs/adr/`, before making any change.**
> This file is the single source of truth for what exists, what's missing,
> and what's next. Update it as part of every ticket — a ticket is not
> done until this file reflects reality.

Last updated: 2026-09-11 (ticket: Step 2A-R6 event/date ownership + advisory-set evaluation — see Ticket Log).

## 1. What UJRIS is

A justice-intelligence product for UK self-represented employment/
discrimination claimants: turn a confusing workplace dispute into a
structured case ("Case Twin"), an evidence map, and a clear next action —
via ACAS/Employment Tribunal procedure, without promising an outcome.

## 2. Architecture (current, as-built)

See **[ADR-0001](docs/adr/0001-baseline-nextjs-prisma-sqlite.md)** for the
full record. Summary:

- Next.js 16 (App Router) + React 19 + TypeScript + Tailwind v4 +
  shadcn/ui in the **base-nova / `@base-ui/react`** style (components use
  the `render` prop for polymorphism, e.g. `<Button render={<Link .../>} />`
  — **not** Radix's `asChild`. Do not reintroduce `asChild` usage; it will
  fail typecheck.)
- Prisma ORM → local SQLite (`prisma/dev.db`, git-ignored). Schema is
  written to be Postgres-portable but Postgres is not wired up yet.
  Legal civil dates (`sourceEventDate`, limitation `dueDate`) are stored
  as SQLite `DateTime` but **mean** a timezone-free `YYYY-MM-DD`. Read/write
  uses UTC Y-M-D only (`2026-03-12T00:00:00.000Z` = civil 12 March 2026).
  Step 2B PostgreSQL should use `DATE` for those fields. Do not treat a
  legal date as local midnight.
- Custom auth: bcrypt + `jose` HS256 JWT in an `httpOnly` cookie
  (`src/lib/auth.ts`), now bound to an `AuthSession` row (`jti`) so logout
  can revoke a captured token. **Interim** — **not** Supabase Auth yet.
  In-memory auth rate limiting exists (single-process, not production-grade).
  Case urgency is **not** the same thing as limitation-clock status:
  `legalClockStatus` vs `proceduralUrgency` are aggregated from unresolved
  deadline rows (`clockKind`: `legal_limitation` | `procedural_attention`).
  Acknowledgement means the user has seen a warning; it does not hide or
  resolve the date.
- Authorization: every server action / route handler re-checks
  `record.userId === session.userId` before reading/writing. No RLS yet
  (SQLite has none; Postgres/RLS migration is ADR-0002, not started).
- Evidence files: local disk under `data/evidence/` (git-ignored), served
  only via an authenticated, ownership-checked route
  (`src/app/api/evidence/[evidenceId]/file/route.ts`) as **attachments**
  with `nosniff`; HTML/SVG/JS are forced to `application/octet-stream` and
  are never inlined on the application origin. No object storage, no
  signed URLs yet. Evidence row + custody event are written in one Prisma
  transaction. Integrity verification recomputes SHA-256 of current bytes
  against the stored original hash and never overwrites that hash.
- Billing: real Stripe subscription-mode Checkout wiring
  (`src/lib/actions/billing.ts`, `src/app/api/billing/webhook/route.ts`).
  **Missing Stripe configuration does not grant a paid plan.** A
  development simulation exists only if `UJRIS_ALLOW_DEV_BILLING=true`
  and `NODE_ENV` is not `production` (`SUBSCRIPTION_DEV_MODE_ACTIVATED`
  audit event — never confused with a real payment).
- AI: deterministic, zero-dependency heuristic engine for signal
  extraction, deadline calculation, and document drafting
  (`src/lib/ai/*`, `src/lib/legal/*`). Optional OpenAI call only *phrases*
  already-extracted facts; never asked to invent new ones. No AI
  usage/cost observability yet.
- Forensics: EXIF (`exifr`) + PDF metadata (`pdf-lib`) + SHA-256, raised as
  neutrally-worded flags (`src/lib/forensics/evidence.ts`). Findings are
  **not yet** the fully structured, per-finding schema the charter
  requires (`finding_type`/`confidence`/`limitations`/`source+version`/
  etc. as discrete rows) — currently a single JSON blob on `Evidence`.
  Timestamp rule F-TS-001 is deterministic (`src/lib/forensics/timestamps.ts`).
  Target finding tables are designed in
  [`docs/architecture/FORENSIC_DOCUMENT_INSPECTOR.md`](docs/architecture/FORENSIC_DOCUMENT_INSPECTOR.md)
  (design only).
- Automated tests: Vitest (unit / integration / security) + Playwright
  smoke E2E. GitHub Actions runs typegen, typecheck, lint, unit, security,
  integration, Playwright, production build, and a **runtime** dependency
  gate (`npm run test:audit-policy`) on **ubuntu-latest and windows-latest**.
  `npm audit` is still written for visibility. The Prisma CLI `deepmerge-ts`
  High advisory is a dated development-only exception — see
  `docs/security/DEPENDENCY_EXCEPTION_REGISTER.md`.
  `docs/security/SECURITY_REGRESSION_MATRIX.md`.

**Step 2A-R6 invariants (must hold; R5 unresolved-source / exception
identity still hold):**

- **EVENT/DATE OWNERSHIP:** a date may only resolve a qualifying event
  when it can be deterministically associated with that event's source
  occurrence. Hearing, grievance, appeal, and other event dates must
  never be borrowed to resolve an undated dismissal or resignation.
- **ADVISORY SET:** every High/Critical advisory must be independently
  identified and authorized. One approved advisory never causes a
  vulnerability record that also contains unknown, malformed, or
  unapproved High/Critical advisories to pass.

**Step 2A-R5 invariants (must hold; R4 source-span / civil-date /
portability still hold):**

- **UNRESOLVED QUALIFYING SOURCE:** a deadline may not be confirmed while
  another potentially qualifying source occurrence exists with an
  unresolved, partial, ambiguous, invalid, or missing date.
- **EXCEPTION IDENTITY:** a dependency exception applies only to the
  exact approved advisory identity and approved dependency context.
  Unknown or different High advisories never inherit another advisory's
  exception.

**Step 2A-R4 invariants (must hold; R3 hearing-urgency still holds):**

- **SOURCE OCCURRENCE:** two distinct source spans are two candidates even
  when type, date, sentence, and raw phrase match.
- **SOURCE CONTINUITY:** a same-date replacement must not inherit
  confirmation provenance. Confirmation matches a `span:` fingerprint.
- **CIVIL DATE:** legal arithmetic is host-timezone independent
  (`YYYY-MM-DD` / `{year,month,day}`). ERA_EQA_3M_LESS_1D = add 3 calendar
  months (month-end clamp) then subtract 1 calendar day.
- **Confirmation:** stored source still exists, uniquely identifiable by
  span fingerprint (not type+date), type still qualifying, source date
  unchanged, rule matches, stored due date equals the recomputed civil due
  date, and no second qualifying limitation-start candidate exists.
- **Procedural urgency:** relative dates resolve against an injectable
  Europe/London clock; a hearing tomorrow persists as procedural attention
  and remains HIGH/CRITICAL across refresh until resolved.
- **AUDIT EXECUTION:** failure to execute or parse npm audit is ERROR,
  never PASS. npm is launched via `process.execPath` + `npm_execpath`.
- **PORTABILITY:** the same npm scripts run on Windows and Linux; Windows
  CI is a merge gate. Vitest/E2E own disposable SQLite URLs and refuse
  hosted/`dev.db` destructive setup.
- **E2E lifecycle:** `scripts/e2e-run.mjs` is the sole owner; disposable
  `prisma/e2e.db`; two consecutive `npm run test:e2e` exit 0 with port 4127 free.

**Target architecture** (Supabase Postgres + Supabase Auth + RLS + Stripe
as sole entitlement writer + structured forensic findings + FACT/INFERENCE/
LEGAL_SOURCE/CALCULATION/SUGGESTION/NEEDS_REVIEW taxonomy) is recorded in
**[ADR-0002](docs/adr/0002-target-architecture-supabase-stripe-rls.md)** as
**proposed, not started** — it is blocked on the user providing a real
Supabase project and Stripe keys, and must be migrated incrementally,
table by table, never as a single rewrite.

## 3. What's implemented today

- Marketing landing page (`/`), signup (`/signup`), login (`/login`).
- UJU onboarding wizard (`/onboarding`): situation picker → free-text
  narrative → deterministic signal extraction (dates, people, protected
  characteristics/issues, ACAS/limitation deadline) → Case Twin + UJU
  Brief created.
- Justice Command Centre (`/home`): most urgent case surfaced, other cases
  listed, readiness score, next-best-action preview.
- Case overview (`/cases/[caseId]`): next-best-action banner, Case
  Readiness Score, resolution-ladder journey stepper, upcoming deadline
  banner, full UJU Brief, action-item checklist, detected issues.
- Evidence upload **server action** + forensic analysis pipeline exists
  (`src/lib/actions/evidence.ts`, `src/lib/forensics/evidence.ts`) and is
  wired into case readiness — but **there is no `/cases/[caseId]/evidence`
  page yet** to drive the upload form from the UI (see Known Gaps).
- Document generation (Action Engine) logic exists
  (`src/lib/actions/documents.ts`, `src/lib/ai/documents.ts`:
  chronology, grievance letter, SAR request, ET1 particulars skeleton,
  witness statement skeleton, settlement proposal) but has **no page** to
  trigger it from yet.
- Billing server actions + Stripe webhook exist but have **no `/pricing`
  or `/billing` page** yet.
- `/api/health` (liveness + DB connectivity check).
- Branding: UJRIS emblem + wordmark lockup images
  (`public/brand/ujris-emblem.jpg`, `public/brand/ujris-lockup.jpg`)
  wired into the header/footer logo (`src/components/logo.tsx`), a larger
  brand mark on auth pages and the landing hero
  (`src/components/brand-mark.tsx`), the app favicon/app icon
  (`src/app/icon.png`, `src/app/apple-icon.png`), and the social share
  image (`src/app/opengraph-image.jpg`).

## 4. Known gaps / incomplete (do not assume these work)

- **Dead navigation links**: `CaseTabs` links to `/cases/[id]/evidence`,
  `/timeline`, `/deadlines`, `/actions` — none of these pages exist yet
  (404). `AppHeader`/landing links to `/pricing` and `/billing` — same.
  This predates this ticket (ADR-0001 baseline) and is **not** fixed here;
  it needs its own scoped ticket(s) per page.
- No RLS, no Supabase — see ADR-0002. **Do not start Supabase in a
  follow-on until Step 2A independent review passes.**
- Playwright E2E is smoke-only (landing + login + unauthenticated
  evidence GET). GitHub Actions runs the same `npm run test:e2e` twice
  (`scripts/e2e-run.mjs` owns Next + Playwright) and verifies port 4127
  is free after each run.
- No AI usage/cost observability / grounding validation (Codex finding 10;
  out of scope for Step 2A).
- Forensic findings are still a JSON blob at runtime; schema is design-only.
- `middleware.ts` uses a convention Next.js 16 has deprecated in favour of
  `proxy.ts` (still functions; not yet migrated — low priority, tracked
  here so it isn't mistaken for an oversight). Cookie *presence* only —
  revocation is enforced in Node `verifySessionToken`, not at the edge.
- **STITCH UX REVIEW: PENDING AUTHENTICATED ACCESS.** The Stitch prototype
  remains an authoritative UX reference, but independent review could not
  open it because Google sign-in blocked access. No design findings have
  been invented from that gap. Do not redesign UI until authenticated
  access exists.

## 5. Environment & secrets

Local dev needs **zero** external secrets (see `.env.example`). Optional,
for enabling non-fallback behaviour:

| Variable | Effect if set | Effect if unset |
|---|---|---|
| `OPENAI_API_KEY` | UJU Brief prose is phrased by a real model (facts still come only from the deterministic extractor) | Deterministic template phrasing is used |
| `STRIPE_SECRET_KEY` + `STRIPE_PRICE_PROTECT`/`STRIPE_PRICE_ADVOCATE` + `STRIPE_WEBHOOK_SECRET` | Real Stripe Checkout + webhook-driven entitlements | Paid checkout **fails closed** — no paid plan is granted |
| `UJRIS_ALLOW_DEV_BILLING=true` | Non-production only: simulated paid activation (`SUBSCRIPTION_DEV_MODE_ACTIVATED`). Ignored when `NODE_ENV=production`. | Unset (default): no simulation |
| `AUTH_SECRET` | Required in production (app refuses to boot without a real one); dev has an insecure fallback with a console warning | — |

No Supabase variables exist yet — they will be introduced by the first
ADR-0002 migration ticket, and must be supplied as Cursor secrets, not
invented.

## 6. How to run locally

```bash
npm install
npx prisma migrate deploy   # creates/updates prisma/dev.db
npm run dev -- -p 4127      # http://localhost:4127
```

`npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build`
should all pass cleanly before any ticket is considered done — see Ticket
Log for the last verified run of each.

## 7. Ticket log

### 2026-09-11 — Step 2A-R6 (Codex 2A-R5 FAIL — date ownership + advisory set)

Branch: `step-2a-security-test-foundation` — **not merged**. Step 2B /
Supabase **not started**. Forensic worker **not implemented**. R4/R5
source-span, unresolved-qualifying-source, civil-date, hearing-urgency,
Windows/Linux CI, and two-cycle E2E work **not reopened**.

Codex independently reproduced: an undated dismissal inheriting a
hearing date and becoming confirmable; an approved GHSA plus an unknown
or malformed High still PASSing the dependency gate.

Remediation: nearest same-sentence event-mention date ownership;
confirmation provenance check; per-`via` advisory evaluation. EX-DEP-001
itself is unchanged.

See `docs/implementation/STEP2A_R6_PLAN.md` and
`docs/implementation/STEP2A_R6_IMPLEMENTATION_REPORT.md`.

**Requires independent review:** YES — return this branch to Codex for a
narrow check of date ownership, advisory-set semantics, and focused
R4/R5 regression. Do not merge. Do not start Supabase. Do not start
Step 2B. Do not claim production-ready.

### 2026-09-10 — Step 2A-R5 (Codex 2A-R4 FAIL — ambiguous date + exception identity)

Branch: `step-2a-security-test-foundation` — **not merged**. Step 2B /
Supabase **not started**. Forensic worker **not implemented**. R4
source-span, civil-date, hearing-urgency, Windows/Linux CI, and two-cycle
E2E work **not reopened**.

Codex independently reproduced two remaining blockers: a complete
dismissal date plus a second qualifying mention whose date is incomplete,
invalid, or missing could still confirm with high confidence; an unknown
High advisory on an approved Prisma CLI path could inherit
`GHSA-ggr8-5vv4-36mx` via package/via-name matching.

Remediation: preserve unresolved qualifying source occurrences; refuse
confirmation (`unresolved_qualifying_source`); require exact advisory ID
for dependency exceptions. EX-DEP-001 itself is unchanged.

See `docs/implementation/STEP2A_R5_PLAN.md` and
`docs/implementation/STEP2A_R5_IMPLEMENTATION_REPORT.md`.

**Requires independent review:** YES — return this branch to Codex for a
narrow check of these two remediations plus focused R4 regression.
Do not merge. Do not start Supabase. Do not start Step 2B. Do not claim
production-ready.

### 2026-09-10 — Step 2A-R4 (Codex 2A-R3 FAIL — cross-platform & deadline identity)

Branch: `step-2a-security-test-foundation` — **not merged**. Step 2B /
Supabase **not started**. Forensic worker **not implemented**.
Hearing-urgency R3 work **not reopened**.

Codex independently reproduced: same-sentence same-day events collapsing
to one candidate; same-date source replacement still confirming; civil due
dates differing under `TZ=UTC` vs `TZ=Europe/London`; `spawn npm` ENOENT
on Windows; abnormal audit execution incompletely classified; Vitest/E2E
bootstrap not independently reproducible; E2E DB init failing before the
server starts.

Remediation: span-based occurrence identity; confirmation refuses
same-date replacement; pure civil-date ERA_EQA_3M_LESS_1D arithmetic;
portable `process.execPath` command runner; fail-closed audit subprocess
model; absolute disposable SQLite URLs; staged E2E lifecycle; Windows +
Linux CI matrix.

SQLite `DateTime` legal dates stay as UTC Y-M-D carriers. PostgreSQL
`DATE` is documented for Step 2B — no destructive SQLite migration.

See `docs/implementation/STEP2A_R4_PLAN.md` and
`docs/implementation/STEP2A_R4_IMPLEMENTATION_REPORT.md`.

**Requires independent review:** YES — return this branch to Codex.
Do not merge. Do not start Supabase. Do not claim production-ready.

### 2026-09-10 — Step 2A-R3 (Codex 2A-R2 FAIL — final blocker remediation)

Branch: `step-2a-security-test-foundation` — **not merged**. Step 2B /
Supabase **not started**. Forensic worker **not implemented**.

Codex independently reproduced four remaining blockers: confirmation
accepting wrong due dates / same-day source collapse / competing
candidates; “My hearing is tomorrow” dropping HIGH→STANDARD on refresh;
dependency policy inheriting runtime paths and treating audit-service
errors as PASS; E2E teardown hang + Vitest/E2E clean-checkout failure.

Remediation: confirmation invariant (fingerprint + recomputed due date);
injectable clock + procedural hearing persistence through refresh;
path-class fail-closed audit policy (`PASS|FAIL|ERROR`); single-owner
`scripts/e2e-run.mjs` with disposable `e2e.db`.

See `docs/implementation/STEP2A_R3_PLAN.md` and
`docs/implementation/STEP2A_R3_IMPLEMENTATION_REPORT.md`.

**Requires independent review:** YES — return this branch to Codex for
one final merge gate. Do not merge. Do not start Supabase. Do not claim
production-ready.

### 2026-09-10 — Step 2A-R2 (Codex 2A-R re-check FAIL — final gate)

Branch: `step-2a-security-test-foundation` — **not merged**. Step 2B /
Supabase **not started**. Forensic worker **not implemented**.

Codex independently reproduced: confirmation not source-bound; hearing
tomorrow dropping urgency to STANDARD on refresh; logout test not replaying
the captured cookie; acknowledged unresolved dates hidden on overview;
package-name dependency exceptions; Playwright teardown hang.

Remediation: exact provenance confirmation; `legal_limitation` vs
`procedural_attention`; ack ≠ hide; cookie-replay security test; exact
`GHSA-ggr8-5vv4-36mx` matching; Node E2E supervisor.

See `docs/implementation/STEP2A_R2_PLAN.md` and
`docs/implementation/STEP2A_R2_IMPLEMENTATION_REPORT.md`.

**Requires independent review:** YES — return this branch to Codex. Do not
merge. Do not start Supabase. Do not claim production-ready.

### 2026-09-10 — Step 2A-R (Codex FAIL blockers only)

Branch: `step-2a-security-test-foundation` — **not merged**. Step 2B /
Supabase **not started**. Forensic worker **not implemented**.

Codex blockers addressed: stricter date parser + event-type allow-list so
hearing/tribunal-order/grievance cannot become a confirmed limitation start;
invalid civil dates never roll over; acknowledgement does not reduce urgency;
clean-checkout `next typegen` + test DB production guard; security tests hit
real routes/actions; limiter uses lazy TTL + max buckets (no global timer);
forensic **design** provenance/versioning completed.

See `docs/implementation/STEP2A_R_PLAN.md`,
`docs/implementation/STEP2A_R_IMPLEMENTATION_REPORT.md`,
`docs/testing/CLEAN_CHECKOUT_TESTING.md`.

**Requires independent review:** YES — return this branch to Codex. Do not
merge. Do not start Supabase.

### 2026-09-09 — Step 2A remediation (independent review was FAIL)

Failed head: `fd78b1e059d9216e03f237145625eacac009a870`.  
Branch: `step-2a-security-test-foundation` — **not merged**. Step 2B **not started**.  
Independent review verdict remains **FAIL** until a new review of the
remediation head.

Addressed: strict civil dates (no rollover / no auto-confirm), urgency
preserved after acknowledgement, clean-checkout `next typegen`, route-level
security tests, `ForensicFinding` provenance/versioning, bounded hashed
rate-limiter, uniform auth messages (registration success-vs-fail residual
documented), dependency policy instead of a bare failing audit job.

See `docs/implementation/STEP2A_REMEDIATION_REPORT.md` and
`docs/audits/*`.

### 2026-09-09 — Step 2A: security stabilisation + automated test foundation

Branch: `step-2a-security-test-foundation` (not merged to `main`).
Supabase: **not started**. UI: **not redesigned**. Forensic inspector:
**design only**.

**STITCH UX REVIEW: PENDING AUTHENTICATED ACCESS**

**What changed:**
- Vitest + Playwright test foundation; GitHub Actions CI.
- Evidence downloads cannot execute HTML/SVG/JS on the app origin.
- Auth rate limiting (in-memory, documented interim) + session `jti`
  revocation via `AuthSession`.
- Billing fail-closed when Stripe is missing.
- Conservative/ambiguous deadline inference; forensic timestamp rule
  F-TS-001 no longer treats reversed timestamps as “later revision”.
- Evidence + custody in a Prisma transaction; SHA-256 recompute
  verification; ownership on `refreshCaseIntelligence`.
- Docs: `docs/implementation/STEP2A_PLAN.md`,
  `docs/implementation/STEP2A_IMPLEMENTATION_REPORT.md`,
  `docs/security/SECURITY_REGRESSION_MATRIX.md`,
  `docs/architecture/FORENSIC_DOCUMENT_INSPECTOR.md`.

**Database:** additive `AuthSession` table only.

**Requires independent review:** YES — send this branch to Codex for
Step 2A adversarial verification. Do not merge to `main` from this ticket.
Do not begin Supabase until that review passes.

See the implementation report for command output, residual risks, and
what will be superseded during the Supabase migration.

### 2026-09-09 — Governance bootstrap + brand asset integration

**Files changed:**
- Added: `PROJECT_STATE.md`, `docs/adr/0001-baseline-nextjs-prisma-sqlite.md`,
  `docs/adr/0002-target-architecture-supabase-stripe-rls.md`.
- Added: `public/brand/ujris-emblem.jpg`, `public/brand/ujris-lockup.jpg`,
  `src/app/icon.png`, `src/app/apple-icon.png`, `src/app/opengraph-image.jpg`,
  `src/components/brand-mark.tsx`.
- Modified: `src/components/logo.tsx` (renders the emblem image instead of
  a generic icon), `src/app/layout.tsx` (OG/Twitter metadata +
  `TooltipProvider` prop fix), `src/app/page.tsx` (brand mark in hero +
  footer), `src/app/login/page.tsx`, `src/app/signup/page.tsx` (brand mark
  replaces plain wordmark), `package.json`/`package-lock.json` (added
  `sharp`, used to pre-render the icon/OG assets at build time and used by
  `next/image` in production).
- Also fixed, as a prerequisite (the baseline had never been typechecked
  or committed — see ADR-0001): every `asChild` usage across
  `src/app/page.tsx`, `src/app/home/page.tsx`,
  `src/app/cases/[caseId]/page.tsx`, `src/components/app-header.tsx`,
  `src/components/user-menu.tsx` converted to Base UI's `render` prop;
  `TooltipProvider delayDuration` → `delay`; a `Buffer`/`BodyInit` typing
  fix in the evidence download route; three unused-variable lint warnings.
- Deleted: `src/app/favicon.ico` (superseded by `src/app/icon.png`).

**Database/security/privacy implications:** none. No schema change, no new
data collected, no change to auth/authorization logic. Brand images are
static public assets (logos), not user data.

**Acceptance tests performed:**
- `npx tsc --noEmit` — clean (0 errors; previously 15 pre-existing errors
  from the `asChild`/Base UI mismatch, fixed as a prerequisite).
- `npx eslint .` — clean (0 warnings/errors; previously 3 unused-var
  warnings, fixed).
- `npm run build` — succeeds; confirms `/icon.png`, `/apple-icon.png`,
  `/opengraph-image.jpg` are generated as static routes.
- Manual `curl` against the running dev server: `/`, `/login`, `/signup`,
  `/icon.png`, `/apple-icon.png`, `/opengraph-image.jpg`,
  `/brand/ujris-emblem.jpg`, `/brand/ujris-lockup.jpg`, `/api/health` all
  return `200`.
- Visual verification via an independent computer-use check of the landing
  page (header, hero, footer), `/login`, and `/signup`: brand marks render
  with correct rounded corners, no cropping, no broken/missing images; the
  browser tab favicon shows the UJRIS emblem rather than a generic icon.
  Confirmed passing.

**Known limitations:** this ticket did not build the missing pages listed
in §4 (Known gaps); it did not touch auth, database, or billing logic; it
did not begin the Supabase/RLS migration (ADR-0002) — that requires
user-provided credentials and its own ticket(s). Favicon at very small
sizes (16×16 browser tab) reproduces a detailed emblem, which is legible
as a gold badge shape but not as readable text at that size — inherent to
using the supplied artwork rather than a simplified icon-only mark; flagged
here rather than silently redesigned.

**Requires independent review:** yes — this ticket has not been reviewed
by Codex or any other independent reviewer. Nothing in this repository has
been reviewed; this is the first attempt to establish that process.
