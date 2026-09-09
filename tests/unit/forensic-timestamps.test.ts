import { describe, expect, it } from "vitest";
import { evaluateTimestampAnomaly } from "@/lib/forensics/timestamps";

describe("forensic timestamp rule F-TS-001", () => {
  it("created < modified (more than 24h) yields later_revision_appears_present", () => {
    const result = evaluateTimestampAnomaly("2024-01-01T00:00:00Z", "2024-01-05T00:00:00Z");
    expect(result.findingType).toBe("later_revision_appears_present");
    expect(result.title?.toLowerCase()).toContain("later revision");
    expect(JSON.stringify(result).toLowerCase()).not.toMatch(/forged|fabricated|fraudulent|tampered/);
  });

  it("created = modified yields no finding", () => {
    const ts = "2024-06-01T12:00:00Z";
    const result = evaluateTimestampAnomaly(ts, ts);
    expect(result.findingType).toBeNull();
    expect(result.relation).toBe("equivalent");
  });

  it("created > modified does not emit a 'later' finding", () => {
    const result = evaluateTimestampAnomaly("2024-01-10T00:00:00Z", "2024-01-01T00:00:00Z");
    expect(result.findingType).not.toBe("later_revision_appears_present");
    expect(result.findingType).toBe("timestamp_inconsistency");
    expect(result.title?.toLowerCase()).not.toContain("later revision");
    expect(JSON.stringify(result).toLowerCase()).not.toMatch(/forged|fabricated|fraudulent|tampered/);
  });

  it("missing created yields no finding", () => {
    const result = evaluateTimestampAnomaly(null, "2024-01-01T00:00:00Z");
    expect(result.findingType).toBeNull();
    expect(result.relation).toBe("missing_created");
  });

  it("missing modified yields no finding", () => {
    const result = evaluateTimestampAnomaly("2024-01-01T00:00:00Z", null);
    expect(result.findingType).toBeNull();
    expect(result.relation).toBe("missing_modified");
  });

  it("invalid timestamp yields no finding", () => {
    const result = evaluateTimestampAnomaly("not-a-date", "also-bad");
    expect(result.relation).toBe("invalid");
    expect(result.findingType).toBeNull();
  });

  it("timezone offset difference of equivalent instants yields no finding", () => {
    const result = evaluateTimestampAnomaly("2024-01-01T00:00:00Z", "2023-12-31T19:00:00-05:00");
    expect(result.findingType).toBeNull();
    expect(["equivalent", "equal"]).toContain(result.relation);
  });

  it("small gaps under 24 hours do not trigger later_revision", () => {
    const result = evaluateTimestampAnomaly("2024-01-01T00:00:00Z", "2024-01-01T10:00:00Z");
    expect(result.findingType).toBeNull();
  });
});
