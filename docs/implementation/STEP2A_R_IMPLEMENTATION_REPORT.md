# Step 2A-R implementation report

Branch: `step-2a-security-test-foundation`  
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

## Quality checks

Recorded after a clean generated-state wipe in this environment. See
`docs/testing/CLEAN_CHECKOUT_TESTING.md`.

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
