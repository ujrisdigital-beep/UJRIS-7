/**
 * Path classification and fail-closed audit JSON parsing for the
 * dependency exception gate.
 *
 * Three independent identities: advisory, package, dependency path class.
 * A registered exception is valid ONLY when all expected properties match.
 * UNKNOWN and production_runtime never inherit a development-only exception.
 */

export function normalizeGhsa(id) {
  return String(id || "").toUpperCase();
}

/** @typedef {"dev_tooling" | "production_runtime" | "unknown"} PathClass */

function normalizeNode(node) {
  return String(node || "")
    .replace(/\\/g, "/")
    .replace(/^\.?\//, "");
}

function pathSegments(node) {
  return normalizeNode(node).split("/").filter(Boolean);
}

function hasPackageSegment(node, pkg) {
  const parts = pathSegments(node);
  if (pkg.startsWith("@")) {
    const [scope, name] = pkg.split("/");
    for (let i = 0; i < parts.length - 1; i++) {
      if (parts[i] === scope && parts[i + 1] === name) return true;
    }
    return false;
  }
  return parts.includes(pkg);
}

/**
 * Classify a single npm-audit `nodes[]` entry.
 * `@prisma/client` is checked before any `prisma` substring.
 */
export function classifyDependencyPath(node) {
  const n = normalizeNode(node);
  if (!n) return "unknown";

  if (hasPackageSegment(n, "@prisma/client")) {
    return "production_runtime";
  }

  if (
    n === "node_modules/prisma" ||
    n.startsWith("node_modules/prisma/") ||
    n === "node_modules/@prisma/config" ||
    n.startsWith("node_modules/@prisma/config/") ||
    n === "node_modules/deepmerge-ts" ||
    n.startsWith("node_modules/deepmerge-ts/") ||
    n === "prisma" ||
    n.startsWith("prisma/") ||
    n === "@prisma/config" ||
    n.startsWith("@prisma/config/") ||
    n === "deepmerge-ts" ||
    n.startsWith("deepmerge-ts/") ||
    n === "prisma>@prisma/config>deepmerge-ts"
  ) {
    return "dev_tooling";
  }

  return "unknown";
}

/**
 * Conservative aggregate: any production_runtime node wins, then unknown.
 * Empty nodes are unknown (fail closed).
 */
export function classifyRecordPaths(nodes) {
  const list = Array.isArray(nodes) ? nodes : [];
  if (list.length === 0) return "unknown";
  const classes = list.map(classifyDependencyPath);
  if (classes.some((c) => c === "production_runtime")) return "production_runtime";
  if (classes.some((c) => c === "unknown")) return "unknown";
  if (classes.every((c) => c === "dev_tooling")) return "dev_tooling";
  return "unknown";
}

function pathNodeMatches(node, declared) {
  const n = normalizeNode(node);
  const d = normalizeNode(declared);
  if (!n || !d) return false;
  if (n === d) return true;
  if (d.includes(">")) {
    return n === d;
  }
  if (n === `node_modules/${d}` || n.startsWith(`node_modules/${d}/`)) return true;
  if (d.startsWith("node_modules/") && (n === d || n.startsWith(`${d}/`))) return true;
  return false;
}

export function exceptionMatchesRecord(record, exception) {
  const exId = normalizeGhsa(exception.advisoryId || exception.id);
  if (!exId.startsWith("GHSA-")) {
    return { ok: false, reason: "advisory_mismatch" };
  }

  const aliases = [exception.package, ...(exception.alsoAppliesTo ?? [])];
  const packageListed = aliases.includes(record.package);
  if (!packageListed) {
    return { ok: false, reason: "package_mismatch" };
  }

  // Advisory identity is mandatory and exact. Package, path, via-name,
  // parent package, and severity must never grant an exception alone.
  const recordGhsas = [...new Set((record.ghsaIds ?? []).map(normalizeGhsa).filter(Boolean))];
  if (recordGhsas.length !== 1 || recordGhsas[0] !== exId) {
    return { ok: false, reason: "advisory_mismatch" };
  }

  const pathClass = record.pathClass ?? classifyRecordPaths(record.nodes ?? []);
  const acceptedClasses = exception.acceptedPathClasses ?? ["dev_tooling"];
  if (!acceptedClasses.includes(pathClass) || pathClass === "unknown" || pathClass === "production_runtime") {
    return { ok: false, reason: pathClass === "production_runtime" ? "runtime_path" : "path_class_mismatch" };
  }

  const nodes = record.nodes ?? [];
  const paths = exception.dependencyPaths ?? [];
  if (nodes.length === 0) {
    return { ok: false, reason: "path_mismatch" };
  }
  const pathOk =
    nodes.every((node) => classifyDependencyPath(node) === "dev_tooling") &&
    nodes.every((node) => paths.some((declared) => pathNodeMatches(node, declared)));
  if (!pathOk) {
    return { ok: false, reason: "path_mismatch" };
  }

  return { ok: true, reason: "matched", pathClass };
}

function exceptionStillValid(match, record, today) {
  if (new Date(match.expires) < new Date(today)) {
    return `Expired exception ${match.id} for ${record.package}`;
  }
  if (match.scope !== "development") {
    return `Exception ${match.id} is not development-scoped`;
  }
  if (record.severity === "critical" && match.severity !== "critical") {
    return `Critical advisory ${record.package} cannot use a lower-severity exception`;
  }
  return null;
}

export function evaluateExceptionGate(records, policy, today) {
  const failures = [];
  const exceptions = policy.exceptions ?? [];
  for (const record of records) {
    const annotated = {
      ...record,
      pathClass: record.pathClass ?? classifyRecordPaths(record.nodes ?? []),
    };
    const ghsas = [...new Set((annotated.ghsaIds ?? []).map(normalizeGhsa).filter(Boolean))];
    if (ghsas.length === 0) {
      failures.push(
        `Unreviewed ${annotated.severity} advisory in ${annotated.package} (missing advisory id; pathClass=${annotated.pathClass})`
      );
      continue;
    }
    for (const ghsa of ghsas) {
      const slice = { ...annotated, ghsaIds: [ghsa] };
      const match = exceptions.find((ex) => exceptionMatchesRecord(slice, ex).ok);
      if (!match) {
        failures.push(
          `Unreviewed ${slice.severity} advisory ${ghsa} in ${slice.package} (pathClass=${slice.pathClass})`
        );
        continue;
      }
      const invalid = exceptionStillValid(match, slice, today);
      if (invalid) failures.push(invalid);
    }
  }
  return failures;
}

/**
 * Distinguish AUDIT COMPLETED from AUDIT COULD NOT COMPLETE.
 * Parser failure must never look like a clean report.
 */
export function parseAuditJson(raw, meta = {}) {
  if (meta.timedOut) {
    return { ok: false, result: "ERROR", reason: "timeout" };
  }
  if (meta.launched === false) {
    return { ok: false, result: "ERROR", reason: "audit_command_failed", detail: String(meta.spawnError || "not launched") };
  }
  if (meta.spawnError) {
    return { ok: false, result: "ERROR", reason: "audit_command_failed", detail: String(meta.spawnError) };
  }
  if (meta.signal) {
    return { ok: false, result: "ERROR", reason: "signal_exit", detail: String(meta.signal) };
  }
  const exitCode = meta.exitCode;
  if (exitCode != null && exitCode !== 0 && exitCode !== 1) {
    return { ok: false, result: "ERROR", reason: "unexpected_exit", detail: String(exitCode) };
  }
  if (exitCode == null && meta.launched === true) {
    return { ok: false, result: "ERROR", reason: "unexpected_exit", detail: "missing_exit_code" };
  }
  const text = raw == null ? "" : String(raw);
  if (!text.trim()) {
    return { ok: false, result: "ERROR", reason: "empty_audit_output" };
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, result: "ERROR", reason: "malformed_json" };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, result: "ERROR", reason: "unexpected_schema" };
  }
  if (parsed.error) {
    return { ok: false, result: "ERROR", reason: "audit_service_error", detail: parsed.error };
  }
  if (!parsed.vulnerabilities || typeof parsed.vulnerabilities !== "object" || Array.isArray(parsed.vulnerabilities)) {
    return { ok: false, result: "ERROR", reason: "missing_vulnerabilities" };
  }
  return { ok: true, result: "PARSED", audit: parsed, exitCode: exitCode ?? 0 };
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function ghsaFromViaItem(item) {
  if (typeof item === "object" && item && item.url) {
    const match = String(item.url).match(/GHSA-[a-z0-9-]+/i);
    return match ? match[0].toUpperCase() : null;
  }
  return null;
}

/**
 * Reconstruct advisory identity from the audit graph. String `via`
 * entries copy GHSAs from the named sibling vulnerability. This is not
 * package-only exception inheritance — the resolved ID must still match
 * exactly later.
 */
function resolveGhsaIds(vuln, vulns, seen) {
  const via = Array.isArray(vuln.via) ? vuln.via : [];
  const direct = via.map(ghsaFromViaItem).filter(Boolean);
  if (direct.length > 0) return [...new Set(direct)];
  const inherited = [];
  for (const item of via) {
    if (typeof item !== "string") continue;
    if (seen.has(item)) continue;
    seen.add(item);
    const parent = vulns[item];
    if (!isPlainObject(parent)) continue;
    inherited.push(...resolveGhsaIds(parent, vulns, seen));
  }
  return [...new Set(inherited)];
}

export function auditHasMalformedVulnerability(audit) {
  const vulns = audit?.vulnerabilities;
  if (!vulns || typeof vulns !== "object" || Array.isArray(vulns)) return true;
  return Object.values(vulns).some((vuln) => !isPlainObject(vuln));
}

export function recordsFromAudit(audit) {
  const vulns = audit.vulnerabilities ?? {};
  const records = [];
  for (const [name, vuln] of Object.entries(vulns)) {
    if (!isPlainObject(vuln)) {
      const error = new Error("malformed_vulnerability");
      error.code = "malformed_vulnerability";
      throw error;
    }
    const severity = vuln.severity;
    if (severity !== "high" && severity !== "critical") continue;
    const via = Array.isArray(vuln.via) ? vuln.via : [];
    const ghsaIds = resolveGhsaIds(vuln, vulns, new Set([name]));
    const viaNames = via.map((item) => (typeof item === "string" ? item : item?.name)).filter(Boolean);
    const nodes = vuln.nodes ?? [];
    records.push({
      package: name,
      severity,
      ghsaIds,
      viaNames,
      nodes,
      pathClass: classifyRecordPaths(nodes),
      range: vuln.range,
      fixAvailable: vuln.fixAvailable,
    });
  }
  return records;
}

/**
 * @returns {{ result: "PASS" | "FAIL" | "ERROR", exitCode: number, failures: string[], records: object[], reason?: string }}
 */
export function evaluateAuditPolicy(input, policy, today) {
  const parsed = parseAuditJson(input.stdout, {
    exitCode: input.exitCode,
    spawnError: input.spawnError,
    timedOut: input.timedOut,
    launched: input.launched,
    signal: input.signal,
  });
  if (!parsed.ok) {
    return {
      result: "ERROR",
      exitCode: 2,
      failures: [`AUDIT COULD NOT COMPLETE: ${parsed.reason}`],
      records: [],
      reason: parsed.reason,
    };
  }
  if (auditHasMalformedVulnerability(parsed.audit)) {
    return {
      result: "ERROR",
      exitCode: 2,
      failures: ["AUDIT COULD NOT COMPLETE: malformed_vulnerability"],
      records: [],
      reason: "malformed_vulnerability",
    };
  }
  let records;
  try {
    records = recordsFromAudit(parsed.audit);
  } catch (error) {
    if (error && error.code === "malformed_vulnerability") {
      return {
        result: "ERROR",
        exitCode: 2,
        failures: ["AUDIT COULD NOT COMPLETE: malformed_vulnerability"],
        records: [],
        reason: "malformed_vulnerability",
      };
    }
    throw error;
  }
  const failures = evaluateExceptionGate(records, policy, today);
  if (failures.length > 0) {
    return { result: "FAIL", exitCode: 1, failures, records };
  }
  return { result: "PASS", exitCode: 0, failures: [], records };
}
