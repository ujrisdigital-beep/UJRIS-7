import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/evidence/[evidenceId]/file/route";
import { db } from "@/lib/db";
import { persistEvidenceWithCustody } from "@/lib/evidence-persist";
import { relativeEvidencePath, saveEvidenceFile } from "@/lib/storage";
import { sha256Buffer } from "@/lib/hash-chain";
import { resetTestDatabase } from "../helpers/db";
import { loginAs, seedCase, seedUser } from "../helpers/seed";
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

describe("evidence file route", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("denies unauthenticated download and creates no custody event", async () => {
    const user = await seedUser();
    const kase = await seedCase(user.id);
    const id = await seedEvidence(user.id, kase.id, Buffer.from("<html><script>alert(1)</script></html>"), "x.html", "text/html");
    const res = await download(id);
    expect(res.status).toBe(401);
    expect(await db.custodyEvent.count({ where: { evidenceId: id, action: "viewed" } })).toBe(0);
  });

  it("allows the owner and never inlines HTML", async () => {
    const user = await seedUser();
    const kase = await seedCase(user.id);
    const bytes = Buffer.from("<!DOCTYPE html><html><script>alert(1)</script></html>");
    const id = await seedEvidence(user.id, kase.id, bytes, "payload.html", "text/html");
    await loginAs(user);
    const res = await download(id);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toMatch(/^attachment;/);
    expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(await db.custodyEvent.count({ where: { evidenceId: id, action: "viewed" } })).toBe(1);
  });

  it("denies a non-owner and creates no viewed custody event", async () => {
    const owner = await seedUser("owner-ev@example.com");
    const other = await seedUser("other-ev@example.com");
    const kase = await seedCase(owner.id);
    const id = await seedEvidence(owner.id, kase.id, Buffer.from("%PDF-1.4"), "a.pdf", "application/pdf");
    await loginAs(other);
    const res = await download(id);
    expect(res.status).toBe(404);
    expect(await db.custodyEvent.count({ where: { evidenceId: id, action: "viewed" } })).toBe(0);
  });

  it("denies malformed identifiers safely", async () => {
    const user = await seedUser();
    await loginAs(user);
    const res = await download("../etc/passwd");
    expect(res.status).toBe(404);
  });

  it("denies a revoked session", async () => {
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
    await revokeSession(jti);
    const res = await download(id);
    expect(res.status).toBe(401);
    expect(await db.custodyEvent.count({ where: { evidenceId: id, action: "viewed" } })).toBe(0);
  });

  it("does not bypass ownership under parallel requests", async () => {
    const owner = await seedUser("p-owner@example.com");
    const other = await seedUser("p-other@example.com");
    const kase = await seedCase(owner.id);
    const id = await seedEvidence(owner.id, kase.id, Buffer.from("secret"), "s.txt", "text/plain");
    await loginAs(other);
    const results = await Promise.all([download(id), download(id), download(id)]);
    expect(results.every((r) => r.status === 404)).toBe(true);
    expect(await db.custodyEvent.count({ where: { evidenceId: id, action: "viewed" } })).toBe(0);
  });
});
