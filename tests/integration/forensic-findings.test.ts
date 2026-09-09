import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetTestDatabase } from "../helpers/db";
import { seedCase, seedUser } from "../helpers/seed";
import { persistEvidenceWithCustody } from "@/lib/evidence-persist";
import { relativeEvidencePath, saveEvidenceFile } from "@/lib/storage";
import { sha256Buffer } from "@/lib/hash-chain";
import {
  confirmForensicFinding,
  getFindingProvenance,
  persistTimestampFinding,
  verifyStoredFindingPayload,
} from "@/lib/forensics/findings";

async function seedEvidence() {
  const user = await seedUser();
  const kase = await seedCase(user.id);
  const id = crypto.randomUUID();
  const bytes = Buffer.from("forensic-bytes");
  const storagePath = relativeEvidencePath(kase.id, id, "doc.txt");
  await saveEvidenceFile(storagePath, bytes);
  const hash = sha256Buffer(bytes);
  await persistEvidenceWithCustody({
    id,
    caseId: kase.id,
    fileName: "doc.txt",
    mimeType: "text/plain",
    sizeBytes: bytes.length,
    storagePath,
    sha256: hash,
    category: "document",
    claimedDate: null,
    description: null,
    forensicsJson: "{}",
    strength: 40,
    actorId: user.id,
  });
  return { user, id, hash };
}

describe("forensic finding provenance", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("creates an initial finding and preserves the source hash", async () => {
    const { id, hash } = await seedEvidence();
    const first = await persistTimestampFinding({
      evidenceId: id,
      sha256: hash,
      createdRaw: "2024-01-01T00:00:00Z",
      modifiedRaw: "2024-01-05T00:00:00Z",
    });
    expect(first.created).toBe(true);
    const row = await db.forensicFinding.findUnique({ where: { id: first.id } });
    expect(row?.findingType).toBe("later_revision_appears_present");
    expect(JSON.parse(row?.sourceEvidenceHashes ?? "[]")).toEqual([hash]);
    expect(row?.confirmationStatus).toBe("unconfirmed");
  });

  it("does not write a new row when recalculation inputs are unchanged", async () => {
    const { id, hash } = await seedEvidence();
    const first = await persistTimestampFinding({
      evidenceId: id,
      sha256: hash,
      createdRaw: "2024-01-01T00:00:00Z",
      modifiedRaw: "2024-01-05T00:00:00Z",
    });
    const again = await persistTimestampFinding({
      evidenceId: id,
      sha256: hash,
      createdRaw: "2024-01-01T00:00:00Z",
      modifiedRaw: "2024-01-05T00:00:00Z",
    });
    expect(again.created).toBe(false);
    expect(again.id).toBe(first.id);
    expect(await db.forensicFinding.count({ where: { evidenceId: id } })).toBe(1);
  });

  it("versions a changed recalculation and does not carry confirmation forward", async () => {
    const { user, id, hash } = await seedEvidence();
    const first = await persistTimestampFinding({
      evidenceId: id,
      sha256: hash,
      createdRaw: "2024-01-01T00:00:00Z",
      modifiedRaw: "2024-01-05T00:00:00Z",
    });
    await confirmForensicFinding({ findingId: first.id, actorId: user.id });
    expect((await db.forensicFinding.findUnique({ where: { id: first.id } }))?.confirmationStatus).toBe("confirmed");

    const second = await persistTimestampFinding({
      evidenceId: id,
      sha256: hash,
      createdRaw: "2024-01-10T00:00:00Z",
      modifiedRaw: "2024-01-01T00:00:00Z",
      revisionReason: "source_timestamps_changed",
    });
    expect(second.created).toBe(true);
    expect(second.supersededId).toBe(first.id);
    const oldRow = await db.forensicFinding.findUnique({ where: { id: first.id } });
    const newRow = await db.forensicFinding.findUnique({ where: { id: second.id } });
    expect(oldRow?.supersededById).toBe(second.id);
    expect(newRow?.findingType).toBe("timestamp_inconsistency");
    expect(newRow?.confirmationStatus).toBe("unconfirmed");
    expect(JSON.parse(newRow?.sourceEvidenceHashes ?? "[]")).toEqual([hash]);
    expect(await confirmForensicFinding({ findingId: first.id, actorId: user.id })).toEqual({
      ok: false,
      error: "superseded",
    });
  });

  it("detects a tampered payload hash and returns provenance", async () => {
    const { id, hash } = await seedEvidence();
    const first = await persistTimestampFinding({
      evidenceId: id,
      sha256: hash,
      createdRaw: "2024-01-01T00:00:00Z",
      modifiedRaw: "2024-01-01T00:00:00Z",
    });
    const provenance = await getFindingProvenance(first.id);
    expect(provenance?.integrity.intact).toBe(true);

    await db.forensicFinding.update({
      where: { id: first.id },
      data: { calculationResult: JSON.stringify({ tampered: true }) },
    });
    const after = await db.forensicFinding.findUnique({ where: { id: first.id } });
    expect(after).not.toBeNull();
    const check = verifyStoredFindingPayload(after!);
    expect(check.intact).toBe(false);
  });

  it("does not create a later-revision finding for reversed timestamps", async () => {
    const { id, hash } = await seedEvidence();
    const result = await persistTimestampFinding({
      evidenceId: id,
      sha256: hash,
      createdRaw: "2024-01-10T00:00:00Z",
      modifiedRaw: "2024-01-01T00:00:00Z",
    });
    const row = await db.forensicFinding.findUnique({ where: { id: result.id } });
    expect(row?.findingType).not.toBe("later_revision_appears_present");
  });
});
