#!/usr/bin/env node
/**
 * Classifies npm audit findings against a reviewed exception list.
 * Fails on unreviewed / runtime / expired High or Critical advisories.
 */
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

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
  const isDev = ["deepmerge-ts", "prisma", "@prisma/config"].includes(name);

  records.push({
    package: name,
    severity,
    ghsaIds,
    viaNames,
    nodes,
    range: vuln.range,
    fixAvailable: vuln.fixAvailable,
    developmentOnlyHeuristic: isDev,
  });
}

writeFileSync(path.join(outDir, "dependency-policy-last.json"), JSON.stringify({ today, records, policy }, null, 2));

const failures = [];
for (const record of records) {
  const match = policy.exceptions.find((ex) => {
    const id = String(ex.id).toUpperCase();
    const idOk = record.ghsaIds.includes(id);
    const aliases = [ex.package, ...(ex.alsoAppliesTo ?? [])];
    const packageOk = aliases.includes(record.package) || record.viaNames.some((n) => aliases.includes(n));
    const pathOk = record.nodes.some((n) =>
      ex.dependencyPaths.some((p) => n.includes(p.split(">").pop() ?? p))
    );
    return (idOk || packageOk) && (pathOk || packageOk);
  });

  if (!match) {
    failures.push(`Unreviewed ${record.severity} advisory in ${record.package}`);
    continue;
  }
  if (new Date(match.expires) < new Date(today)) {
    failures.push(`Expired exception ${match.id} for ${record.package}`);
    continue;
  }
  if (match.scope !== "development") {
    failures.push(`Exception ${match.id} is not development-scoped`);
    continue;
  }
  if (match.severity !== record.severity && record.severity === "critical") {
    failures.push(`Critical advisory ${record.package} cannot use a lower-severity exception`);
  }
}

console.log(`Dependency policy: ${records.length} high/critical package(s) considered, ${failures.length} failure(s).`);
for (const row of records) {
  console.log(`- ${row.package} ${row.severity} ghsa=${row.ghsaIds.join(",") || "n/a"}`);
}
if (failures.length > 0) {
  for (const failure of failures) console.error(failure);
  process.exit(1);
}
process.exit(0);
