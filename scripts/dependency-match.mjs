/**
 * Exact-advisory matching for the dependency exception register.
 * A package name alone must never exempt an unrelated High/Critical.
 */

export function normalizeGhsa(id) {
  return String(id || "").toUpperCase();
}

function pathNodeMatches(node, declared) {
  const n = String(node).replace(/\\/g, "/");
  const d = String(declared).replace(/\\/g, "/");
  const leaf = d.split(/[/>]/).pop();
  if (!leaf) return false;
  if (n === d) return true;
  if (n.endsWith("/" + leaf)) {
    if (leaf === "prisma" && n.includes("@prisma/client")) return false;
    return true;
  }
  return false;
}

export function exceptionMatchesRecord(record, exception) {
  const exId = normalizeGhsa(exception.id);
  if (!exId.startsWith("GHSA-")) {
    return { ok: false, reason: "advisory_mismatch" };
  }

  const aliases = [exception.package, ...(exception.alsoAppliesTo ?? [])];
  const packageListed = aliases.includes(record.package);
  if (!packageListed) {
    return { ok: false, reason: "package_mismatch" };
  }

  const recordGhsas = (record.ghsaIds ?? []).map(normalizeGhsa).filter(Boolean);
  let advisoryOk = false;
  if (recordGhsas.length > 0) {
    // Every GHSA on this record must be this exception. A second High on
    // the same package must not ride along with GHSA-ggr8-5vv4-36mx.
    advisoryOk = recordGhsas.length === 1 && recordGhsas[0] === exId;
  } else if ((record.viaNames ?? []).some((name) => aliases.includes(name))) {
    // Inherited parent (prisma → @prisma/config → deepmerge-ts) has no GHSA
    // on its own row. It may inherit only this registered cluster.
    advisoryOk = true;
  }

  if (!advisoryOk) {
    return { ok: false, reason: "advisory_mismatch" };
  }

  const nodes = record.nodes ?? [];
  const paths = exception.dependencyPaths ?? [];
  const pathOk = nodes.some((node) => paths.some((declared) => pathNodeMatches(node, declared)));
  if (!pathOk) {
    return { ok: false, reason: "path_mismatch" };
  }

  return { ok: true, reason: "matched" };
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
    const ghsas = (record.ghsaIds ?? []).map(normalizeGhsa).filter(Boolean);
    if (ghsas.length === 0) {
      const match = exceptions.find((ex) => exceptionMatchesRecord(record, ex).ok);
      if (!match) {
        failures.push(`Unreviewed ${record.severity} advisory in ${record.package}`);
        continue;
      }
      const invalid = exceptionStillValid(match, record, today);
      if (invalid) failures.push(invalid);
      continue;
    }
    for (const ghsa of ghsas) {
      const slice = { ...record, ghsaIds: [ghsa] };
      const match = exceptions.find((ex) => exceptionMatchesRecord(slice, ex).ok);
      if (!match) {
        failures.push(`Unreviewed ${record.severity} advisory ${ghsa} in ${record.package}`);
        continue;
      }
      const invalid = exceptionStillValid(match, slice, today);
      if (invalid) failures.push(invalid);
    }
  }
  return failures;
}
