#!/usr/bin/env node
/**
 * Classifies npm audit findings against a reviewed exception list.
 * Fails on unreviewed / runtime / expired High or Critical advisories.
 * Matching requires the registered advisory ID — never package name alone.
 */
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { evaluateExceptionGate } from "./dependency-match.mjs";
const root = process.cwd();
const exceptionsPath = path.join(root, "docs/security/dependency-exceptions.json");
const outDir = path.join(root, "docs/audits");
mkdirSync(outDir, { recursive: true });

const policy = JSON.parse(readFileSync(exceptionsPath, "utf8"));
const today = new Date().toISOString().slice(0, 10);

let raw;
try {
  raw = execSync("npm audit --json", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
} catch (error) {
  raw = error.stdout || "";
  if (!raw) {
    console.error("npm audit --json produced no output");
    process.exit(2);
  }
}

writeFileSync(path.join(outDir, "npm-audit.last.json"), raw);

const audit = JSON.parse(raw);
const vulns = audit.vulnerabilities ?? {};
const records = [];

for (const [name, vuln] of Object.entries(vulns)) {
  const severity = vuln.severity;
  if (severity !== "high" && severity !== "critical") continue;
  const via = Array.isArray(vuln.via) ? vuln.via : [];
  const ghsaIds = via
    .map((item) => {
      if (typeof item === "object" && item && item.url) {
        const match = String(item.url).match(/GHSA-[a-z0-9-]+/i);
        return match ? match[0].toUpperCase() : null;
      }
      return null;
    })
    .filter(Boolean);
  const viaNames = via.map((item) => (typeof item === "string" ? item : item?.name)).filter(Boolean);
  const nodes = vuln.nodes ?? [];

  records.push({
    package: name,
    severity,
    ghsaIds,
    viaNames,
    nodes,
    range: vuln.range,
    fixAvailable: vuln.fixAvailable,
  });
}

writeFileSync(path.join(outDir, "dependency-policy-last.json"), JSON.stringify({ today, records, policy }, null, 2));

const failures = evaluateExceptionGate(records, policy, today);

console.log(`Dependency policy: ${records.length} high/critical package(s) considered, ${failures.length} failure(s).`);
for (const row of records) {
  console.log(`- ${row.package} ${row.severity} ghsa=${row.ghsaIds.join(",") || "inherited"}`);
}
if (failures.length > 0) {
  for (const failure of failures) console.error(failure);
  process.exit(1);
}
process.exit(0);
