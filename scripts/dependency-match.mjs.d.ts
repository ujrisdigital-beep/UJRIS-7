export function normalizeGhsa(id: unknown): string;
export function canonicalGhsa(id: unknown): string | null;
export function extractAdvisoryGhsa(value: unknown): { ghsa: string | null; malformed: boolean };

export type PathClass = "dev_tooling" | "production_runtime" | "unknown";

export function classifyDependencyPath(node: string): PathClass;
export function classifyRecordPaths(nodes: string[] | undefined): PathClass;

export function exceptionMatchesRecord(
  record: {
    package: string;
    severity?: string;
    ghsaIds?: unknown;
    viaNames?: string[];
    nodes?: string[];
    pathClass?: PathClass;
  },
  exception: {
    id: string;
    advisoryId?: string;
    package: string;
    alsoAppliesTo?: string[];
    severity?: string;
    scope?: string;
    expires?: string;
    dependencyPaths?: string[];
    acceptedPathClasses?: PathClass[];
  }
): { ok: boolean; reason: string; pathClass?: PathClass };

export function evaluateExceptionGate(
  records: Array<{
    package: string;
    severity: string;
    ghsaIds?: unknown;
    viaNames?: string[];
    unidentifiedAdvisories?: number;
    emptyAdvisorySet?: boolean;
    malformedVia?: boolean;
    nodes?: string[];
    pathClass?: PathClass;
  }>,
  policy: { exceptions?: Array<Record<string, unknown>> },
  today: string
): string[];

export function parseAuditJson(
  raw: string | null | undefined,
  meta?: { exitCode?: number | null; spawnError?: string; timedOut?: boolean }
): { ok: boolean; result: "ERROR" | "PARSED"; reason?: string; audit?: Record<string, unknown>; detail?: unknown; exitCode?: number };

export function auditHasMalformedVulnerability(audit: { vulnerabilities?: Record<string, unknown> }): boolean;
export function recordsFromAudit(audit: { vulnerabilities?: Record<string, unknown> }): Array<Record<string, unknown>>;

export function evaluateAuditPolicy(
  input: { stdout?: string; stderr?: string; exitCode?: number | null; spawnError?: string; timedOut?: boolean },
  policy: { exceptions?: Array<Record<string, unknown>> },
  today: string
): { result: "PASS" | "FAIL" | "ERROR"; exitCode: number; failures: string[]; records: Array<Record<string, unknown>>; reason?: string };
