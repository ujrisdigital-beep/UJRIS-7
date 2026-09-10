# Step 2A-R plan

Branch: `step-2a-security-test-foundation`  
Failed Codex head: `a1a0b0aabd5c8256ed781853b890156729474942`  
Supabase / Step 2B: **not in this ticket**  
UI: **not redesigned**

This plan exists before implementation, as required.

## Codex blockers and root causes

| # | Blocker | Root cause at current head |
|---|---------|----------------------------|
| 1 | Deadline safety still incorrect | Event kinds are only `hearing` / `event` / `deadline_mention`. Grievance, tribunal order, document dates still qualify as limitation starts. `confirmDeadlineAction` confirms any stored row with a due date and rule id — it does not check event type. Parse record lacks `parse_status` / `source_type`. ISO `2026-13-01` and `2026-00-12` are not covered. Output contract is missing `warning_date`, `rule_id`, `limitations`. |
| 2 | Invalid dates normalizing | Round-trip parser exists, but extraction still does not expose parse_status on every token, and ISO / timezone / `YYYY-13-01` paths are incomplete. Tests would not fail if a later helper reintroduced `new Date(y, m, d)` rollover for ISO strings. |
| 3 | Urgency after acknowledgement | Refresh no longer drops acknowledged rows, but there is no test that a **new earlier candidate increases urgency**, that **refresh cannot confirm** an unconfirmed date, or that **ambiguous + acknowledged** stays unconfirmed. |
| 4 | Fresh-checkout typecheck | `next-env.d.ts` currently imports `.next/dev/types/*` (dev-server output). A clean CI/`next typegen` tree emits `.next/types`. Tests do not refuse a production-shaped `DATABASE_URL`. |
| 5 | Weak security tests | `session-revocation.test.ts` and `billing-mode.test.ts` still call helpers only. Removing `getCurrentUser` / route ownership would not fail those files. |
| 6 | Forensic provenance design incomplete | Design has finding columns but not report/schema/rule-set/pipeline versions, observation raw/normalized/extractor versions, immutability-after-finalization, or a reproducibility principle. |
| 7 | Limiter retention | Max buckets exist, but a **1s `setInterval`** is started on consume. Codex asked for lazy TTL pruning without a teardown-hostile global timer. |

Passed Step 2A behaviour that must be preserved: attachment HTML/SVG, session `jti` revocation, billing fail-closed, F-TS-001 ordering, evidence/custody transaction, SHA-256 recompute, cross-user refresh denial.

## Files to modify

- `src/lib/legal/strict-date.ts` — ISO/UK/timezone parser + parse record
- `src/lib/legal/event-semantics.ts` (new) — event types + limitation-start allow-list
- `src/lib/legal/date-inference.ts` — typed contract; never confirm from extraction
- `src/lib/legal/derived-deadline.ts` — honour event-type allow-list
- `src/lib/ai/heuristics.ts` — classify event types; keep parse_status
- `src/lib/ai/gateway.ts` — use new contract; warning vs selected
- `src/lib/actions/cases.ts` — confirm only allow-listed event types; refresh cannot confirm
- `src/lib/cases/refresh-intelligence.ts` — urgency from unresolved only; do not write confirmation
- `prisma/schema.prisma` + additive migration — `sourceEventType` on Deadline
- `src/lib/rate-limit.ts` — remove interval; lazy sweep + cap
- `tests/setup.ts` — refuse production DATABASE_URL
- `next-env.d.ts` / `package.json` typecheck — typegen → `.next/types`
- `tests/security/*` — route/action boundaries for session, billing, ownership
- `docs/architecture/FORENSIC_DOCUMENT_INSPECTOR.md`
- CI, PROJECT_STATE, reports, exception register, clean-checkout doc

## Acceptance tests

- Hearing-only / tribunal-order-only / grievance-only → not confirmed limitation start
- Clear dismissal → provisional candidate, not confirmed until explicit confirm of an allow-listed type
- 31 Feb, 31 Apr, non-leap 29 Feb, 2026-13-01, 2026-00-12 → invalid, never rolled to March/January
- Leap 29 Feb valid; ambiguous 03/04/2026 unconfirmed; missing year insufficient
- Ack + refresh keeps urgency; resolve may drop; new earlier due date can raise urgency
- Refresh does not set `confirmationStatus=confirmed`
- Session replay denied on evidence GET; billing action fail-closed without Stripe; User B denied on refresh action
- Limiter: expired pruned lazily; max buckets enforced **without** a live interval
- `rm -rf .next prisma/test.db` then `npm run typecheck` succeeds

## Residual risk

Heuristic event typing from prose will still miss some UK phrasing. Signup success vs failure can still enumerate. Limiter remains single-process. Forensic **runtime** inspector is still not built.

## Rollback

Revert this branch’s 2A-R commits. Additive `sourceEventType` column is nullable-safe if omitted by old code (we will default `unknown`).
