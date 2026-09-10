import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const worker = join(here, "civil-date-timezone-worker.mjs");

function runUnderTz(tz: string): Record<string, string> {
  const result = spawnSync(process.execPath, ["--experimental-strip-types", worker], {
    encoding: "utf8",
    env: { ...process.env, TZ: tz },
    timeout: 20_000,
  });
  expect(result.error, `${tz} spawn error`).toBeUndefined();
  expect(result.status, `${tz} stderr=${result.stderr}`).toBe(0);
  return JSON.parse(result.stdout) as Record<string, string>;
}

describe("civil due dates are host-timezone invariant", () => {
  it("returns identical results under UTC, Europe/London, and America/New_York", () => {
    const utc = runUnderTz("UTC");
    const london = runUnderTz("Europe/London");
    const newYork = runUnderTz("America/New_York");
    expect(london).toEqual(utc);
    expect(newYork).toEqual(utc);
    expect(utc["2026-03-12"]).toBe("2026-06-11");
    expect(utc["2026-03-29"]).toBe("2026-06-28");
    expect(utc["2026-10-25"]).toBe("2027-01-24");
    expect(utc["2026-01-31"]).toBe("2026-04-29");
    expect(utc["2024-02-29"]).toBe("2024-05-28");
  });
});
