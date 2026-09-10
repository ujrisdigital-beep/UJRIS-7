import { describe, expect, it } from "vitest";
import {
  classifyDependencyPath,
  classifyRecordPaths,
  evaluateAuditPolicy,
  exceptionMatchesRecord,
  evaluateExceptionGate,
  parseAuditJson,
} from "../../scripts/dependency-match.mjs";

const exception = {
  id: "GHSA-ggr8-5vv4-36mx",
  package: "deepmerge-ts",
  alsoAppliesTo: ["prisma", "@prisma/config"],
  severity: "high",
  scope: "development",
  expires: "2026-12-31",
  acceptedPathClasses: ["dev_tooling"],
  dependencyPaths: [
    "node_modules/deepmerge-ts",
    "node_modules/@prisma/config",
    "node_modules/prisma",
  ],
};

const policy = { exceptions: [exception] };
const approvedRecord = {
  package: "deepmerge-ts",
  severity: "high",
  ghsaIds: ["GHSA-ggr8-5vv4-36mx"],
  viaNames: [],
  nodes: ["node_modules/deepmerge-ts"],
};

function auditWith(
  recordsLike: Array<{ package: string; severity: string; ghsaIds: string[]; nodes: string[] }>
) {
  const vulnerabilities: Record<string, { severity: string; via: { url: string; name: string }[]; nodes: string[] }> =
    {};
  for (const row of recordsLike) {
    vulnerabilities[row.package] = {
      severity: row.severity,
      via: row.ghsaIds.map((id: string) => ({ url: `https://github.com/advisories/${id}`, name: row.package })),
      nodes: row.nodes,
    };
  }
  return { vulnerabilities };
}

describe("dependency exception matching", () => {
  it("A: exact approved advisory + approved dev path passes", () => {
    const result = exceptionMatchesRecord(approvedRecord, exception);
    expect(result.ok).toBe(true);
    expect(classifyDependencyPath("node_modules/deepmerge-ts")).toBe("dev_tooling");
    const outcome = evaluateAuditPolicy(
      { stdout: JSON.stringify(auditWith([approvedRecord])), exitCode: 1 },
      policy,
      "2026-09-10"
    );
    expect(outcome.result).toBe("PASS");
    expect(outcome.exitCode).toBe(0);
  });

  it("B: exact advisory + runtime path fails", () => {
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
    expect(classifyDependencyPath("node_modules/@prisma/client")).toBe("production_runtime");
    expect(classifyRecordPaths(["node_modules/@prisma/client"])).toBe("production_runtime");
    const outcome = evaluateAuditPolicy(
      {
        stdout: JSON.stringify(
          auditWith([
            {
              package: "deepmerge-ts",
              severity: "high",
              ghsaIds: ["GHSA-ggr8-5vv4-36mx"],
              nodes: ["node_modules/@prisma/client"],
            },
          ])
        ),
        exitCode: 1,
      },
      policy,
      "2026-09-10"
    );
    expect(outcome.result).toBe("FAIL");
    expect(outcome.exitCode).toBe(1);
  });

  it("C: exact advisory + unknown path fails", () => {
    const result = exceptionMatchesRecord(
      {
        ...approvedRecord,
        nodes: ["node_modules/left-pad"],
      },
      exception
    );
    expect(result.ok).toBe(false);
    expect(classifyDependencyPath("node_modules/left-pad")).toBe("unknown");
    const outcome = evaluateAuditPolicy(
      {
        stdout: JSON.stringify(auditWith([{ ...approvedRecord, nodes: ["node_modules/some-unknown-tool"] }])),
        exitCode: 1,
      },
      policy,
      "2026-09-10"
    );
    expect(outcome.result).toBe("FAIL");
  });

  it("D: same package + different advisory fails", () => {
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
    expect(
      evaluateExceptionGate(
        [
          {
            package: "deepmerge-ts",
            severity: "high",
            ghsaIds: ["GHSA-xxxx-yyyy-zzzz"],
            viaNames: [],
            nodes: ["node_modules/deepmerge-ts"],
          },
        ],
        policy,
        "2026-09-10"
      ).length
    ).toBeGreaterThan(0);
  });

  it("E: known advisory + extra unexpected High fails", () => {
    const outcome = evaluateAuditPolicy(
      {
        stdout: JSON.stringify(
          auditWith([
            approvedRecord,
            {
              package: "left-pad",
              severity: "high",
              ghsaIds: ["GHSA-aaaa-bbbb-cccc"],
              nodes: ["node_modules/left-pad"],
            },
          ])
        ),
        exitCode: 1,
      },
      policy,
      "2026-09-10"
    );
    expect(outcome.result).toBe("FAIL");
  });

  it("F: expired exception fails", () => {
    const failures = evaluateExceptionGate(
      [approvedRecord],
      { exceptions: [{ ...exception, expires: "2026-01-01" }] },
      "2026-09-10"
    );
    expect(failures.some((f) => /Expired/i.test(f))).toBe(true);
  });

  it("G: Critical severity fails", () => {
    const failures = evaluateExceptionGate(
      [{ ...approvedRecord, severity: "critical" }],
      policy,
      "2026-09-10"
    );
    expect(failures.some((f) => /Critical/i.test(f))).toBe(true);
  });

  it("H: malformed audit JSON is ERROR/nonzero", () => {
    const parsed = parseAuditJson("{not json");
    expect(parsed.ok).toBe(false);
    expect(parsed.result).toBe("ERROR");
    const outcome = evaluateAuditPolicy({ stdout: "{not json", exitCode: 1 }, policy, "2026-09-10");
    expect(outcome.result).toBe("ERROR");
    expect(outcome.exitCode).toBe(2);
  });

  it("I: empty audit result caused by failed command is ERROR/nonzero", () => {
    const outcome = evaluateAuditPolicy(
      { stdout: "", stderr: "boom", exitCode: 1, spawnError: "Command failed" },
      policy,
      "2026-09-10"
    );
    expect(outcome.result).toBe("ERROR");
    expect(outcome.exitCode).toBe(2);
  });

  it("J: simulated npm-audit network/service failure is ERROR/nonzero", () => {
    const outcome = evaluateAuditPolicy(
      {
        stdout: JSON.stringify({ error: { code: "ENOAUDIT", summary: "registry unavailable" } }),
        exitCode: 1,
      },
      policy,
      "2026-09-10"
    );
    expect(outcome.result).toBe("ERROR");
    expect(outcome.exitCode).toBe(2);
    expect(parseAuditJson("{}", { exitCode: 0 }).result).toBe("ERROR");
  });

  it("K: audit subprocess nonzero with parseable known vulnerability report is evaluated", () => {
    const outcome = evaluateAuditPolicy(
      { stdout: JSON.stringify(auditWith([approvedRecord])), exitCode: 1 },
      policy,
      "2026-09-10"
    );
    expect(outcome.result).toBe("PASS");
    expect(outcome.exitCode).toBe(0);
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

  it("accepts an inherited parent whose via name is another package in the same registered cluster", () => {
    const result = exceptionMatchesRecord(
      {
        package: "prisma",
        severity: "high",
        ghsaIds: [],
        viaNames: ["@prisma/config"],
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
      policy,
      "2026-09-10"
    );
    expect(failures.some((f) => /GHSA-XXXX-YYYY-ZZZZ/i.test(f))).toBe(true);
  });

  it("does not treat absence of parsed vulnerabilities after parser failure as clean", () => {
    const outcome = evaluateAuditPolicy({ stdout: "truncated{", exitCode: 0 }, policy, "2026-09-10");
    expect(outcome.result).not.toBe("PASS");
    expect(outcome.exitCode).toBe(2);
  });
});
