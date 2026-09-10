export function normalizeGhsa(id: unknown): string;

export function exceptionMatchesRecord(
  record: {
    package: string;
    severity?: string;
    ghsaIds?: string[];
    viaNames?: string[];
    nodes?: string[];
  },
  exception: {
    id: string;
    package: string;
    alsoAppliesTo?: string[];
    severity?: string;
    scope?: string;
    expires?: string;
    dependencyPaths?: string[];
  }
): { ok: boolean; reason: string };

export function evaluateExceptionGate(
  records: Array<{
    package: string;
    severity: string;
    ghsaIds?: string[];
    viaNames?: string[];
    nodes?: string[];
  }>,
  policy: { exceptions?: Array<Record<string, unknown>> },
  today: string
): string[];
