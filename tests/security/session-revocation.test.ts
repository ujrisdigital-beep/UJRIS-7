import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/evidence/[evidenceId]/file/route";
import { db } from "@/lib/db";
import { persistEvidenceWithCustody } from "@/lib/evidence-persist";
import { relativeEvidencePath, saveEvidenceFile } from "@/lib/storage";
import { sha256Buffer } from "@/lib/hash-chain";
import { resetTestDatabase } from "../helpers/db";
import { loginAs, seedCase, seedUser } from "../helpers/seed";
import { logoutAction } from "@/lib/actions/auth";
import { issueSession, revokeSession, SESSION_COOKIE } from "@/lib/auth";
import { setTestCookie } from "../helpers/next-runtime";

async function seedEvidence(userId: string, caseId: string, bytes: Buffer, fileName: string, mime: string) {
  const id = crypto.randomUUID();
  const storagePath = relativeEvidencePath(caseId, id, fileName);
  await saveEvidenceFile(storagePath, bytes);
  await persistEvidenceWithCustody({
    id,
    caseId,
    fileName,
    mimeType: mime,
    sizeBytes: bytes.length,
    storagePath,
    sha256: sha256Buffer(bytes),
    category: "document",
    claimedDate: null,
    description: null,
    forensicsJson: "{}",
    strength: 40,
    actorId: userId,
  });
  return id;
}

async function download(evidenceId: string) {
  return GET(new NextRequest(`http://127.0.0.1/api/evidence/${evidenceId}/file`), {
    params: Promise.resolve({ evidenceId }),
  });
}

describe("session issuance and revocation at the evidence route", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("logoutAction revokes the captured session so evidence GET cannot be replayed", async () => {
    const user = await seedUser();
    const kase = await seedCase(user.id);
    const id = await seedEvidence(user.id, kase.id, Buffer.from("secret-bytes"), "note.txt", "text/plain");
    await loginAs(user);

    const allowed = await download(id);
    expect(allowed.status).toBe(200);

    await expect(logoutAction()).rejects.toThrow(/REDIRECT:\//);

    const replay = await download(id);
    expect(replay.status).toBe(401);
    expect(await db.custodyEvent.count({ where: { evidenceId: id, action: "viewed" } })).toBe(1);
  });

  it("revokeSession on the jti denies evidence GET", async () => {
    const user = await seedUser();
    const kase = await seedCase(user.id);
    const id = await seedEvidence(user.id, kase.id, Buffer.from("ok"), "note.txt", "text/plain");
    const { token, jti } = await issueSession({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });
    setTestCookie(SESSION_COOKIE, token);
    expect((await download(id)).status).toBe(200);
    await revokeSession(jti);
    expect((await download(id)).status).toBe(401);
  });
});
