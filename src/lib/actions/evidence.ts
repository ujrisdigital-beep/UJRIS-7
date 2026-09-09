"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { entitlementsFor } from "@/lib/plans";
import { appendAuditLog } from "@/lib/audit";
import { persistEvidenceWithCustody } from "@/lib/evidence-persist";
import { persistTimestampFinding } from "@/lib/forensics/findings";
import { GENESIS_HASH, computeChainHash } from "@/lib/hash-chain";
import { analyzeEvidenceFile, evidenceStrengthScore } from "@/lib/forensics/evidence";
import { relativeEvidencePath, saveEvidenceFile, MAX_UPLOAD_BYTES, ALLOWED_MIME_TYPES } from "@/lib/storage";
import { refreshCaseIntelligence } from "@/lib/actions/cases";

export interface EvidenceActionResult {
  ok: boolean;
  error?: string;
  evidenceId?: string;
}

const uploadSchema = z.object({
  caseId: z.string().min(1),
  category: z.enum(["email", "document", "image", "audio", "other"]).default("document"),
  claimedDate: z.string().optional(),
  description: z.string().max(2000).optional(),
});

export async function uploadEvidenceAction(
  _prev: EvidenceActionResult | undefined,
  formData: FormData
): Promise<EvidenceActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please log in again." };

  const parsed = uploadSchema.safeParse({
    caseId: formData.get("caseId"),
    category: formData.get("category") || undefined,
    claimedDate: formData.get("claimedDate") || undefined,
    description: formData.get("description") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid upload." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Please choose a file to upload." };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: "That file is larger than the 25MB limit." };
  }

  const kase = await db.case.findUnique({ where: { id: parsed.data.caseId }, include: { evidence: true } });
  if (!kase || kase.userId !== user.id) {
    return { ok: false, error: "Case not found." };
  }

  const plan = entitlementsFor(user.plan);
  if (kase.evidence.length >= plan.maxEvidencePerCase) {
    return { ok: false, error: `Your ${plan.name} plan supports up to ${plan.maxEvidencePerCase} evidence item(s) per case. Upgrade to add more.` };
  }

  const mimeType = file.type || "application/octet-stream";
  if (!ALLOWED_MIME_TYPES.has(mimeType) && parsed.data.category !== "other") {
    // Unknown/uncommon type — still allow, but record as "other" and note limited analysis.
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const claimedDate = parsed.data.claimedDate ? new Date(parsed.data.claimedDate) : null;

  const forensics = await analyzeEvidenceFile(buffer, mimeType, file.name, claimedDate);
  const strength = evidenceStrengthScore(forensics.flags, false, forensics.category);

  const evidenceId = crypto.randomUUID();
  const relPath = relativeEvidencePath(kase.id, evidenceId, file.name);
  await saveEvidenceFile(relPath, buffer);

  try {
    await persistEvidenceWithCustody({
      id: evidenceId,
      caseId: kase.id,
      fileName: file.name,
      mimeType,
      sizeBytes: file.size,
      storagePath: relPath,
      sha256: forensics.sha256,
      category: parsed.data.category,
      claimedDate,
      description: parsed.data.description ?? null,
      forensicsJson: JSON.stringify({ metadata: forensics.metadata, flags: forensics.flags }),
      strength,
      actorId: user.id,
    });
  } catch {
    return { ok: false, error: "Could not save this evidence. Please try again." };
  }

  await persistTimestampFinding({
    evidenceId,
    sha256: forensics.sha256,
    createdRaw: (forensics.metadata.readableCreateDate ?? forensics.metadata.creationDate) as unknown,
    modifiedRaw: (forensics.metadata.readableModifyDate ?? forensics.metadata.modificationDate) as unknown,
    createdBy: user.id,
    revisionReason: "initial",
  });

  const reviewFlags = forensics.flags.filter((f) => f.severity === "review");
  if (reviewFlags.length > 0) {
    await db.actionItem.create({
      data: {
        caseId: kase.id,
        title: `Review a forensic flag on "${file.name}"`,
        description: reviewFlags[0].detail,
        kind: "review_contradiction",
        priority: "high",
        linkTo: `/cases/${kase.id}/evidence#${evidenceId}`,
      },
    });
  }

  await appendAuditLog({
    userId: user.id,
    caseId: kase.id,
    action: "EVIDENCE_UPLOADED",
    detail: `file=${file.name} sha256=${forensics.sha256}`,
  });

  await refreshCaseIntelligence(kase.id);
  revalidatePath(`/cases/${kase.id}/evidence`);

  return { ok: true, evidenceId };
}

export async function recordCustodyView(evidenceId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const evidence = await db.evidence.findUnique({ where: { id: evidenceId }, include: { case: true, custody: { orderBy: { createdAt: "desc" }, take: 1 } } });
  if (!evidence || evidence.case.userId !== user.id) return;

  const prevHash = evidence.custody[0]?.chainHash ?? GENESIS_HASH;
  const timestamp = new Date().toISOString();
  const chainHash = computeChainHash({ prevHash, id: evidenceId, timestamp, action: "viewed" });
  await db.custodyEvent.create({
    data: { evidenceId, action: "viewed", actorId: user.id, prevHash, chainHash, createdAt: new Date(timestamp) },
  });
}
