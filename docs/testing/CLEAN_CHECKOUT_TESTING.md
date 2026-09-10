# Clean-checkout testing

These commands must work on a fresh clone with **no** committed `.next`
output and **no** leftover developer database. They use **npm and Node**
only — no PowerShell, bash-only teardown, or Cursor-local paths.

The same scripts are the merge gate on **Linux and Windows**.

## Pinned execution environment

| Tool | Version used by this repo / CI |
|---|---|
| Node | `22` (`.nvmrc`; `package.json` engines `>=20 <23`) |
| npm | `>=10` (CI uses the npm bundled with Node 22; local verification: 10.9.7) |
| Prisma | `6.19.3` (`prisma` + `@prisma/client`) |
| Next.js | `16.3.4` |
| Vitest | `3.2.7` |
| Playwright | `1.63.0` |

GitHub Actions: `ubuntu-latest` and `windows-latest`,
`actions/setup-node@v4` with `node-version: "22"`.

## Exact sequence

```bash
git clone <repo>
cd <repo>
git checkout step-2a-security-test-foundation

rm -rf .next .next-e2e node_modules prisma/dev.db prisma/test.db prisma/e2e.db test.db test.db-journal e2e.db e2e.db-journal data/evidence coverage playwright-report test-results .e2e-webserver.pid

npm ci
npm run typecheck    # runs `next typegen` then `tsc --noEmit`
npm run lint
npm run test:unit
npm run test:security
npm run test:integration
npm run test
npm run build

npm run playwright:install          # Linux CI adds --with-deps; Windows does not
# equivalent: node scripts/playwright-install.mjs [--with-deps]
npm run test:e2e
node scripts/e2e-teardown.mjs       # asserts port 4127 can be rebound
npm run test:e2e
node scripts/e2e-teardown.mjs

npm run test:audit-policy
npm audit --audit-level=high        # expected nonzero while Prisma CLI High + other documented advisories remain
```

Windows: the **same** `npm run …` commands. E2E process teardown uses
`taskkill /T` rather than Unix signals. Do not use `fuser`. Do not spawn
a bare `npm` name. Do not set `shell: true` to paper over PATH issues.

`npm ci` + `npm run typecheck` must succeed without a previous `next build`
or `next dev`. Typecheck generates `.next/types` via `next typegen`.
`next-env.d.ts` imports that tree, not `.next/dev/types`.

Vitest scripts (`test`, `test:unit`, `test:security`, `test:integration`)
must not require a previous Playwright run, a developer-created `test.db`,
or undocumented env files. `AUTH_SECRET` has a test default. Incoming
`DATABASE_URL` values that look like hosted Postgres/Supabase, or like
`prisma/dev.db`, are refused. The bootstrap **sets** an absolute
`prisma/test.db` URL itself.

## Test database

- Vitest **always** sets an absolute disposable `file:` URL under
  `prisma/test.db` (gitignored) in `tests/setup-env.ts` **before** any
  Prisma import, then runs `prisma migrate deploy` via
  `scripts/prisma-migrate.mjs` (`process.execPath` + Prisma JS CLI — not
  `npx`, not `npm`).
- E2E uses a **separate** absolute disposable URL prepared by
  `scripts/e2e-prepare.mjs` (`prisma/e2e.db`, gitignored). It never uses
  `prisma/dev.db` or a hosted URL.
- Tests never read production secrets. `AUTH_SECRET` has a local test
  default (`test-auth-secret-that-is-long-enough-32ch`).

## Playwright lifecycle (single owner)

`npm run test:e2e` is `node scripts/e2e-run.mjs`. Process tree:

```
npm run test:e2e
 └─ node scripts/e2e-run.mjs          ← THE ONLY OWNER
      PREPARE_DB   scripts/e2e-prepare.mjs → prisma/e2e.db + migrate
      BUILD        next build → .next-e2e (if BUILD_ID missing)
      START_SERVER next start 127.0.0.1:4127
      WAIT_READY   HTTP check
      RUN_PLAYWRIGHT  playwright test (PLAYWRIGHT_SKIP_WEBSERVER=1)
      TEARDOWN     reap children
      VERIFY_PORT  bind-check 4127
```

Playwright is a **sibling** of Next, both children of `e2e-run.mjs`.
There is no script→Playwright→script cycle. Failed stages print
`STAGE=… FAILED` plus a redacted stderr summary. Teardown runs even if
startup fails.

`reuseExistingServer` is not used on the owned path.
Two consecutive `npm run test:e2e` runs must exit 0 with port 4127 free
after each, without Ctrl+C or manual taskkill.

## CI

GitHub Actions matrix (`ubuntu-latest`, `windows-latest`) calls the same
scripts: `npm ci`, typecheck, lint, `test:unit`, `test:security`,
`test:integration`, `npm run test:e2e` (twice), build,
`npm run test:audit-policy`. Playwright is installed with
`node scripts/playwright-install.mjs` (`--with-deps` on Linux only).
Raw `npm audit` is visibility-only where run locally.
