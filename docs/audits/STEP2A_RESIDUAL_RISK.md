# Step 2A residual risk (failed review + remediation notes)

Original review of `fd78b1e059d9216e03f237145625eacac009a870`.  
This file keeps that history. Remediation notes do not clear residual risk
and do not issue PASS.

## Risks recorded at the failed head

1. **False-certain legal dates** — parsed/rolled dates marked `confirmed`.
2. **Urgency drop after “I have seen this”** — acknowledged deadlines excluded
   from refresh.
3. **XSS proof gap** — delivery helper tested; route not exercised.
4. **Session/ownership proof gap** — helper-level only.
5. **Limiter memory growth** and raw-email keys.
6. **Signup enumeration** and login timing oracle.
7. **No persisted forensic provenance.**
8. **Typecheck requires generated Next types.**
9. **Prisma CLI `deepmerge-ts` High** — not classified by policy.
10. **In-memory limiter / custom JWT** — interim, single instance.
11. **SQLite, no RLS.**
12. **AI grounding / cost** — still out of scope (finding 10 from Step 1).

## Residual risks after remediation (still present)

These remain even if implementation addresses the blockers:

| Risk | Detail |
|---|---|
| Custom auth | JWT + `AuthSession` is interim. Middleware still checks cookie presence only. Superseded by Supabase Auth (Step 2B+, not started). |
| Single-instance limiter | Bounded in-memory store. Not safe for horizontal scale. Must be replaced before multi-instance production. |
| Signup success vs failure | A **successful new registration** still establishes a session and redirects. An attacker who submits a victim email that **already exists** receives a generic failure. That difference can still indicate “this email is registered” if the attacker does not control the inbox. Documented; not fully eliminable without changing signup into a verify-email-first flow (out of scope). |
| Login/recovery messages | Login failures (unknown user vs bad password) share one message and a dummy password check. Recovery and verification-resend always return the same generic message. Residual: network timing and rate-limit buckets are hashed but still per-account. |
| Evidence on local disk | Bytes written before the DB transaction; orphan files possible. |
| Heuristic dates | Strict civil dates reject rollover, but UK prose can still be missed or mis-scoped. Hearing dates are excluded from limitation inference; other event types may still be selected as **provisional** warnings. |
| Forensic table vs blob | `Evidence.forensics` JSON remains for compatibility. Structured rows are additive. |
| Dependency exception | `deepmerge-ts` High via Prisma **CLI** (devDependency) is a dated exception. Runtime High/Critical still fail CI. |
| No RLS | Application-layer ownership only. |
| AI | No grounding or cost monitors. |

## Account enumeration — explicit residual

**Not fully eliminated.**

| Flow | External behaviour after remediation | Residual oracle |
|---|---|---|
| Login | Same error text; dummy `verifyPassword` when no user row | Statistical timing may still differ slightly from bcrypt vs dummy bcrypt |
| Registration | Existing email: generic failure, dummy work. New email: account created + redirect | **Success vs generic failure reveals whether the address was already registered** |
| Password recovery | Always the same success-shaped message; no email sent (no mailer) | None beyond rate-limit on the hashed identity |
| Verification resend | Always the same message | Same as recovery |

If a future ticket implements verify-first signup (no session until token),
the registration oracle can be closed. That is not Step 2B.

## What must not be claimed

- Production ready
- Independent review PASS
- Distributed rate limiting
- Legal advice / confirmed limitation dates without an explicit confirm action
