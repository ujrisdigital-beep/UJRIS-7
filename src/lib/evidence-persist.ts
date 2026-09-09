import { db } from "@/lib/db";
import { GENESIS_HASH, computeChainHash } from "@/lib/hash-chain";
import { deleteEvidenceFile } from "@/lib/storage";
import type { Prisma } from "@prisma/client";

export interface PersistEvidenceInput {
  id: string;
  caseId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  sha256: string;
  category: string;
  claimedDate: Date | null;
  description: string | null;
  forensicsJson: string;
  strength: number;
  actorId: string;
}

export async function persistEvidenceWithCustodyInTx(
  tx: Prisma.TransactionClient,
  input: PersistEvidenceInput
): Promise<void> {
  await tx.evidence.create({
    data: {
      id: input.id,
      caseId: input.caseId,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      storagePath: input.storagePath,
      sha256: input.sha256,
      category: input.category,
      claimedDate: input.claimedDate,
      description: input.description,
      forensics: input.forensicsJson,
      strength: input.strength,
    },
  });

  const uploadTimestamp = new Date().toISOString();
  const chainHash = computeChainHash({
    prevHash: GENESIS_HASH,
    id: input.id,
    timestamp: uploadTimestamp,
    action: "uploaded",
    detail: input.sha256,
  });

  await tx.custodyEvent.create({
    data: {
      evidenceId: input.id,
      action: "uploaded",
      actorId: input.actorId,
      detail: `sha256:${input.sha256}`,
      prevHash: GENESIS_HASH,
      chainHash,
      createdAt: new Date(uploadTimestamp),
    },
  });
}

/** Evidence row + required custody event, or neither. File on disk is deleted if the transaction fails. */
export async function persistEvidenceWithCustody(input: PersistEvidenceInput): Promise<void> {
  try {
    await db.$transaction(async (tx) => {
      await persistEvidenceWithCustodyInTx(tx, input);
    });
  } catch (error) {
    const existing = await db.evidence.findUnique({ where: { id: input.id } });
    if (!existing) {
      await deleteEvidenceFile(input.storagePath);
    }
    throw error;
  }
}
