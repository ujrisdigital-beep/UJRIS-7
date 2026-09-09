import { db } from "@/lib/db";
import { GENESIS_HASH, computeChainHash } from "@/lib/hash-chain";

export async function appendAuditLog(input: {
  userId?: string | null;
  caseId?: string | null;
  action: string;
  detail?: string | null;
}) {
  const last = await db.auditLog.findFirst({ orderBy: { createdAt: "desc" } });
  const prevHash = last?.chainHash ?? GENESIS_HASH;
  const id = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const chainHash = computeChainHash({ prevHash, id, timestamp, action: input.action, detail: input.detail });

  await db.auditLog.create({
    data: {
      id,
      userId: input.userId ?? null,
      caseId: input.caseId ?? null,
      action: input.action,
      detail: input.detail ?? null,
      prevHash,
      chainHash,
      createdAt: new Date(timestamp),
    },
  });
}
