# ADR-0002: Target architecture — Supabase Postgres + Supabase Auth + RLS, Stripe as billing source of truth

## Status

**Proposed — not yet implemented.** This records the architecture UJRIS must
migrate to per the current operating charter, and the incremental plan for
getting there. It is intentionally **not** executed as a single rewrite:
per the operating model ("Never rewrite the application wholesale. Preserve
useful existing functionality and migrate incrementally"), each row below
becomes its own ticket, scoped, reviewed, and merged independently.

**Blocked on:** a real Supabase project (URL + anon key + service-role key)
and, when billing is exercised end-to-end, live Stripe keys + webhook
secret. These must be supplied by the user as Cursor secrets (Cloud Agents
→ Secrets) or environment variables — they are not something this agent can
fabricate, and no migration ticket that touches auth/RLS should be marked
complete without running its migrations and authorization tests against a
real (even if disposable/staging) Supabase project.

## Context

ADR-0001 describes the as-built baseline (Prisma/SQLite, custom JWT auth,
local disk storage). The operating charter for this project now mandates:

- Supabase PostgreSQL as the system of record.
- Supabase Auth for authentication.
- Row Level Security mandatory on every private tenant/user table.
- Authorization enforced in the data/API layer, never only in React.
- Stripe as the billing source of truth; entitlements server-authoritative;
  the browser cannot choose prices, tiers, or privileged roles.
- Evidence originals immutable after ingestion, with a fixed required
  metadata set (see "Evidence invariant" in the charter) and derived
  artifacts (OCR/transcription/AI output) stored as separate records.
- A Forensic Document Inspector whose findings are strictly structured
  (`finding_type`, `observed_value`, `rule/method`, `severity`,
  `confidence`, `explanation`, `limitations`, `source/tool/version`,
  `timestamp`, `report/version linkage`) and never accusatory.
- AI outputs distinguish FACT / INFERENCE / LEGAL_SOURCE / CALCULATION /
  SUGGESTION / NEEDS_REVIEW.
- Dangerous parsing (untrusted uploaded documents) isolated from the main
  application runtime.

## Decision

Adopt the following target architecture, reached incrementally:

| Layer | Current (ADR-0001) | Target |
|---|---|---|
| Database | Prisma + SQLite | Prisma (or Supabase-generated types) + Supabase Postgres, RLS on every tenant table |
| Auth | Custom bcrypt+JWT | Supabase Auth (email/password to start); server-side session verified via Supabase server client on every request |
| Authorization | App-layer ownership checks only | App-layer checks **and** RLS policies (defense in depth — RLS is not a replacement for query-layer checks, it is the backstop) |
| File storage | Local disk, git-ignored | Supabase Storage (private bucket), signed short-lived download URLs, no public bucket access |
| Billing | Stripe subscriptions + local "dev mode" fallback | Stripe unchanged as source of truth; webhook-verified, idempotent event handling is the *only* writer of `plan`/`status`; dev-mode fallback is removed once real keys are configured, and is loudly logged (already true) while it remains active |
| Evidence model | Single `Evidence` row with a `forensics` JSON blob | `evidence_original` (immutable, fixed required columns per the Evidence invariant) + separate `evidence_derived` rows (OCR text, transcription, AI extraction) + separate `forensic_finding` rows (one row per finding, structured per the Forensic invariant) |
| Untrusted file parsing | In-process (`exifr`, `pdf-lib`) | Move to an isolated worker/sandbox process before this is exposed to any untrusted, adversarial-quality input at scale; acceptable to keep in-process only while inputs are trusted test fixtures |
| AI truth labelling | 5-way `TruthLayer` enum (`user_assertion` / `document_evidence` / `external_authority` / `ai_inference` / `human_verified`) | Migrate to the charter's 6-way taxonomy: FACT / INFERENCE / LEGAL_SOURCE / CALCULATION / SUGGESTION / NEEDS_REVIEW, with a mapping/migration for existing rows |
| AI observability | None | Per-call record of model/provider/prompt version + cost/latency, with case content excluded from any third-party analytics |
| Legal rules | Hard-coded constants in `src/lib/legal/*.ts` | Versioned, server-side rules records (e.g. a `legal_rule_version` table) so mutable statutory figures (Vento bands, limitation periods) are not baked into frontend code and can be updated with an audit trail |

## Migration plan (incremental, ticket-sized)

1. Provision a Supabase project (user-provided secrets); introduce the
   Supabase client alongside (not replacing) Prisma; stand up `users` /
   `profiles` synced from Supabase Auth.
2. Pick **one** low-risk table (e.g. `case`) to migrate to Supabase Postgres
   with RLS first, prove the pattern (policy + app-layer check + tests),
   then repeat table-by-table.
3. Introduce Supabase Storage for *new* evidence uploads behind a feature
   flag while old local-disk evidence remains readable; backfill/migrate
   once proven.
4. Split `Evidence` into `evidence_original` / `evidence_derived` /
   `forensic_finding` with an additive migration (new tables first, dual
   write, then cut over reads, then drop the old JSON blob column).
5. Move Stripe webhook handling to be the sole writer of entitlements;
   delete the dev-mode fallback only once real keys are confirmed working
   in every environment that needs it.
6. Introduce the FACT/INFERENCE/LEGAL_SOURCE/CALCULATION/SUGGESTION/
   NEEDS_REVIEW taxonomy as an additive column, migrate call sites, then
   deprecate the old `TruthLayer` enum.
7. Add AI call observability (provider/model/prompt version/cost) as an
   additive table before any ticket adds a new AI call path.

## Consequences

- Short-term: two data-access patterns coexist (Prisma/SQLite for
  unmigrated tables, Supabase/Postgres+RLS for migrated ones). This is
  accepted temporary complexity in exchange for never doing an
  uncontrolled big-bang rewrite.
- Every ticket that touches a migrated table must include the RLS policy,
  the app-layer check, and an authorization test proving a user cannot
  read/write another user's row.
- No ticket may claim "production-ready," "secure," or "compliant" — only
  "migrated to Supabase with RLS + tests passing," reviewed independently.
