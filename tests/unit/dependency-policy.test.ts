import { describe, expect, it } from "vitest";
import {
  classifyDependencyPath,
  classifyRecordPaths,
  evaluateAuditPolicy,
  exceptionMatchesRecord,
  evaluateExceptionGate,
  parseAuditJson,
  recordsFromAudit,
} from "../../scripts/dependency-match.mjs";

const exception = {
  id: "GHSA-ggr8-5vv4-36mx",
  advisoryId: "GHSA-ggr8-5vv4-36mx",
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

  it("does not accept an inherited parent record that only names the excepted package", () => {
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
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("advisory_mismatch");
  });

  it("does not accept an inherited parent whose via name is another package in the same cluster", () => {
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
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("advisory_mismatch");
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

describe("R5 exception identity matrix", () => {
  const approvedDev = {
    package: "deepmerge-ts",
    severity: "high",
    ghsaIds: ["GHSA-ggr8-5vv4-36mx"],
    viaNames: [],
    nodes: ["node_modules/deepmerge-ts"],
  };

  it("A: exact approved advisory + approved dev_tooling path + not expired is temporary PASS", () => {
    expect(exceptionMatchesRecord(approvedDev, exception).ok).toBe(true);
    const outcome = evaluateAuditPolicy(
      { stdout: JSON.stringify(auditWith([approvedDev])), exitCode: 1 },
      policy,
      "2026-09-10"
    );
    expect(outcome.result).toBe("PASS");
  });

  it("B: different High advisory + same package + same path fails", () => {
    const record = {
      ...approvedDev,
      ghsaIds: ["GHSA-aaaa-bbbb-cccc"],
    };
    expect(exceptionMatchesRecord(record, exception).ok).toBe(false);
    expect(evaluateExceptionGate([record], policy, "2026-09-10").length).toBeGreaterThan(0);
  });

  it("C: unknown High advisory + same package/path fails", () => {
    const record = {
      package: "prisma",
      severity: "high",
      ghsaIds: ["GHSA-unkn-own0-advs"],
      viaNames: ["deepmerge-ts"],
      nodes: ["node_modules/prisma"],
    };
    expect(exceptionMatchesRecord(record, exception).ok).toBe(false);
    const outcome = evaluateAuditPolicy(
      { stdout: JSON.stringify(auditWith([record])), exitCode: 1 },
      policy,
      "2026-09-10"
    );
    expect(outcome.result).toBe("FAIL");
  });

  it("D: missing advisory ID + same package/path fails (mutation: package/path-only matching would pass)", () => {
    const record = {
      package: "deepmerge-ts",
      severity: "high",
      ghsaIds: [],
      viaNames: ["deepmerge-ts"],
      nodes: ["node_modules/deepmerge-ts"],
    };
    expect(exceptionMatchesRecord(record, exception).ok).toBe(false);
    expect(exceptionMatchesRecord(record, exception).reason).toBe("advisory_mismatch");
    const failures = evaluateExceptionGate([record], policy, "2026-09-10");
    expect(failures.some((f) => /missing advisory id/i.test(f))).toBe(true);
  });

  it("E: approved advisory + production_runtime fails", () => {
    const record = { ...approvedDev, nodes: ["node_modules/@prisma/client"] };
    expect(exceptionMatchesRecord(record, exception).ok).toBe(false);
    expect(evaluateExceptionGate([record], policy, "2026-09-10").length).toBeGreaterThan(0);
  });

  it("F: approved advisory + unknown path fails", () => {
    const record = { ...approvedDev, nodes: ["node_modules/left-pad"] };
    expect(exceptionMatchesRecord(record, exception).ok).toBe(false);
    expect(evaluateExceptionGate([record], policy, "2026-09-10").length).toBeGreaterThan(0);
  });

  it("G: approved advisory + expired exception fails", () => {
    const failures = evaluateExceptionGate(
      [approvedDev],
      { exceptions: [{ ...exception, expires: "2026-01-01" }] },
      "2026-09-10"
    );
    expect(failures.some((f) => /Expired/i.test(f))).toBe(true);
  });

  it("H: Critical advisory through the same dependency cluster fails", () => {
    const failures = evaluateExceptionGate([{ ...approvedDev, severity: "critical" }], policy, "2026-09-10");
    expect(failures.some((f) => /Critical/i.test(f))).toBe(true);
  });

  it("I: multiple advisories where only one is excepted still fail", () => {
    const outcome = evaluateAuditPolicy(
      {
        stdout: JSON.stringify(
          auditWith([
            approvedDev,
            {
              package: "deepmerge-ts",
              severity: "high",
              ghsaIds: ["GHSA-zzzz-yyyy-xxxx"],
              nodes: ["node_modules/deepmerge-ts"],
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

  it("J: malformed advisory object is ERROR/fail-closed", () => {
    const outcome = evaluateAuditPolicy(
      { stdout: JSON.stringify({ vulnerabilities: { foo: "not-an-object" } }), exitCode: 1 },
      policy,
      "2026-09-10"
    );
    expect(outcome.result).toBe("ERROR");
    expect(outcome.exitCode).toBe(2);
    expect(outcome.reason).toBe("malformed_vulnerability");
  });

  it("reconstructs GHSA identity from a parent via-name once the sibling carries the advisory URL", () => {
    const audit = {
      vulnerabilities: {
        "deepmerge-ts": {
          severity: "high",
          via: [{ url: "https://github.com/advisories/GHSA-ggr8-5vv4-36mx", name: "deepmerge-ts" }],
          nodes: ["node_modules/deepmerge-ts"],
        },
        prisma: {
          severity: "high",
          via: ["deepmerge-ts"],
          nodes: ["node_modules/prisma"],
        },
      },
    };
    const records = recordsFromAudit(audit);
    const parent = records.find((row) => row.package === "prisma") as { ghsaIds: string[] };
    expect(parent.ghsaIds).toEqual(["GHSA-GGR8-5VV4-36MX"]);
    const outcome = evaluateAuditPolicy(
      { stdout: JSON.stringify(audit), exitCode: 1 },
      policy,
      "2026-09-10"
    );
    expect(outcome.result).toBe("PASS");
  });
});

describe("R6 advisory set evaluation", () => {
  const approvedVia = {
    url: "https://github.com/advisories/GHSA-ggr8-5vv4-36mx",
    name: "deepmerge-ts",
    severity: "high",
  };
  const approvedNodes = ["node_modules/deepmerge-ts"];

  function policyInput(vulnerabilities: Record<string, unknown>) {
    return evaluateAuditPolicy(
      { stdout: JSON.stringify({ vulnerabilities }), exitCode: 1 },
      policy,
      "2026-09-10"
    );
  }

  it("A: approved GHSA only on unexpired dev_tooling is temporary PASS", () => {
    const outcome = policyInput({
      "deepmerge-ts": { severity: "high", via: [approvedVia], nodes: approvedNodes },
    });
    expect(outcome.result).toBe("PASS");
  });

  it("B: unknown High only on the approved path fails", () => {
    const outcome = policyInput({
      "deepmerge-ts": {
        severity: "high",
        via: [{ url: "https://github.com/advisories/GHSA-unkn-own0-advs", name: "deepmerge-ts" }],
        nodes: approvedNodes,
      },
    });
    expect(outcome.result).toBe("FAIL");
  });

  it("C: approved GHSA + unknown High fails (mutation: any-approved-GHSA would pass)", () => {
    const outcome = policyInput({
      "deepmerge-ts": {
        severity: "high",
        via: [
          approvedVia,
          { url: "https://github.com/advisories/GHSA-unkn-own0-advs", name: "deepmerge-ts", severity: "high" },
        ],
        nodes: approvedNodes,
      },
    });
    expect(outcome.result).toBe("FAIL");
    expect(outcome.exitCode).toBe(1);
  });

  it("D: approved GHSA + different known High fails", () => {
    const outcome = policyInput({
      "deepmerge-ts": {
        severity: "high",
        via: [
          approvedVia,
          { url: "https://github.com/advisories/GHSA-aaaa-bbbb-cccc", name: "deepmerge-ts" },
        ],
        nodes: approvedNodes,
      },
    });
    expect(outcome.result).toBe("FAIL");
  });

  it("E: approved GHSA + malformed High object is ERROR/FAIL", () => {
    const outcome = policyInput({
      "deepmerge-ts": {
        severity: "high",
        via: [approvedVia, {}],
        nodes: approvedNodes,
      },
    });
    expect(outcome.result).not.toBe("PASS");
    expect(["FAIL", "ERROR"]).toContain(outcome.result);
  });

  it("F: approved GHSA + missing-ID High fails", () => {
    const outcome = policyInput({
      "deepmerge-ts": {
        severity: "high",
        via: [approvedVia, { name: "mystery-lib", severity: "high", title: "unidentified high" }],
        nodes: approvedNodes,
      },
    });
    expect(outcome.result).toBe("FAIL");
    expect(outcome.failures.some((f) => /unidentified/i.test(f))).toBe(true);
  });

  it("G: two copies of the approved GHSA may PASS", () => {
    const outcome = policyInput({
      "deepmerge-ts": {
        severity: "high",
        via: [approvedVia, { ...approvedVia }],
        nodes: approvedNodes,
      },
    });
    expect(outcome.result).toBe("PASS");
  });

  it("H: approved GHSA + Moderate unrelated advisory does not hide the High evaluation", () => {
    const outcome = policyInput({
      "deepmerge-ts": { severity: "high", via: [approvedVia], nodes: approvedNodes },
      leftpad: {
        severity: "moderate",
        via: [{ url: "https://github.com/advisories/GHSA-mmmm-oooo-dddd", name: "leftpad" }],
        nodes: ["node_modules/leftpad"],
      },
    });
    expect(outcome.result).toBe("PASS");
    expect(outcome.records.every((row) => (row as { severity?: string }).severity !== "moderate")).toBe(true);
  });

  it("I: approved GHSA + Critical unknown advisory fails", () => {
    const outcome = policyInput({
      "deepmerge-ts": {
        severity: "critical",
        via: [
          approvedVia,
          { url: "https://github.com/advisories/GHSA-crit-ical-xxxx", name: "deepmerge-ts", severity: "critical" },
        ],
        nodes: approvedNodes,
      },
    });
    expect(outcome.result).toBe("FAIL");
  });

  it("J: approved GHSA reachable through production_runtime fails", () => {
    const outcome = policyInput({
      "deepmerge-ts": {
        severity: "high",
        via: [approvedVia],
        nodes: ["node_modules/deepmerge-ts", "node_modules/@prisma/client"],
      },
    });
    expect(outcome.result).toBe("FAIL");
  });

  it("K: malformed via list is ERROR/FAIL", () => {
    const outcome = policyInput({
      "deepmerge-ts": {
        severity: "high",
        via: "not-a-list",
        nodes: approvedNodes,
      },
    });
    expect(outcome.result).toBe("ERROR");
    expect(outcome.reason).toBe("malformed_via");
  });

  it("L: empty advisory set with High aggregate severity fails", () => {
    const outcome = policyInput({
      "deepmerge-ts": {
        severity: "high",
        via: [],
        nodes: approvedNodes,
      },
    });
    expect(outcome.result).toBe("FAIL");
  });

  it("null via entries and mixed malformed objects do not PASS", () => {
    const withNull = policyInput({
      "deepmerge-ts": {
        severity: "high",
        via: [approvedVia, null],
        nodes: approvedNodes,
      },
    });
    expect(withNull.result).not.toBe("PASS");
    const mixed = policyInput({
      "deepmerge-ts": {
        severity: "high",
        via: [approvedVia, 12, { unexpected: true }],
        nodes: approvedNodes,
      },
    });
    expect(mixed.result).not.toBe("PASS");
  });
});
