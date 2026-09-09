# ADR-0001: Baseline architecture — Next.js + Prisma/SQLite + custom JWT auth

## Status

Accepted (historical record). This describes what was actually built for the
first UJRIS slice, **before** the operating model in this document set
(PROJECT_STATE.md, ADR process, Codex-reviewed ticket workflow) was
introduced. It predates and does **not** conform to the architectural
invariants adopted in [ADR-0002](./0002-target-architecture-supabase-stripe-rls.md).
It is recorded here, rather than silently rewritten, so future tickets can
migrate incrementally instead of guessing what exists.

## Context

UJRIS v1 was built as a single self-represented-claimant product slice: UJU
onboarding → Case Twin → Evidence intelligence → Action Engine (document
drafting) → billing scaffolding. It needed to be runnable with zero external
credentials in a sandboxed dev environment, so every dependency that could
have a "local/dev-mode" fallback was given one.

## Decision (as built)

- **Framework**: Next.js 16 (App Router, Turbopack), React 19, TypeScript,
  Tailwind v4, shadcn/ui (generated in the "base-nova" style, on top of
  `@base-ui/react` — **not** Radix; components use the `render` prop for
  composition, not `asChild`).
- **Database**: Prisma ORM against a local SQLite file (`prisma/dev.db`,
  git-ignored). Schema deliberately avoids Postgres/SQLite-only features so
  the same schema can point at Postgres later.
- **Auth**: Hand-rolled — `bcryptjs` password hashing, `jose`-signed HS256
  JWT stored in an `httpOnly` cookie (`src/lib/auth.ts`). No third-party
  identity provider.
- **Authorization**: Enforced in server actions / route handlers by
  re-fetching the record and checking `record.userId === session.userId`
  before every read/write (see `src/lib/actions/*.ts`). No database-level
  Row Level Security — SQLite has no RLS mechanism, and the single Postgres
  equivalent has not been introduced yet.
- **File storage**: Local filesystem under `data/evidence/` (git-ignored),
  served only through an authenticated, ownership-checked route handler
  (`src/app/api/evidence/[evidenceId]/file/route.ts`). Not object storage;
  no signed URLs.
- **Billing**: Stripe subscription-mode Checkout Sessions wired end-to-end
  (`src/lib/actions/billing.ts`, `src/app/api/billing/webhook/route.ts`), but
  when no `STRIPE_SECRET_KEY`/price IDs are configured it falls back to a
  "dev mode" that activates the plan directly in the database — clearly
  logged via an audit event (`SUBSCRIPTION_DEV_MODE_ACTIVATED`) so it can
  never be mistaken for a real payment in the audit trail.
- **AI**: A deterministic, fully-explainable heuristic engine
  (`src/lib/ai/heuristics.ts`, `src/lib/ai/gateway.ts`) does signal
  extraction (dates, people, protected-characteristic/issue keywords),
  deadline calculation (`src/lib/legal/deadlines.ts`), and document drafting
  (`src/lib/ai/documents.ts`) with zero external calls. An optional OpenAI
  call can *phrase* (never invent facts for) the UJU Brief narrative if
  `OPENAI_API_KEY` is set; the gateway always has a working fallback.
- **Forensics**: `src/lib/forensics/evidence.ts` extracts EXIF (images, via
  `exifr`) and PDF metadata (via `pdf-lib`), computes SHA-256, and raises
  neutrally-worded flags ("date mismatch", "modified after capture",
  "metadata stripped") — never an accusation of fraud/forgery.

## Consequences

- The app is fully runnable and demoable with zero external secrets.
- It violates several invariants now required going forward: no Supabase,
  no RLS, custom auth instead of Supabase Auth, local disk instead of
  object storage, no structured forensic-finding schema (`finding_type` /
  `confidence` / `limitations` / `source` per finding), no per-finding
  audit-event linkage, no AI usage/cost observability.
- Several planned routes referenced in the UI were never built in this
  slice: `/pricing`, `/billing`, and the case sub-tabs `/evidence`,
  `/timeline`, `/deadlines`, `/actions` (see `CaseTabs`) all currently
  404. This is tracked as a known gap in `PROJECT_STATE.md`, not silently
  patched inside unrelated tickets.
- No automated tests exist yet (unit, integration, or E2E).

## Migration path

See ADR-0002. Migration is incremental: new tenant-sensitive tables should
be modeled directly in Supabase Postgres with RLS from the start; existing
SQLite-only functionality migrates ticket-by-ticket, not in one rewrite.
