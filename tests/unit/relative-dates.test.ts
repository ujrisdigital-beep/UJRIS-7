import { afterEach, describe, expect, it } from "vitest";
import { extractDates } from "@/lib/ai/heuristics";
import { freezeTime, unfreezeTime } from "@/lib/clock";
import { utcCivilKey } from "@/lib/legal/deadline-confirmation";

describe("relative date resolution against an injectable clock", () => {
  afterEach(() => {
    unfreezeTime();
  });

  it("resolves tomorrow against a frozen Europe/London reference", () => {
    freezeTime("2026-09-10T12:00:00+01:00");
    const dates = extractDates("My hearing is tomorrow.");
    expect(dates).toHaveLength(1);
    expect(dates[0]?.eventType).toBe("hearing");
    expect(dates[0]?.date).not.toBeNull();
    expect(utcCivilKey(dates[0]!.date!)).toBe("2026-09-11");
  });

  it("resolves today, yesterday, in 2 days, and next Monday", () => {
    freezeTime("2026-09-10T12:00:00+01:00");
    expect(utcCivilKey(extractDates("The hearing is today.")[0]!.date!)).toBe("2026-09-10");
    expect(utcCivilKey(extractDates("The hearing was yesterday.")[0]!.date!)).toBe("2026-09-09");
    expect(utcCivilKey(extractDates("The hearing is in 2 days.")[0]!.date!)).toBe("2026-09-12");
    expect(utcCivilKey(extractDates("The hearing is next Monday.")[0]!.date!)).toBe("2026-09-14");
  });
});
