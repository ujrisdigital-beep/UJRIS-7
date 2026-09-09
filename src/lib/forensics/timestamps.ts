/**
 * Deterministic timestamp comparison for forensic metadata.
 *
 * Rule F-TS-001 `later_revision_appears_present`:
 *   both timestamps parse to valid instants AND modifiedInstant is strictly
 *   after createdInstant by more than 24 hours.
 *
 * A reversed pair (created > modified) is a metadata inconsistency, not a
 * "later revision" finding. Equivalent instants in different timezones
 * produce no finding.
 *
 * Language: never forged / fabricated / fraudulent / tampered.
 */

export type TimestampRelation =
  | "created_before_modified"
  | "equal"
  | "created_after_modified"
  | "missing_created"
  | "missing_modified"
  | "invalid"
  | "equivalent";

export interface TimestampAnomalyResult {
  relation: TimestampRelation;
  findingType: "later_revision_appears_present" | "timestamp_inconsistency" | null;
  title: string | null;
  detail: string | null;
  createdMs: number | null;
  modifiedMs: number | null;
}

const HOUR = 60 * 60 * 1000;
const LATER_THRESHOLD_MS = 24 * HOUR;
const EQUIVALENT_EPSILON_MS = 1000;

export function parseTimestamp(value: unknown): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export function evaluateTimestampAnomaly(createdRaw: unknown, modifiedRaw: unknown): TimestampAnomalyResult {
  const created = createdRaw == null || createdRaw === "" ? null : parseTimestamp(createdRaw);
  const modified = modifiedRaw == null || modifiedRaw === "" ? null : parseTimestamp(modifiedRaw);

  if (createdRaw != null && createdRaw !== "" && !created) {
    return {
      relation: "invalid",
      findingType: null,
      title: null,
      detail: null,
      createdMs: null,
      modifiedMs: null,
    };
  }
  if (modifiedRaw != null && modifiedRaw !== "" && !modified) {
    return {
      relation: "invalid",
      findingType: null,
      title: null,
      detail: null,
      createdMs: created?.getTime() ?? null,
      modifiedMs: null,
    };
  }

  if (!created && !modified) {
    return { relation: "missing_created", findingType: null, title: null, detail: null, createdMs: null, modifiedMs: null };
  }
  if (!created) {
    return {
      relation: "missing_created",
      findingType: null,
      title: null,
      detail: null,
      createdMs: null,
      modifiedMs: modified?.getTime() ?? null,
    };
  }
  if (!modified) {
    return {
      relation: "missing_modified",
      findingType: null,
      title: null,
      detail: null,
      createdMs: created.getTime(),
      modifiedMs: null,
    };
  }

  const createdMs = created.getTime();
  const modifiedMs = modified.getTime();
  const delta = modifiedMs - createdMs;

  if (Math.abs(delta) <= EQUIVALENT_EPSILON_MS) {
    return {
      relation: "equivalent",
      findingType: null,
      title: null,
      detail: null,
      createdMs,
      modifiedMs,
    };
  }

  if (delta > LATER_THRESHOLD_MS) {
    const hours = Math.round(delta / HOUR);
    return {
      relation: "created_before_modified",
      findingType: "later_revision_appears_present",
      title: "Later revision appears present",
      detail: `Embedded modification timestamp is ${hours} hour(s) after the creation/capture timestamp. This is a metadata inconsistency that may be entirely normal (re-saving, export) and requires explanation; it is not a determination of authenticity.`,
      createdMs,
      modifiedMs,
    };
  }

  if (delta < -LATER_THRESHOLD_MS) {
    return {
      relation: "created_after_modified",
      findingType: "timestamp_inconsistency",
      title: "Creation timestamp post-dates modification timestamp",
      detail: "The embedded creation/capture timestamp is later than the modification timestamp. This is a metadata inconsistency and requires explanation. It does not establish that the file is inauthentic.",
      createdMs,
      modifiedMs,
    };
  }

  return {
    relation: delta > 0 ? "created_before_modified" : "created_after_modified",
    findingType: null,
    title: null,
    detail: null,
    createdMs,
    modifiedMs,
  };
}
