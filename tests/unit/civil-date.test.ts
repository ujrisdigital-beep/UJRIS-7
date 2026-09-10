import { describe, expect, it } from "vitest";
import {
  addCivilDays,
  addCivilMonths,
  civilFromUtcDate,
  eraEqaPrimaryDueCivil,
  eraEqaPrimaryDueCivilKey,
  formatCivilDate,
  parseCivilDate,
  utcDateFromCivil,
} from "@/lib/legal/civil-date";
import { calculatePrimaryLimitationDate } from "@/lib/legal/deadlines";

describe("pure civil-date arithmetic", () => {
  it("adds calendar months with month-end clamp", () => {
    expect(formatCivilDate(addCivilMonths(parseCivilDate("2026-01-31")!, 3))).toBe("2026-04-30");
    expect(formatCivilDate(addCivilMonths(parseCivilDate("2026-11-30")!, 3))).toBe("2027-02-28");
    expect(formatCivilDate(addCivilMonths(parseCivilDate("2024-02-29")!, 12))).toBe("2025-02-28");
  });

  it("computes ERA/EQA 3 months less 1 day on the civil calendar", () => {
    expect(eraEqaPrimaryDueCivilKey("2026-01-31")).toBe("2026-04-29");
    expect(eraEqaPrimaryDueCivilKey("2026-03-12")).toBe("2026-06-11");
    expect(eraEqaPrimaryDueCivilKey("2024-02-29")).toBe("2024-05-28");
    expect(eraEqaPrimaryDueCivilKey("2026-11-30")).toBe("2027-02-27");
    expect(eraEqaPrimaryDueCivilKey("2026-03-31")).toBe("2026-06-29");
    expect(formatCivilDate(eraEqaPrimaryDueCivil(parseCivilDate("2026-02-28")!))).toBe("2026-05-27");
  });

  it("does not use 24-hour millisecond subtraction for civil day math", () => {
    const start = parseCivilDate("2026-03-28")!;
    expect(formatCivilDate(addCivilDays(start, -1))).toBe("2026-03-27");
    expect(formatCivilDate(addCivilDays(start, 1))).toBe("2026-03-29");
    expect(formatCivilDate(addCivilDays(parseCivilDate("2026-03-01")!, -1))).toBe("2026-02-28");
    expect(formatCivilDate(addCivilDays(parseCivilDate("2024-03-01")!, -1))).toBe("2024-02-29");
  });

  it("treats Date I/O as a UTC Y-M-D carrier only", () => {
    const date = utcDateFromCivil(parseCivilDate("2026-03-12")!);
    expect(date.toISOString()).toBe("2026-03-12T00:00:00.000Z");
    expect(formatCivilDate(civilFromUtcDate(date))).toBe("2026-03-12");
  });

  it("keeps calculatePrimaryLimitationDate on the civil calendar", () => {
    const due = calculatePrimaryLimitationDate(new Date("2026-03-12T00:00:00.000Z"));
    expect(due.dueDate.toISOString().slice(0, 10)).toBe("2026-06-11");
  });
});
