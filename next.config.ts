import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // E2E uses UJRIS_NEXT_DIST_DIR=.next-e2e so a developer `next dev`
  // lock in `.next` cannot block `npm run test:e2e`.
  distDir: process.env.UJRIS_NEXT_DIST_DIR || ".next",
};

export default nextConfig;
