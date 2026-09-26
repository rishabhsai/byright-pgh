import { describe, expect, it } from "vitest";
import { matchRank } from "./NeighborhoodPicker";

describe("matchRank", () => {
  it("ranks name prefix over word prefix over substring over subsequence", () => {
    expect(matchRank("Homewood North", "home")).toBe(0);
    expect(matchRank("East Hills", "hill")).toBe(1);
    expect(matchRank("Perry North", "rry")).toBe(2);
    expect(matchRank("Homewood South", "hmwd")).toBe(3);
    expect(matchRank("Larimer", "home")).toBe(-1);
  });
  it("matches everything on an empty query", () => {
    expect(matchRank("Larimer", "  ")).toBe(0);
  });
});
