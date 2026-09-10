# Clean-checkout testing

These commands must work on a fresh clone with **no** committed `.next`
output and **no** leftover developer database. They use **npm and Node**
only — no PowerShell, bash-only teardown, or Cursor-local paths.

## Exact sequence

```bash
git clone <repo>
cd <repo>
git checkout step-2a-security-test-foundation

rm -rf .next .next-e2e node_modules prisma/dev.db prisma/test.db test.db test.db-journal data/evidence coverage playwright-report test-results .e2e-webserver.pid

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

npm run test:audit-policy
npm audit --audit-level=high    # expected nonzero while the Prisma CLI High remains
```

Windows: the same `npm run …` commands. E2E process teardown uses
`taskkill /T` rather than Unix signals. Do not use `fuser`.

`npm ci` + `npm run typecheck` must succeed without a previous `next build`
or `next dev`. Typecheck generates `.next/types` via `next typegen`.
`next-env.d.ts` imports that tree, not `.next/dev/types`.

## Test database

- Vitest **always** sets `DATABASE_URL=file:./test.db` (gitignored) and
  runs `prisma migrate deploy` in `tests/setup.ts`. Incoming
  `DATABASE_URL` values that look like hosted Postgres / Supabase /
  production are refused. `NODE_ENV=production` is refused.
- E2E uses the same disposable `file:./test.db` via
  `scripts/e2e-webserver.mjs` (`prisma migrate deploy`, `next build` into
  `.next-e2e`, then `next start`).
- Tests never read production secrets. `AUTH_SECRET` has a local test
  default (`test-auth-secret-that-is-long-enough-32ch`).

## Playwright lifecycle

`npm run test:e2e` must:

1. start the Node supervisor (`scripts/e2e-webserver.mjs`);
2. migrate the disposable SQLite DB, `next build` into `.next-e2e`, then
   `next start` on `127.0.0.1:4127` (isolated from a developer `next dev`
   lock in `.next`);
3. wait until the URL is ready;
4. run tests;
5. SIGTERM the supervisor, which reaps Next and children
   (Unix `pgrep -P` walk / Windows `taskkill /T`);
6. global teardown + `node scripts/e2e-teardown.mjs` confirm the port
   can be bound again;
7. exit with the test status — not hang after green assertions.

Do not leave a manual process on port 4127 in CI.
`reuseExistingServer` is false.
