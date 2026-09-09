import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { refreshCaseIntelligenceForOwner } from "@/lib/cases/refresh-intelligence";
import { resetTestDatabase } from "../helpers/db";

describe("refreshCaseIntelligence ownership", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("User A cannot refresh User B's case", async () => {
    const userA = await db.user.create({
      data: {
        email: "a@example.com",
        name: "A",
        passwordHash: await hashPassword("password12"),
      },
    });
    const userB = await db.user.create({
      data: {
        email: "b@example.com",
        name: "B",
        passwordHash: await hashPassword("password12"),
      },
    });
    const caseB = await db.case.create({
      data: {
        userId: userB.id,
        title: "B's case",
        situation: "dismissal",
        narrative: "User B was dismissed after a grievance about discrimination.",
        readiness: 10,
        urgency: "low",
      },
    });

    const result = await refreshCaseIntelligenceForOwner(userA.id, caseB.id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("forbidden");

    const unchanged = await db.case.findUnique({ where: { id: caseB.id } });
    expect(unchanged?.readiness).toBe(10);
    expect(unchanged?.urgency).toBe("low");
  });

  it("the owner can refresh their own case", async () => {
    const user = await db.user.create({
      data: {
        email: "owner@example.com",
        name: "Owner",
        passwordHash: await hashPassword("password12"),
      },
    });
    const kase = await db.case.create({
      data: {
        userId: user.id,
        title: "Own case",
        situation: "dismissal",
        narrative: "I was dismissed after raising a complaint about discrimination.",
        readiness: 10,
      },
    });
    const result = await refreshCaseIntelligenceForOwner(user.id, kase.id);
    expect(result.ok).toBe(true);
  });
});
