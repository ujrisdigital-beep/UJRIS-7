/// <reference types="next" />
/// <reference types="next/image-types/global" />
import "./.next/types/routes.d.ts";

// next-env.d.ts is committed to import `.next/types`, which `next typegen`
// (see `npm run typecheck`) creates. Do not point this file at
// `.next/dev/types` — that tree only exists after `next dev`.
