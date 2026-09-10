import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetTestDatabase } from "../helpers/db";
import { loginAs, seedCase, seedUser } from "../helpers/seed";
import { refreshCaseIntelligence } from "@/lib/actions/cases";
import { uploadEvidenceAction } from "@/lib/actions/evidence";

describe("server-action ownership boundary", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("User B calling refreshCaseIntelligence cannot mutate User A's case", async () => {
    const userA = await seedUser("a-owner@example.com");
    const userB = await seedUser("b-intruder@example.com");
    const caseA = await seedCase(userA.id);
    await db.case.update({ where: { id: caseA.id }, data: { readiness: 10, urgency: "low" } });

    await loginAs(userB);
    await refreshCaseIntelligence(caseA.id);

    const unchanged = await db.case.findUnique({ where: { id: caseA.id } });
    expect(unchanged?.readiness).toBe(10);
    expect(unchanged?.urgency).toBe("low");
  });

  it("User B cannot upload evidence into User A's case via the server action", async () => {
    const userA = await seedUser("a-ev@example.com");
    const userB = await seedUser("b-ev@example.com");
    const caseA = await seedCase(userA.id);
    await loginAs(userB);

    const form = new FormData();
    form.set("caseId", caseA.id);
    form.set("category", "document");
    form.set("file", new File([Buffer.from("stolen")], "note.txt", { type: "text/plain" }));

    const result = await uploadEvidenceAction(undefined, form);
    expect(result.ok).toBe(false);
    expect(await db.evidence.count({ where: { caseId: caseA.id } })).toBe(0);
  });
});
