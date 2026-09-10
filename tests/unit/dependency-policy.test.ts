import { describe, expect, it } from "vitest";
import { exceptionMatchesRecord, evaluateExceptionGate } from "../../scripts/dependency-match.mjs";

const exception = {
  id: "GHSA-ggr8-5vv4-36mx",
  package: "deepmerge-ts",
  alsoAppliesTo: ["prisma", "@prisma/config"],
  severity: "high",
  scope: "development",
  expires: "2026-12-31",
  dependencyPaths: [
    "node_modules/deepmerge-ts",
    "node_modules/@prisma/config",
    "node_modules/prisma",
  ],
};

describe("dependency exception matching", () => {
  it("accepts the exact registered advisory", () => {
    const result = exceptionMatchesRecord(
      {
        package: "deepmerge-ts",
        severity: "high",
        ghsaIds: ["GHSA-ggr8-5vv4-36mx"],
        viaNames: [],
        nodes: ["node_modules/deepmerge-ts"],
      },
      exception
    );
    expect(result.ok).toBe(true);
  });

  it("rejects the same package with a different advisory", () => {
    const result = exceptionMatchesRecord(
      {
        package: "deepmerge-ts",
        severity: "high",
        ghsaIds: ["GHSA-xxxx-yyyy-zzzz"],
        viaNames: [],
        nodes: ["node_modules/deepmerge-ts"],
      },
      exception
    );
    expect(result.ok).toBe(false);
    expect(evaluateExceptionGate(
      [
        {
          package: "deepmerge-ts",
          severity: "high",
          ghsaIds: ["GHSA-xxxx-yyyy-zzzz"],
          viaNames: [],
          nodes: ["node_modules/deepmerge-ts"],
        },
      ],
      { exceptions: [exception] },
      "2026-09-10"
    ).length).toBeGreaterThan(0);
  });

  it("rejects an unexpected runtime dependency path", () => {
    const result = exceptionMatchesRecord(
      {
        package: "deepmerge-ts",
        severity: "high",
        ghsaIds: ["GHSA-ggr8-5vv4-36mx"],
        viaNames: [],
        nodes: ["node_modules/@prisma/client"],
      },
      exception
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("path_mismatch");
  });

  it("rejects an expired exception", () => {
    const failures = evaluateExceptionGate(
      [
        {
          package: "deepmerge-ts",
          severity: "high",
          ghsaIds: ["GHSA-ggr8-5vv4-36mx"],
          viaNames: [],
          nodes: ["node_modules/deepmerge-ts"],
        },
      ],
      { exceptions: [{ ...exception, expires: "2026-01-01" }] },
      "2026-09-10"
    );
    expect(failures.some((f) => /Expired/i.test(f))).toBe(true);
  });

  it("rejects unknown High advisories", () => {
    const failures = evaluateExceptionGate(
      [
        {
          package: "left-pad",
          severity: "high",
          ghsaIds: ["GHSA-aaaa-bbbb-cccc"],
          viaNames: [],
          nodes: ["node_modules/left-pad"],
        },
      ],
      { exceptions: [exception] },
      "2026-09-10"
    );
    expect(failures.some((f) => /Unreviewed/i.test(f))).toBe(true);
  });

  it("accepts an inherited parent record that names the excepted package", () => {
    const result = exceptionMatchesRecord(
      {
        package: "prisma",
        severity: "high",
        ghsaIds: [],
        viaNames: ["deepmerge-ts"],
        nodes: ["node_modules/prisma"],
      },
      exception
    );
    expect(result.ok).toBe(true);
  });

  it("rejects a second High advisory on the same package even if the known GHSA is also listed", () => {
    const result = exceptionMatchesRecord(
      {
        package: "deepmerge-ts",
        severity: "high",
        ghsaIds: ["GHSA-ggr8-5vv4-36mx", "GHSA-xxxx-yyyy-zzzz"],
        viaNames: [],
        nodes: ["node_modules/deepmerge-ts"],
      },
      exception
    );
    expect(result.ok).toBe(false);
    const failures = evaluateExceptionGate(
      [
        {
          package: "deepmerge-ts",
          severity: "high",
          ghsaIds: ["GHSA-ggr8-5vv4-36mx", "GHSA-xxxx-yyyy-zzzz"],
          viaNames: [],
          nodes: ["node_modules/deepmerge-ts"],
        },
      ],
      { exceptions: [exception] },
      "2026-09-10"
    );
    expect(failures.some((f) => /GHSA-XXXX-YYYY-ZZZZ/i.test(f))).toBe(true);
  });

  it("rejects a Critical finding covered only by a High exception", () => {
    const failures = evaluateExceptionGate(
      [
        {
          package: "deepmerge-ts",
          severity: "critical",
          ghsaIds: ["GHSA-ggr8-5vv4-36mx"],
          viaNames: [],
          nodes: ["node_modules/deepmerge-ts"],
        },
      ],
      { exceptions: [exception] },
      "2026-09-10"
    );
    expect(failures.some((f) => /Critical/i.test(f))).toBe(true);
  });
});
