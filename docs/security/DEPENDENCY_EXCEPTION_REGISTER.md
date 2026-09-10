# Dependency exception register

This is the **only** documented exception to failing the runtime/CI
dependency gate on High/Critical findings. It is not a blanket ignore.
`npm audit` continues to surface the advisory. Matching is by **advisory
ID**, not package name.

Reviewed: 2026-09-10  
Next review / `review_by`: 2026-12-31  
Owner: UJRIS engineering — Step 2A security track

## Exception EX-DEP-001

| Field | Value |
|---|---|
| Advisory ID | **GHSA-ggr8-5vv4-36mx** (required match) |
| Package | `deepmerge-ts` |
| Also listed by npm | `prisma`, `@prisma/config` (inherited cluster of **this** GHSA only) |
| Declared version (vulnerable range) | `<8.0.0` |
| Severity | High |
| Scope | development |
| Dependency paths | `prisma>@prisma/config>deepmerge-ts`; `node_modules/deepmerge-ts`; `node_modules/@prisma/config`; `node_modules/prisma` |
| Runtime exposure | **None in the Next.js request path.** `@prisma/client` does not load `@prisma/config` / `deepmerge-ts`. |
| Owner | UJRIS engineering — Step 2A security track |
| reviewed_at | 2026-09-10 |
| review_by / expires | 2026-12-31 |
| Remediation | Upgrade Prisma to a release that pins `deepmerge-ts >= 8`, or stop using Prisma CLI in production images |
| Decision | accept_temporary_dev_only |
| Reason | Confined to Prisma CLI config merger (devDependency). Exception is keyed to GHSA-ggr8-5vv4-36mx only. |

A **different** High on `deepmerge-ts`, a Critical on the same package, an
unexpected runtime path (for example `@prisma/client`), or an expired
exception **fails** `npm run test:audit-policy`. Never “ignore all Highs
for package X”.

CI behaviour: the policy test is the gate. Raw `npm audit --audit-level=high`
is allowed to be nonzero for this documented advisory.

Machine-readable copy: `docs/security/dependency-exceptions.json`.
Matcher: `scripts/dependency-match.mjs`.
