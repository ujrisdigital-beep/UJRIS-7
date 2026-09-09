import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { evaluateTimestampAnomaly, type TimestampAnomalyResult } from "@/lib/forensics/timestamps";

export const FINDING_SCHEMA_VERSION = "1.0.0";
export const TIMESTAMP_RULE_ID = "F-TS-001";
export const TIMESTAMP_RULE_VERSION = "1.0.0";
export const FORENSIC_SERVICE_ACTOR = "ujris.forensics.service";

export interface ForensicFindingPayload {
  findingType: string;
  schemaVersion: string;
  ruleId: string;
  ruleVersion: string;
  sourceEvidenceIds: string[];
  sourceEvidenceHashes: string[];
  sourceTimestamps: Record<string, string | null>;
  derivedTimestamp: string | null;
  calculationInputs: Record<string, unknown>;
  calculationResult: Record<string, unknown>;
}

export function hashFindingPayload(payload: ForensicFindingPayload): string {
  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}

/** Identity for “unchanged inputs” — excludes wall-clock derivedTimestamp. */
export function hashFindingIdentity(payload: ForensicFindingPayload): string {
  const identity = {
    findingType: payload.findingType,
    schemaVersion: payload.schemaVersion,
    ruleId: payload.ruleId,
    ruleVersion: payload.ruleVersion,
    sourceEvidenceIds: payload.sourceEvidenceIds,
    sourceEvidenceHashes: payload.sourceEvidenceHashes,
    sourceTimestamps: payload.sourceTimestamps,
    calculationInputs: payload.calculationInputs,
    calculationResult: payload.calculationResult,
  };
  return createHash("sha256").update(canonicalJson(identity)).digest("hex");
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v)).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
}

export function verifyStoredFindingPayload(row: {
  findingType: string;
  schemaVersion: string;
  ruleId: string;
  ruleVersion: string;
  sourceEvidenceIds: string;
  sourceEvidenceHashes: string;
  sourceTimestamps: string;
  derivedTimestamp: Date | null;
  calculationInputs: string;
  calculationResult: string;
  payloadHash: string;
}): { intact: boolean; expectedHash: string } {
  const payload: ForensicFindingPayload = {
    findingType: row.findingType,
    schemaVersion: row.schemaVersion,
    ruleId: row.ruleId,
    ruleVersion: row.ruleVersion,
    sourceEvidenceIds: JSON.parse(row.sourceEvidenceIds) as string[],
    sourceEvidenceHashes: JSON.parse(row.sourceEvidenceHashes) as string[],
    sourceTimestamps: JSON.parse(row.sourceTimestamps) as Record<string, string | null>,
    derivedTimestamp: row.derivedTimestamp ? row.derivedTimestamp.toISOString() : null,
    calculationInputs: JSON.parse(row.calculationInputs) as Record<string, unknown>,
    calculationResult: JSON.parse(row.calculationResult) as Record<string, unknown>,
  };
  const expectedHash = hashFindingPayload(payload);
  return { intact: expectedHash === row.payloadHash, expectedHash };
}

function buildTimestampPayload(input: {
  evidenceId: string;
  sha256: string;
  createdRaw: unknown;
  modifiedRaw: unknown;
  anomaly: TimestampAnomalyResult;
}): ForensicFindingPayload {
  const sourceTimestamps = {
    created: input.anomaly.createdMs != null ? new Date(input.anomaly.createdMs).toISOString() : null,
    modified: input.anomaly.modifiedMs != null ? new Date(input.anomaly.modifiedMs).toISOString() : null,
  };
  return {
    findingType: input.anomaly.findingType ?? "no_timestamp_anomaly",
    schemaVersion: FINDING_SCHEMA_VERSION,
    ruleId: TIMESTAMP_RULE_ID,
    ruleVersion: TIMESTAMP_RULE_VERSION,
    sourceEvidenceIds: [input.evidenceId],
    sourceEvidenceHashes: [input.sha256],
    sourceTimestamps,
    derivedTimestamp: new Date().toISOString(),
    calculationInputs: {
      createdRaw: input.createdRaw ?? null,
      modifiedRaw: input.modifiedRaw ?? null,
    },
    calculationResult: {
      relation: input.anomaly.relation,
      findingType: input.anomaly.findingType,
      title: input.anomaly.title,
      detail: input.anomaly.detail,
    },
  };
}

export async function persistTimestampFinding(input: {
  evidenceId: string;
  sha256: string;
  createdRaw: unknown;
  modifiedRaw: unknown;
  createdBy?: string;
  revisionReason?: string;
}): Promise<{ id: string; created: boolean; supersededId: string | null }> {
  const anomaly = evaluateTimestampAnomaly(input.createdRaw, input.modifiedRaw);
  const payload = buildTimestampPayload({ ...input, anomaly });
  const payloadHash = hashFindingPayload(payload);
  const identity = hashFindingIdentity(payload);

  const latest = await db.forensicFinding.findFirst({
    where: { evidenceId: input.evidenceId, ruleId: TIMESTAMP_RULE_ID, supersededById: null },
    orderBy: { createdAt: "desc" },
  });

  if (latest) {
    const latestPayload: ForensicFindingPayload = {
      findingType: latest.findingType,
      schemaVersion: latest.schemaVersion,
      ruleId: latest.ruleId,
      ruleVersion: latest.ruleVersion,
      sourceEvidenceIds: JSON.parse(latest.sourceEvidenceIds) as string[],
      sourceEvidenceHashes: JSON.parse(latest.sourceEvidenceHashes) as string[],
      sourceTimestamps: JSON.parse(latest.sourceTimestamps) as Record<string, string | null>,
      derivedTimestamp: latest.derivedTimestamp ? latest.derivedTimestamp.toISOString() : null,
      calculationInputs: JSON.parse(latest.calculationInputs) as Record<string, unknown>,
      calculationResult: JSON.parse(latest.calculationResult) as Record<string, unknown>,
    };
    if (hashFindingIdentity(latestPayload) === identity) {
      return { id: latest.id, created: false, supersededId: latest.supersedesId };
    }
  }

  const created = await db.forensicFinding.create({
    data: {
      evidenceId: input.evidenceId,
      findingType: payload.findingType,
      schemaVersion: payload.schemaVersion,
      ruleId: payload.ruleId,
      ruleVersion: payload.ruleVersion,
      sourceEvidenceIds: JSON.stringify(payload.sourceEvidenceIds),
      sourceEvidenceHashes: JSON.stringify(payload.sourceEvidenceHashes),
      sourceTimestamps: JSON.stringify(payload.sourceTimestamps),
      derivedTimestamp: payload.derivedTimestamp ? new Date(payload.derivedTimestamp) : null,
      calculationInputs: JSON.stringify(payload.calculationInputs),
      calculationResult: JSON.stringify(payload.calculationResult),
      createdBy: input.createdBy ?? FORENSIC_SERVICE_ACTOR,
      confirmationStatus: "unconfirmed",
      supersedesId: latest?.id ?? null,
      revisionReason: latest
        ? (input.revisionReason ?? "recalculation_changed_inputs")
        : (input.revisionReason ?? "initial"),
      payloadHash,
    },
  });

  if (latest) {
    await db.forensicFinding.update({
      where: { id: latest.id },
      data: { supersededById: created.id },
    });
  }

  return { id: created.id, created: true, supersededId: latest?.id ?? null };
}

export async function confirmForensicFinding(input: {
  findingId: string;
  actorId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const row = await db.forensicFinding.findUnique({ where: { id: input.findingId } });
  if (!row) return { ok: false, error: "not_found" };
  if (row.supersededById) return { ok: false, error: "superseded" };
  await db.forensicFinding.update({
    where: { id: input.findingId },
    data: {
      confirmationStatus: "confirmed",
      confirmationActor: input.actorId,
      confirmationAt: new Date(),
    },
  });
  return { ok: true };
}

export async function getFindingProvenance(findingId: string) {
  const row = await db.forensicFinding.findUnique({ where: { id: findingId } });
  if (!row) return null;
  const integrity = verifyStoredFindingPayload(row);
  return { row, integrity };
}
