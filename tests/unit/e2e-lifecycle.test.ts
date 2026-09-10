import { describe, expect, it } from "vitest";
import { createServer } from "node:net";
import { ensureE2ePortReleased } from "../../scripts/e2e-teardown.mjs";

describe("E2E port teardown", () => {
  it("can bind the configured E2E port after ensureE2ePortReleased", async () => {
    process.env.E2E_PORT = process.env.E2E_PORT || "4127";
    await expect(ensureE2ePortReleased()).resolves.toBe(true);
    await new Promise<void>((resolve, reject) => {
      const server = createServer();
      server.once("error", reject);
      server.listen(Number(process.env.E2E_PORT), "127.0.0.1", () => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    });
  });
});
