import { spawnSync } from "node:child_process";
import path from "node:path";

export default async function globalTeardown(): Promise<void> {
  const script = path.join(process.cwd(), "scripts", "e2e-teardown.mjs");
  const result = spawnSync(process.execPath, [script], { stdio: "inherit" });
  spawnSync(process.execPath, [path.join(process.cwd(), "scripts", "ensure-next-env.mjs")], { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error("E2E port was still in use after Playwright shutdown");
  }
}
