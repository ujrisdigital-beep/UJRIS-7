import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { hashPassword, issueSession, revokeSession, verifySessionToken } from "@/lib/auth";
import { resetTestDatabase } from "../helpers/db";

async function seedUser() {
  return db.user.create({
    data: {
      email: "claimant@example.com",
      name: "Test Claimant",
      passwordHash: await hashPassword("password12"),
      plan: "free",
    },
  });
}

describe("session issuance and revocation", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("login issues a session that authorises, logout revokes replay", async () => {
    const user = await seedUser();
    const { token, jti } = await issueSession({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    const first = await verifySessionToken(token);
    expect(first?.userId).toBe(user.id);
    expect(first?.jti).toBe(jti);

    await revokeSession(jti);

    const replay = await verifySessionToken(token);
    expect(replay).toBeNull();
  });

  it("rejects malformed tokens", async () => {
    expect(await verifySessionToken("not-a-jwt")).toBeNull();
    expect(await verifySessionToken("")).toBeNull();
  });

  it("rejects expired tokens", async () => {
    const user = await seedUser();
    const { token, jti } = await issueSession({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });
    await db.authSession.update({
      where: { id: jti },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await verifySessionToken(token)).toBeNull();
  });
});
