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

By default the app runs entirely on local SQLite, a deterministic
heuristic "AI" engine, and a simulated Stripe "dev mode" — no external
credentials needed to demo the full product. See `PROJECT_STATE.md` §5 for
what each optional environment variable unlocks (a real OpenAI-phrased UJU
Brief, real Stripe billing, etc.), and ADR-0002 for the planned Supabase
migration.

## Checks before every change is considered done

```bash
npx tsc --noEmit
npx eslint .
npm run build
```

## Learn more

This project was scaffolded with
[`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app)
and uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts)
for the Geist font family. See the
[Next.js documentation](https://nextjs.org/docs) for framework-level
questions not covered above.
