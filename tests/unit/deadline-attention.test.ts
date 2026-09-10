import { describe, expect, it } from "vitest";
import { addDays } from "date-fns";
import { extractDates } from "@/lib/ai/heuristics";
import { inferLimitationStart } from "@/lib/legal/date-inference";
import {
  computeCaseUrgencyFromDeadlines,
  legalClockStatus,
  mostImportantUnresolvedDeadline,
  proceduralUrgency,
} from "@/lib/legal/deadline-state";
import { generateCaseAnalysis } from "@/lib/ai/gateway";
import { urgencyFromDays, daysUntil } from "@/lib/legal/deadlines";

describe("procedural urgency vs limitation clock", () => {
  it("an imminent hearing is not a limitation start", () => {
    const dates = extractDates("My Employment Tribunal hearing is tomorrow, 11 April 2026.");
    const inference = inferLimitationStart(dates);
    expect(dates[0]?.eventType).toBe("hearing");
    expect(inference.status).not.toBe("confirmed");
    expect(inference.status).toBe("insufficient_data");
    expect(inference.selected_date).toBeNull();
    expect(inference.warning_date).toBeNull();
  });

  it("an imminent hearing remains procedurally urgent", async () => {
    const { format } = await import("date-fns");
    const when = format(addDays(new Date(), 1), "d MMMM yyyy");
    const analysis = await generateCaseAnalysis({
      situation: "hearing",
      narrative: `My Employment Tribunal hearing is listed for ${when}. I need to prepare my bundle.`,
      evidenceCount: 0,
    });
    const hearing = analysis.deadlines.find((d) => d.clockKind === "procedural_attention");
    expect(hearing).toBeDefined();
    expect(hearing?.sourceEventType).toBe("hearing");
    expect(hearing?.ruleId).not.toBe("ERA_EQA_3M_LESS_1D");
    const fromHearing = urgencyFromDays(daysUntil(hearing!.dueDate));
    expect(["high", "critical"]).toContain(fromHearing);
    expect(["high", "critical"]).toContain(analysis.urgency);
  });

  it("aggregates the highest unresolved risk across clock kinds", () => {
    const rows = [
      { dueDate: addDays(new Date(), 40), resolutionStatus: "unresolved", clockKind: "legal_limitation" as const },
      { dueDate: addDays(new Date(), 1), resolutionStatus: "unresolved", clockKind: "procedural_attention" as const },
    ];
    expect(legalClockStatus(rows)).toBe("standard");
    expect(proceduralUrgency(rows)).toBe("critical");
    expect(computeCaseUrgencyFromDeadlines(rows)).toBe("critical");
  });

  it("a hearing-only case has no limitation start but keeps procedural urgency", () => {
    const rows = [
      { dueDate: addDays(new Date(), 1), resolutionStatus: "unresolved", clockKind: "procedural_attention" as const },
    ];
    expect(legalClockStatus(rows)).toBe("none");
    expect(proceduralUrgency(rows)).toBe("critical");
    expect(computeCaseUrgencyFromDeadlines(rows)).toBe("critical");
  });

  it("acknowledgement does not remove an unresolved deadline from attention", () => {
    const hearing = {
      id: "h1",
      dueDate: addDays(new Date(), 1),
      resolutionStatus: "unresolved",
      acknowledged: true,
      label: "Hearing",
    };
    const shown = mostImportantUnresolvedDeadline([hearing]);
    expect(shown?.id).toBe("h1");
  });

  it("resolved deadlines may leave the active view", () => {
    const shown = mostImportantUnresolvedDeadline([
      { id: "r", dueDate: addDays(new Date(), 1), resolutionStatus: "resolved" },
    ]);
    expect(shown).toBeNull();
  });

  it("selects the highest material unresolved item among several", () => {
    const shown = mostImportantUnresolvedDeadline([
      { id: "later", dueDate: addDays(new Date(), 40), resolutionStatus: "unresolved" },
      { id: "soon", dueDate: addDays(new Date(), 1), resolutionStatus: "unresolved" },
    ]);
    expect(shown?.id).toBe("soon");
  });
});
