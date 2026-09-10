# Clean-checkout testing

These commands must work on a fresh clone with **no** committed `.next`
output and **no** leftover developer database.

## Exact sequence

```bash
git clone <repo>
cd <repo>
git checkout step-2a-security-test-foundation

rm -rf .next node_modules prisma/dev.db prisma/test.db test.db data/evidence coverage playwright-report test-results

npm ci
npm run typecheck    # runs `next typegen` then `tsc --noEmit`
npm run lint
npm run test
npm run test:unit
npm run test:security
npm run test:integration
npm run build

npx playwright install --with-deps chromium
npm run test:e2e

npm run test:audit-policy
npm audit --json > docs/audits/npm-audit.last.json || true
```

`npm ci` + `npm run typecheck` must succeed without a previous `next build`
or `next dev`. Typecheck generates `.next/types` via `next typegen`.
`next-env.d.ts` imports that tree, not `.next/dev/types`.

## Test database

- Vitest always sets `DATABASE_URL=file:./test.db` (SQLite under `prisma/`,
  gitignored) and runs `prisma migrate deploy` in `tests/setup.ts`.
- If `DATABASE_URL` looks like hosted Postgres / Supabase / production, or
  `NODE_ENV=production`, setup **throws** and refuses destructive reset.
- Tests never read production secrets. `AUTH_SECRET` has a local test default.

## Playwright

```bash
npx playwright install --with-deps chromium
npm run test:e2e
```

Playwright starts Next on `127.0.0.1:4127`, then SIGTERM + a port-4127
teardown. Do not leave a manual `next dev` on that port in CI.
