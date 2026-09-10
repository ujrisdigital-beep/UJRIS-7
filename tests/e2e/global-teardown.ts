import { ensureE2ePortReleased } from "../../scripts/e2e-teardown.mjs";

export default async function globalTeardown(): Promise<void> {
  await ensureE2ePortReleased();
}
