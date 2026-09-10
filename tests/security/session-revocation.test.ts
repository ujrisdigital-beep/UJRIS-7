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
import { issueSession, SESSION_COOKIE } from "@/lib/auth";
import { getTestCookie, setTestCookie } from "../helpers/next-runtime";

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

  it("replays the exact captured pre-logout cookie against evidence GET and is denied", async () => {
    const user = await seedUser();
    const kase = await seedCase(user.id);
    const id = await seedEvidence(user.id, kase.id, Buffer.from("secret-bytes"), "note.txt", "text/plain");
    const token = await loginAs(user);
    const captured = getTestCookie(SESSION_COOKIE);
    expect(captured).toBe(token);

    expect((await download(id)).status).toBe(200);

    await expect(logoutAction()).rejects.toThrow(/REDIRECT:\//);
    expect(getTestCookie(SESSION_COOKIE)).toBeUndefined();

    setTestCookie(SESSION_COOKIE, captured as string);
    const replay = await download(id);
    expect(replay.status).toBe(401);
    expect(await db.custodyEvent.count({ where: { evidenceId: id, action: "viewed" } })).toBe(1);
  });

  it("logging out session B does not revoke session A", async () => {
    const user = await seedUser();
    const kase = await seedCase(user.id);
    const id = await seedEvidence(user.id, kase.id, Buffer.from("ok"), "note.txt", "text/plain");

    const sessionA = await issueSession({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });
    setTestCookie(SESSION_COOKIE, sessionA.token);
    expect((await download(id)).status).toBe(200);

    const sessionB = await issueSession({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });
    setTestCookie(SESSION_COOKIE, sessionB.token);
    expect((await download(id)).status).toBe(200);

    await expect(logoutAction()).rejects.toThrow(/REDIRECT:\//);

    setTestCookie(SESSION_COOKIE, sessionB.token);
    expect((await download(id)).status).toBe(401);

    setTestCookie(SESSION_COOKIE, sessionA.token);
    expect((await download(id)).status).toBe(200);
  });
});
