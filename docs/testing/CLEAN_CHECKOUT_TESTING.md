# Clean-checkout testing

These commands must work on a fresh clone with **no** committed `.next`
output and **no** leftover developer database. They use **npm and Node**
only — no PowerShell, bash-only teardown, or Cursor-local paths.

## Pinned execution environment

| Tool | Version used by this repo / CI |
|---|---|
| Node | `22` (`.nvmrc`; `package.json` engines `>=20 <23`) |
| npm | `>=10` (CI uses the npm bundled with Node 22; local verification: 10.9.7) |
| Prisma | `6.19.3` (`prisma` + `@prisma/client`) |
| Next.js | `16.3.4` |
| Vitest | `3.2.7` |
| Playwright | `1.63.0` |

GitHub Actions: `actions/setup-node@v4` with `node-version: "22"`.

## Exact sequence

```bash
git clone <repo>
cd <repo>
git checkout step-2a-security-test-foundation

rm -rf .next .next-e2e node_modules prisma/dev.db prisma/test.db test.db test.db-journal e2e.db e2e.db-journal data/evidence coverage playwright-report test-results .e2e-webserver.pid

npm ci
npm run typecheck    # runs `next typegen` then `tsc --noEmit`
npm run lint
npm run test:unit
npm run test:security
npm run test:integration
npm run test
npm run build

npx playwright install --with-deps chromium
npm run test:e2e
node scripts/e2e-teardown.mjs   # asserts port 4127 can be rebound
npm run test:e2e
node scripts/e2e-teardown.mjs

npm run test:audit-policy
npm audit --audit-level=high    # expected nonzero while Prisma CLI High + other documented advisories remain
```

Windows: the same `npm run …` commands. E2E process teardown uses
`taskkill /T` rather than Unix signals. Do not use `fuser`.

`npm ci` + `npm run typecheck` must succeed without a previous `next build`
or `next dev`. Typecheck generates `.next/types` via `next typegen`.
`next-env.d.ts` imports that tree, not `.next/dev/types`.

Vitest scripts (`test`, `test:unit`, `test:security`, `test:integration`)
must not require a previous Playwright run, a developer-created `test.db`,
or undocumented env files. `AUTH_SECRET` has a test default.

## Test database

- Vitest **always** sets `DATABASE_URL=file:./test.db` (gitignored) and
  runs `prisma migrate deploy` via `scripts/prisma-migrate.mjs` (resolved
  Prisma package bin — not `npx`). Incoming `DATABASE_URL` values that look
  like hosted Postgres / Supabase / production are refused.
  `NODE_ENV=production` is refused.
- E2E uses a **separate** disposable SQLite file prepared by
  `scripts/e2e-prepare.mjs`. Prisma resolves `DATABASE_URL=file:./e2e.db`
  next to the schema (`prisma/e2e.db`, gitignored). It never uses
  `prisma/dev.db` or a hosted URL.
- Tests never read production secrets. `AUTH_SECRET` has a local test
  default (`test-auth-secret-that-is-long-enough-32ch`).

## Playwright lifecycle (single owner)

`npm run test:e2e` is `node scripts/e2e-run.mjs`. Process tree:

```
npm run test:e2e
 └─ node scripts/e2e-run.mjs          ← THE ONLY OWNER
      1. scripts/e2e-prepare.mjs → prisma/e2e.db + migrate
      2. next build → .next-e2e (if BUILD_ID missing)
      3. spawn next start 127.0.0.1:4127
      4. spawn playwright test
         PLAYWRIGHT_SKIP_WEBSERVER=1
      5. reap Next, bind-check port 4127, exit Playwright status
```

Playwright is a **sibling** of Next, both children of `e2e-run.mjs`.
There is no script→Playwright→script cycle.

`reuseExistingServer` is not used on the owned path.
Two consecutive `npm run test:e2e` runs must exit 0 with port 4127 free
after each, without Ctrl+C or manual taskkill.

## CI

GitHub Actions calls the same scripts: `npm ci`, typecheck, lint,
`test:unit`, `test:security`, `test:integration`, `npm run test:e2e` (twice),
build, `npm run test:audit-policy`. Raw `npm audit` is visibility-only.
