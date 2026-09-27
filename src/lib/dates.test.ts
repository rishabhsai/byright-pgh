import { describe, expect, it } from "vitest";
import { todayET } from "./dates";

describe("todayET", () => {
  it("is the Pittsburgh calendar date, not the UTC one, in the evening", () => {
    // 21:12 EDT on Sept 26 is already Sept 27 in UTC.
    expect(todayET(new Date("2026-09-27T01:12:00Z"))).toBe("2026-09-26");
  });

  it("rolls over at local midnight, including in winter (EST)", () => {
    expect(todayET(new Date("2026-09-27T04:00:00Z"))).toBe("2026-09-27");
    expect(todayET(new Date("2027-01-15T04:59:00Z"))).toBe("2027-01-14");
    expect(todayET(new Date("2027-01-15T05:00:00Z"))).toBe("2027-01-15");
  });
});
