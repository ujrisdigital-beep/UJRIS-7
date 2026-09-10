import { execSync } from "node:child_process";

/**
 * Last-resort cleanup if Playwright's webServer signal did not reap Next.
 * Scoped to the managed E2E port only.
 */
export default async function globalTeardown(): Promise<void> {
  try {
    execSync("fuser -k 4127/tcp", { stdio: "ignore" });
  } catch {
    // No process bound to the managed E2E port.
  }
}
