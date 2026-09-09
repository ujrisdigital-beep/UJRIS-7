# UJRIS — Project State

> **Read this file, and the ADRs in `docs/adr/`, before making any change.**
> This file is the single source of truth for what exists, what's missing,
> and what's next. Update it as part of every ticket — a ticket is not
> done until this file reflects reality.

Last updated: 2026-09-09 (ticket: brand asset integration — see Ticket Log).

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
- Custom auth: bcrypt + `jose` HS256 JWT in an `httpOnly` cookie
  (`src/lib/auth.ts`). **Not** Supabase Auth yet.
- Authorization: every server action / route handler re-checks
  `record.userId === session.userId` before reading/writing. No RLS yet
  (SQLite has none; Postgres/RLS migration is ADR-0002, not started).
- Evidence files: local disk under `data/evidence/` (git-ignored), served
  only via an authenticated, ownership-checked route
  (`src/app/api/evidence/[evidenceId]/file/route.ts`). No object storage,
  no signed URLs yet.
- Billing: real Stripe subscription-mode Checkout wiring
  (`src/lib/actions/billing.ts`, `src/app/api/billing/webhook/route.ts`),
  with a clearly-audited local "dev mode" fallback when no Stripe keys are
  configured (`SUBSCRIPTION_DEV_MODE_ACTIVATED` audit event — never
  confused with a real payment).
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
- No RLS, no Supabase — see ADR-0002.
- No automated tests exist (unit/integration/E2E) for any area.
- No AI usage/cost observability.
- Forensic findings are a JSON blob, not the structured per-finding rows
  the charter requires.
- `middleware.ts` uses a convention Next.js 16 has deprecated in favour of
  `proxy.ts` (still functions; not yet migrated — low priority, tracked
  here so it isn't mistaken for an oversight).
- `next.config.ts`, ESLint, and Tailwind configs are default/minimal —
  no CI pipeline configured in this repo yet.

## 5. Environment & secrets

Local dev needs **zero** external secrets (see `.env.example`). Optional,
for enabling non-fallback behaviour:

| Variable | Effect if set | Effect if unset |
|---|---|---|
| `OPENAI_API_KEY` | UJU Brief prose is phrased by a real model (facts still come only from the deterministic extractor) | Deterministic template phrasing is used |
| `STRIPE_SECRET_KEY` + `STRIPE_PRICE_PROTECT`/`STRIPE_PRICE_ADVOCATE` + `STRIPE_WEBHOOK_SECRET` | Real Stripe Checkout + webhook-driven entitlements | Local "dev mode" simulated subscription (clearly audited) |
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

`npx tsc --noEmit`, `npx eslint .`, and `npm run build` should all pass
cleanly before any ticket is considered done — see Ticket Log for the last
verified run of each.

## 7. Ticket log

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
