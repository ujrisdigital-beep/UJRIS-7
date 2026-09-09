# Dependency audit (Step 2A)

Command: `npm audit --audit-level=high`  
Date: 2026-09-09  
Result: **fails** (High findings present). This is recorded, not ignored.

## High

| Advisory | Package | Via | Why not force-fixed in Step 2A |
|---|---|---|---|
| [GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx) DeepmergeTS stack exhaustion | `deepmerge-ts` `<8.0.0` | `prisma` → `@prisma/config` (devDependency, Prisma 6.19.3) | `npm audit fix --force` wants Prisma **6.12.0** (a downgrade) or a Prisma 7/8 jump. Either is a dangerous/breaking change in a security-stabilisation ticket that must not also migrate the ORM. The advisory is in the **CLI config merger**, not in `@prisma/client` query runtime. |

## Moderate (below `--audit-level=high`, still visible)

| Advisory | Package | Via | Why not force-fixed |
|---|---|---|---|
| [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9) Vitest mocker path traversal | `@vitest/mocker` | `vitest@3.2.7` | `npm audit fix --force` installs Vitest 5 (breaking). Tests do not use the redirect-mocker feature. Revisit when upgrading Vitest is a dedicated ticket. |

## Policy

- Do not use `npm audit --force` on this repository without a dedicated dependency ticket.
- Do not add `audit-level` ignores or `continue-on-error` to hide High/Critical.
- GitHub Actions job `dependency-audit` runs `npm audit --audit-level=high` and is expected to fail until Prisma publishes a 6.x line that bumps `deepmerge-ts`, or until a planned Prisma major upgrade.
- Application production runtime still depends on `@prisma/client` 6.19.3, `next` 16.3.4, etc. Re-run `npm audit` after any lockfile change.

This file is the allow-list of **known, documented** findings — not a suppression file consumed by npm.
