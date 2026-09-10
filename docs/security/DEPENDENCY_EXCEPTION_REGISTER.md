# Dependency exception register

This is the **only** documented exception to failing the runtime/CI
dependency gate on High/Critical findings. It is not a blanket ignore.
`npm audit` continues to surface the advisory.

Reviewed: 2026-09-10  
Next review: 2026-12-31

## Exception EX-DEP-001

| Field | Value |
|---|---|
| Package | `deepmerge-ts` |
| Declared version (vulnerable range) | `<8.0.0` |
| Advisory | [GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx) — DeepmergeTS stack exhaustion via crafted `__proto__` keys |
| Severity | High |
| Dependency path | `prisma` (devDependency) → `@prisma/config` → `deepmerge-ts` |
| Also listed by npm | `prisma`, `@prisma/config` (same cluster) |
| Runtime exposure | **None in the Next.js request path.** `@prisma/client` query runtime does not load `@prisma/config` / `deepmerge-ts`. The vulnerable merger is Prisma **CLI** config loading (`prisma migrate`, `prisma generate`). |
| Production artifact | Not bundled into the application webpack/turbopack graph for route handlers or server actions. |
| Why not force-fixed in Step 2A-R | `npm audit fix --force` wants a Prisma 6.12 downgrade or a Prisma 7/8 jump. Either is a breaking ORM change outside this remediation ticket. Codex classified this as **ACCEPTABLE TEMPORARY DEV RISK**. |
| CI behaviour | `npm run test:audit-policy` **allows this development-scoped exception until 2026-12-31**. Any **other** High/Critical, any **runtime** High/Critical, and any **Critical** on this package **fail** the gate. `npm audit --json` is still written for visibility. |
| Remediation plan | Dedicated dependency ticket: upgrade Prisma to a 6.x (or later) release that pins `deepmerge-ts >= 8`, or replace Prisma CLI usage. Re-run `npm audit` after the lockfile change. |
| Do not | Add `audit-level` ignores, `continue-on-error` on unknown High findings, or a blanket `.npmrc audit` suppression. |

Machine-readable copy: `docs/security/dependency-exceptions.json`.
