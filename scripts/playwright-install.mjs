/**
 * Install Playwright Chromium using the local package JS CLI.
 * Linux CI may pass --with-deps. Windows does not (Playwright platform constraint).
 */
import { resolvePackageBin, spawnNodeEntrySync } from "./command-runner.mjs";

const withDeps = process.argv.includes("--with-deps");
const bin = resolvePackageBin("@playwright/test", "playwright");
const args = ["install", ...(withDeps ? ["--with-deps"] : []), "chromium"];
const result = spawnNodeEntrySync(bin, args, { stdio: "inherit" });
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
