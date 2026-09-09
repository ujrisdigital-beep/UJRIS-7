import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { persistEvidenceWithCustody, persistEvidenceWithCustodyInTx } from "@/lib/evidence-persist";
import { saveEvidenceFile, relativeEvidencePath } from "@/lib/storage";
import { verifyEvidenceIntegrity } from "@/lib/evidence-integrity";
import { sha256Buffer } from "@/lib/hash-chain";
import { resetTestDatabase } from "../helpers/db";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { getEvidenceStorageRoot } from "@/lib/storage";

async function seedCase() {
  const user = await db.user.create({
    data: {
      email: `owner-${crypto.randomUUID()}@example.com`,
      name: "Owner",
      passwordHash: await hashPassword("password12"),
    },
  });
  const kase = await db.case.create({
    data: {
      userId: user.id,
      title: "Test case",
      situation: "dismissal",
      narrative: "I was dismissed after raising a complaint about discrimination at work last month.",
    },
  });
  return { user, kase };
}

describe("evidence + custody atomicity", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("creates evidence and custody together", async () => {
    const { user, kase } = await seedCase();
    const id = crypto.randomUUID();
    const bytes = Buffer.from("hello evidence");
    const storagePath = relativeEvidencePath(kase.id, id, "note.txt");
    await saveEvidenceFile(storagePath, bytes);

    await persistEvidenceWithCustody({
      id,
      caseId: kase.id,
      fileName: "note.txt",
      mimeType: "text/plain",
      sizeBytes: bytes.length,
      storagePath,
      sha256: sha256Buffer(bytes),
      category: "document",
      claimedDate: null,
      description: null,
      forensicsJson: "{}",
      strength: 40,
      actorId: user.id,
    });

    const evidence = await db.evidence.findUnique({ where: { id }, include: { custody: true } });
    expect(evidence).not.toBeNull();
    expect(evidence?.caseId).toBe(kase.id);
    expect(evidence?.custody.length).toBe(1);
    expect(evidence?.custody[0]?.action).toBe("uploaded");
  });

  it("rolls back evidence if a later write in the same transaction fails", async () => {
    const { user, kase } = await seedCase();
    const id = crypto.randomUUID();
    const bytes = Buffer.from("partial");
    const storagePath = relativeEvidencePath(kase.id, id, "note.txt");
    await saveEvidenceFile(storagePath, bytes);
    const input = {
      id,
      caseId: kase.id,
      fileName: "note.txt",
      mimeType: "text/plain",
      sizeBytes: bytes.length,
      storagePath,
      sha256: sha256Buffer(bytes),
      category: "document",
      claimedDate: null,
      description: null,
      forensicsJson: "{}",
      strength: 40,
      actorId: user.id,
    };

    await expect(
      db.$transaction(async (tx) => {
        await persistEvidenceWithCustodyInTx(tx, input);
        throw new Error("forced custody failure");
      })
    ).rejects.toThrow("forced custody failure");

    expect(await db.evidence.findUnique({ where: { id } })).toBeNull();
    expect(await db.custodyEvent.count({ where: { evidenceId: id } })).toBe(0);
  });

  it("duplicate primary key retry does not create orphan custody", async () => {
    const { user, kase } = await seedCase();
    const id = crypto.randomUUID();
    const bytes = Buffer.from("once");
    const storagePath = relativeEvidencePath(kase.id, id, "note.txt");
    await saveEvidenceFile(storagePath, bytes);
    const input = {
      id,
      caseId: kase.id,
      fileName: "note.txt",
      mimeType: "text/plain",
      sizeBytes: bytes.length,
      storagePath,
      sha256: sha256Buffer(bytes),
      category: "document",
      claimedDate: null,
      description: null,
      forensicsJson: "{}",
      strength: 40,
      actorId: user.id,
    };
    await persistEvidenceWithCustody(input);
    await expect(persistEvidenceWithCustody(input)).rejects.toThrow();
    const evidence = await db.evidence.findUnique({ where: { id }, include: { custody: true } });
    expect(evidence?.custody.length).toBe(1);
  });
});

describe("hash integrity verification", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("verifies unchanged bytes and never mutates the stored hash", async () => {
    const { user, kase } = await seedCase();
    const id = crypto.randomUUID();
    const bytes = Buffer.from("immutable original");
    const hash = sha256Buffer(bytes);
    const storagePath = relativeEvidencePath(kase.id, id, "orig.txt");
    await saveEvidenceFile(storagePath, bytes);
    await persistEvidenceWithCustody({
      id,
      caseId: kase.id,
      fileName: "orig.txt",
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

    const result = await verifyEvidenceIntegrity({ storagePath, storedSha256: hash });
    expect(result.status).toBe("verified");
    const stored = await db.evidence.findUnique({ where: { id } });
    expect(stored?.sha256).toBe(hash);
  });

  it("returns mismatch if a byte changes on disk", async () => {
    const { kase } = await seedCase();
    const id = crypto.randomUUID();
    const original = Buffer.from("abc");
    const hash = sha256Buffer(original);
    const storagePath = relativeEvidencePath(kase.id, id, "x.txt");
    await saveEvidenceFile(storagePath, original);
    const full = path.join(getEvidenceStorageRoot(), storagePath);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, Buffer.from("abd"));
    const result = await verifyEvidenceIntegrity({ storagePath, storedSha256: hash });
    expect(result.status).toBe("mismatch");
    expect(result.computedSha256).not.toBe(hash);
  });

  it("returns unavailable when the file is missing", async () => {
    const result = await verifyEvidenceIntegrity({
      storagePath: "missing/missing-file.txt",
      storedSha256: "abc",
    });
    expect(result.status).toBe("unavailable");
  });
});
