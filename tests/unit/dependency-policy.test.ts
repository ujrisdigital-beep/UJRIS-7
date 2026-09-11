import { describe, expect, it } from "vitest";
import {
  canonicalGhsa,
  classifyDependencyPath,
  classifyRecordPaths,
  evaluateAuditPolicy,
  exceptionMatchesRecord,
  evaluateExceptionGate,
  extractAdvisoryGhsa,
  normalizeGhsa,
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

describe("R7 advisory ID type safety", () => {
  const approvedId = "GHSA-ggr8-5vv4-36mx";
  const approvedUpper = "GHSA-GGR8-5VV4-36MX";

  function matchWith(ghsaIds: unknown, extra: Record<string, unknown> = {}) {
    return exceptionMatchesRecord(
      {
        package: "deepmerge-ts",
        severity: "high",
        ghsaIds,
        viaNames: [],
        nodes: ["node_modules/deepmerge-ts"],
        ...extra,
      },
      exception
    );
  }

  function gateWith(ghsaIds: unknown, extra: Record<string, unknown> = {}) {
    return evaluateExceptionGate(
      [
        {
          package: "deepmerge-ts",
          severity: "high",
          ghsaIds,
          viaNames: [],
          nodes: ["node_modules/deepmerge-ts"],
          ...extra,
        },
      ],
      policy,
      "2026-09-10"
    );
  }

  it("A: scalar approved GHSA in the approved context is a temporary PASS", () => {
    expect(canonicalGhsa(approvedId)).toBe(approvedUpper);
    expect(matchWith([approvedId]).ok).toBe(true);
    expect(gateWith([approvedId])).toEqual([]);
  });

  it("B: array-valued advisory ID cannot inherit the approved exception", () => {
    const wrapped = [approvedId];
    expect(canonicalGhsa(wrapped)).toBeNull();
    expect(matchWith([wrapped]).ok).toBe(false);
    expect(matchWith([wrapped]).reason).toBe("malformed_advisory_id");
    expect(gateWith([wrapped]).some((f) => /Malformed advisory identity/i.test(f))).toBe(true);
  });

  it("C: multi-id array including the approved GHSA still FAIL/ERROR", () => {
    const ids = [approvedId, "GHSA-unknown-high"];
    expect(canonicalGhsa(ids)).toBeNull();
    expect(matchWith([ids]).ok).toBe(false);
    expect(gateWith([ids]).length).toBeGreaterThan(0);
  });

  it("D: object-valued identity is not exception-matched", () => {
    const asObject = { id: approvedId };
    expect(canonicalGhsa(asObject)).toBeNull();
    expect(matchWith([asObject]).ok).toBe(false);
    expect(matchWith(asObject).ok).toBe(false);
    expect(gateWith([asObject]).length).toBeGreaterThan(0);
  });

  it("E: numeric advisory ID FAIL/ERROR", () => {
    expect(canonicalGhsa(123)).toBeNull();
    expect(matchWith([123]).ok).toBe(false);
    expect(gateWith([123]).length).toBeGreaterThan(0);
  });

  it("F: null advisory ID FAIL/ERROR", () => {
    expect(canonicalGhsa(null)).toBeNull();
    expect(matchWith([null]).ok).toBe(false);
    expect(gateWith([null]).length).toBeGreaterThan(0);
    expect(matchWith(null).ok).toBe(false);
  });

  it("G: surrounding whitespace is trimmed then validated", () => {
    expect(canonicalGhsa(` ${approvedId} `)).toBe(approvedUpper);
    expect(matchWith([` ${approvedId} `]).ok).toBe(true);
    expect(gateWith([` ${approvedId} `])).toEqual([]);
  });

  it("H: combined comma-separated scalar is malformed", () => {
    const combined = `${approvedId},GHSA-unknown-high`;
    expect(canonicalGhsa(combined)).toBeNull();
    expect(matchWith([combined]).ok).toBe(false);
    expect(gateWith([combined]).length).toBeGreaterThan(0);
  });

  it("I: lowercase GHSA is case-normalised then matched", () => {
    expect(canonicalGhsa("ghsa-ggr8-5vv4-36mx")).toBe(approvedUpper);
    expect(matchWith(["ghsa-ggr8-5vv4-36mx"]).ok).toBe(true);
  });

  it("J: array-valued ID with approved viaNames/path still FAIL/ERROR", () => {
    const result = matchWith([ [approvedId] ], { viaNames: ["deepmerge-ts", "prisma"] });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("malformed_advisory_id");
    expect(gateWith([ [approvedId] ], { viaNames: ["deepmerge-ts"] }).length).toBeGreaterThan(0);
  });

  it("nested array, empty array, array-with-null, and array-valued object id fail closed", () => {
    expect(matchWith([[ [approvedId] ]]).ok).toBe(false);
    expect(matchWith([]).ok).toBe(false);
    expect(matchWith([approvedId, null]).ok).toBe(false);
    expect(matchWith([{ id: [approvedId] }]).ok).toBe(false);
    expect(gateWith([[ [approvedId] ]]).length).toBeGreaterThan(0);
    expect(gateWith([]).length).toBeGreaterThan(0);
    expect(gateWith([approvedId, null]).length).toBeGreaterThan(0);
    expect(gateWith([{ id: [approvedId] }]).length).toBeGreaterThan(0);
  });

  it("prototype/toString tricks never coerce into the approved GHSA", () => {
    const tricky = { toString() { return approvedId; } };
    expect(String(tricky)).toBe(approvedId);
    expect(canonicalGhsa(tricky)).toBeNull();
    expect(matchWith([tricky]).ok).toBe(false);
    expect(normalizeGhsa(tricky)).toBe("");
  });

  it("mutation: String(advisoryId) === approvedId must not be sufficient", () => {
    const arrayId = [approvedId];
    expect(String(arrayId).toUpperCase()).toBe(approvedUpper);
    expect(canonicalGhsa(arrayId)).toBeNull();
    expect(normalizeGhsa(arrayId)).toBe("");
    expect(matchWith([arrayId]).ok).toBe(false);
    expect(matchWith([arrayId]).reason).toBe("malformed_advisory_id");
    const multi = [approvedId, "GHSA-unknown-high"];
    expect(canonicalGhsa(multi)).toBeNull();
    expect(matchWith([multi]).ok).toBe(false);
    expect(matchWith([arrayId], { viaNames: ["deepmerge-ts"] }).ok).toBe(false);
  });
});

describe("R8 exact GHSA URL/token identity", () => {
  const approvedId = "GHSA-ggr8-5vv4-36mx";
  const approvedUpper = "GHSA-GGR8-5VV4-36MX";
  const approvedUrl = "https://github.com/advisories/GHSA-ggr8-5vv4-36mx";
  const approvedVia = { url: approvedUrl, name: "deepmerge-ts", severity: "high" };
  const approvedNodes = ["node_modules/deepmerge-ts"];

  function policyForUrl(url: string) {
    return evaluateAuditPolicy(
      {
        stdout: JSON.stringify({
          vulnerabilities: {
            "deepmerge-ts": { severity: "high", via: [{ url, name: "deepmerge-ts" }], nodes: approvedNodes },
          },
        }),
        exitCode: 1,
      },
      policy,
      "2026-09-10"
    );
  }

  it("exact GitHub advisory URL extracts the canonical GHSA and may PASS in approved context", () => {
    expect(extractAdvisoryGhsa(approvedUrl)).toEqual({ ghsa: approvedUpper, malformed: false });
    expect(extractAdvisoryGhsa(approvedId)).toEqual({ ghsa: approvedUpper, malformed: false });
    expect(policyForUrl(approvedUrl).result).toBe("PASS");
  });

  it("GHSA prefix plus extra suffix is INVALID and does not inherit EX-DEP-001", () => {
    const extra = "https://github.com/advisories/GHSA-ggr8-5vv4-36mx-extra";
    const glued = "https://github.com/advisories/GHSA-ggr8-5vv4-36mxXYZ";
    expect(extractAdvisoryGhsa(extra)).toEqual({ ghsa: null, malformed: true });
    expect(extractAdvisoryGhsa(glued)).toEqual({ ghsa: null, malformed: true });
    expect(policyForUrl(extra).result).not.toBe("PASS");
    expect(policyForUrl(glued).result).not.toBe("PASS");
  });

  it("nested path after an otherwise exact GHSA segment is INVALID", () => {
    const nested = "https://github.com/advisories/GHSA-ggr8-5vv4-36mx/extra";
    expect(extractAdvisoryGhsa(nested)).toEqual({ ghsa: null, malformed: true });
    expect(policyForUrl(nested).result).not.toBe("PASS");
  });

  it("non-github host with a GHSA-looking path does not inherit the exception", () => {
    const hostile = "https://example.test/GHSA-ggr8-5vv4-36mx-malformed";
    expect(extractAdvisoryGhsa(hostile)).toEqual({ ghsa: null, malformed: true });
    expect(policyForUrl(hostile).result).not.toBe("PASS");
  });

  it("encoded malformed suffix is INVALID after decoding", () => {
    const encoded = "https://github.com/advisories/GHSA-ggr8-5vv4-36mx%2Dextra";
    expect(extractAdvisoryGhsa(encoded)).toEqual({ ghsa: null, malformed: true });
    expect(policyForUrl(encoded).result).not.toBe("PASS");
  });

  it("query and fragment malformed identities are INVALID", () => {
    const query = "https://github.com/advisories/GHSA-ggr8-5vv4-36mx?id=GHSA-ggr8-5vv4-36mxBAD";
    const fragment = "https://github.com/advisories/GHSA-ggr8-5vv4-36mx#GHSA-ggr8-5vv4-36mxBAD";
    const queryOnly = "https://example.test/?id=GHSA-ggr8-5vv4-36mxBAD";
    expect(extractAdvisoryGhsa(query)).toEqual({ ghsa: null, malformed: true });
    expect(extractAdvisoryGhsa(fragment)).toEqual({ ghsa: null, malformed: true });
    expect(extractAdvisoryGhsa(queryOnly)).toEqual({ ghsa: null, malformed: true });
    expect(policyForUrl(query).result).not.toBe("PASS");
  });

  it("adjacent malformed tokens are not truncated to the approved GHSA", () => {
    const tokens = [
      "GHSA-ggr8-5vv4-36mxA",
      "AGHSA-ggr8-5vv4-36mx",
      "GHSA-ggr8-5vv4-36mx-extra",
      "GHSA-ggr8-5vv4-36mx_",
      "GHSA-ggr8-5vv4-36mx.other",
    ];
    for (const token of tokens) {
      expect(extractAdvisoryGhsa(token)).toEqual({ ghsa: null, malformed: true });
      expect(canonicalGhsa(token)).toBeNull();
    }
  });

  it("mutation: first GHSA-looking substring would inherit EX-DEP-001 from a suffix", () => {
    const extra = "https://github.com/advisories/GHSA-ggr8-5vv4-36mx-extra";
    const substring = extra.match(/GHSA-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}/i)?.[0];
    expect(substring?.toUpperCase()).toBe(approvedUpper);
    expect(extractAdvisoryGhsa(extra).ghsa).toBeNull();
    expect(extractAdvisoryGhsa(extra).malformed).toBe(true);
    expect(policyForUrl(extra).result).not.toBe("PASS");
    expect(policyForUrl("https://github.com/advisories/GHSA-ggr8-5vv4-36mxXYZ").result).not.toBe("PASS");
  });

  it("preserves R7 non-scalar safety and R6 approved-only PASS", () => {
    expect(canonicalGhsa([approvedId])).toBeNull();
    expect(extractAdvisoryGhsa(["GHSA-ggr8-5vv4-36mx"] as unknown as string).malformed).toBe(true);
    const outcome = evaluateAuditPolicy(
      {
        stdout: JSON.stringify({
          vulnerabilities: {
            "deepmerge-ts": { severity: "high", via: [approvedVia], nodes: approvedNodes },
          },
        }),
        exitCode: 1,
      },
      policy,
      "2026-09-10"
    );
    expect(outcome.result).toBe("PASS");
  });
});

