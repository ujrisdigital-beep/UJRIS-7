import { createHash } from "crypto";

// Tamper-evident hash chain used for the audit trail and the evidence
// custody ledger. Each record's hash depends on the previous record's hash,
// so retrospectively editing history changes every subsequent hash.
export const GENESIS_HASH = "UJRIS_GENESIS_ROOT";

export function computeChainHash(input: {
  prevHash: string;
  id: string;
  timestamp: string;
  action: string;
  detail?: string | null;
}): string {
  const payload = [input.prevHash, input.id, input.timestamp, input.action, input.detail ?? ""].join("|");
  return createHash("sha256").update(payload).digest("hex");
}

export function sha256Buffer(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}
