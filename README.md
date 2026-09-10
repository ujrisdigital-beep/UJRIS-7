# UJRIS — Justice Intelligence

UJRIS turns a confusing workplace dispute into a structured case, an
evidence map, and a clear next step for UK self-represented employment /
discrimination claimants — without ever promising a legal outcome.

**Before changing anything, read [`PROJECT_STATE.md`](./PROJECT_STATE.md)
and the ADRs in [`docs/adr/`](./docs/adr/).** They are the source of truth
for what exists, what's deliberately not built yet, and the required
operating process for this repository.

## Branding

The UJRIS emblem and wordmark lockup live in [`public/brand/`](./public/brand)
and are wired into `src/components/logo.tsx` (compact header/footer mark)
and `src/components/brand-mark.tsx` (larger standalone placements — auth
screens, landing hero). The app icon (`src/app/icon.png`,
`src/app/apple-icon.png`) and social share image
(`src/app/opengraph-image.jpg`) are pre-rendered from those source images
via `sharp` — see the git history for the generation script if you need to
regenerate them at different crops/sizes.

## Running locally

```bash
npm install
cp .env.example .env         # zero external secrets required for local dev
npx prisma migrate deploy    # creates/updates prisma/dev.db (SQLite)
npm run dev -- -p 4127       # http://localhost:4127
```

By default the app runs entirely on local SQLite and a deterministic
heuristic "AI" engine. Missing Stripe configuration does **not** grant a
paid plan. Local billing simulation is available only when
`UJRIS_ALLOW_DEV_BILLING=true` and `NODE_ENV` is not `production`. See
`PROJECT_STATE.md` §5, and ADR-0002 for the planned Supabase migration.

## Tests

```bash
npm ci
npm run typecheck       # next typegen && tsc --noEmit (no prior production build)
npm run lint
npm test                # Vitest: unit + integration + security; uses prisma/test.db
npm run build
npm run test:audit-policy
npm run playwright:install
npm run test:e2e        # scripts/e2e-run.mjs owns Next on :4127
node scripts/e2e-teardown.mjs
npm run test:e2e
node scripts/e2e-teardown.mjs
```

GitHub Actions runs that sequence on `ubuntu-latest` and `windows-latest`.
Linux CI installs Playwright with `--with-deps`; Windows installs Chromium
only (`node scripts/playwright-install.mjs`).

## Checks before every change is considered done

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

## Learn more

This project was scaffolded with
[`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app)
and uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts)
for the Geist font family. See the
[Next.js documentation](https://nextjs.org/docs) for framework-level
questions not covered above.
