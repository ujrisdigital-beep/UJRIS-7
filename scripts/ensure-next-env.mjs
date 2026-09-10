/**
 * `next typegen` / `next dev` may rewrite next-env.d.ts to import
 * `.next/dev/types`, which does not exist on a clean checkout.
 * Pin the committed contract to `.next/types` produced by `next typegen`.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";

const contents = `/// <reference types="next" />
/// <reference types="next/image-types/global" />
import "./.next/types/routes.d.ts";

// next-env.d.ts is committed to import \`.next/types\`, which \`next typegen\`
// (see \`npm run typecheck\`) creates. Do not point this file at
// \`.next/dev/types\` — that tree only exists after \`next dev\`.
`;

writeFileSync(path.join(process.cwd(), "next-env.d.ts"), contents);
