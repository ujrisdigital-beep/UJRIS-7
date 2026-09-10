# Step 2A-R implementation report

Branch: `step-2a-security-test-foundation`  
Head (this report): see git log tip after the 2A-R commits  
Plan: `docs/implementation/STEP2A_R_PLAN.md`  
Supabase / Step 2B: **not started**  
UI redesign: **none**  
Forensic worker: **not implemented**  
Merged to `main`: **No**  
Production readiness: **not claimed**  
Independent review: **required (Codex)**

This report remediates the second Codex FAIL. It does not mark that review PASS.

## Codex findings and remediation

| Blocker | Root cause | Fix |
|---|---|---|
| Deadline safety | Hearing/grievance/tribunal-order dates could qualify; confirmation only checked dueDate/ruleId/sourceEventDate | Event-type allow-list; confirmation re-infers narrative and refuses non-allow-listed / ambiguous / insufficient cases |
| Invalid dates | JS Date rollover / incomplete ISO paths | `parseLegalDate` with `parse_status`; INVALID never becomes VALID |
| Urgency after ack | Missing tests that refresh cannot confirm / earlier candidate can raise urgency | Ack writes `acknowledged_at` only; urgency from unresolved deadlines; new tests |
| Fresh typecheck | `next-env.d.ts` imported `.next/dev/types` | `next typegen` + pin import to `.next/types` |
| Weak security tests | Helpers / tautologies | Evidence GET, `logoutAction`, `startCheckoutAction`, `refreshCaseIntelligence`, `uploadEvidenceAction` |
| Forensic provenance design | Incomplete version fields | Design-only update to `FORENSIC_DOCUMENT_INSPECTOR.md` |
| Limiter retention | 1s `setInterval` + unbounded growth risk | Lazy TTL sweep + max buckets; no global timer |
| Prisma CLI High advisory | `deepmerge-ts` via Prisma CLI | Dated **dev-only** exception; CI still surfaces `npm audit` |

## Clean-environment verification (this environment)

Generated state removed (`rm -rf .next node_modules prisma/*.db* test.db coverage playwright-report test-results data/evidence`), then:

| Command | Result |
|---|---|
| `npm ci` | PASS (702 packages; postinstall `prisma generate`) |
| `npm run typecheck` | PASS (`next typegen` + pin `next-env.d.ts` to `.next/types` + `tsc --noEmit`) |
| `npm run lint` | PASS |
| `npm run test` | PASS — 17 files, **101** tests |
| `npm run test:unit` | PASS — 41 tests |
| `npm run test:security` | PASS — 33 tests |
| `npm run test:integration` | PASS — 27 tests |
| `npm run build` | PASS (Next.js 16.3.4). Pre-existing middleware → proxy deprecation warning. |
| `npx playwright install --with-deps chromium && npm run test:e2e` | PASS — 4 tests; managed server on `:4127` started and stopped |
| `npm run test:audit-policy` | PASS — 3 High packages, all the dated Prisma CLI `deepmerge-ts` cluster |
| `npm audit --audit-level=high` | **fails as visibility** — GHSA-ggr8-5vv4-36mx (dev) + Vitest mocker moderate. Not force-fixed. |

## Known limitations

- Heuristic event typing from prose can still mis-label mixed sentences.
- In-memory limiter is not distributed / not serverless-safe.
- Forensic inspector runtime is still not built.
- Signup success vs failure can still enumerate (redirect vs error).
- Edge middleware still checks cookie presence only.

## Residual risks

Same as Step 2A plus: confirmation depends on current case narrative; later
addenda that are not in `Case.narrative` are not re-evaluated until the
narrative is updated. SQLite tests are not Postgres RLS.

Do not begin Step 2B or Supabase until Codex passes this remediation round.
