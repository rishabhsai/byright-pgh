import { describe, expect, it } from "vitest";
import { scenarioCsv, scenarioSummary } from "./reformExport";
import { decodeParams, encodeParams, TODAY_PARAMS, type LeverResult } from "./engine";

const row = (id: string, a: number, n: number): LeverResult => ({
  presetId: id,
  label: id === "today" ? "Today" : "Lot, small",
  publicLotsAllowed: a,
  publicLotsNewlyAllowed: n,
  publicLotsNoLongerAllowed: 0,
  parkingUnresolved: 0,
  typologyDelta: { single: 0, single_adu: 0, duplex: 0, triplex: 0, townhome: 0 },
  candidates: 10,
  candidatesNewly: 2,
  clearingCostScreen: 0,
  byNeighborhood: [
    { name: "Larimer", allowed: a - 1, newlyAllowed: n },
    { name: "Hazelwood", allowed: 1, newlyAllowed: 0 },
  ],
  byDistrictFamily: [],
});

describe("reform exports", () => {
  it("writes every neighborhood and a citywide total from per-lot screens, quoting labels with commas", () => {
    const lots = [{ neighborhood: "Larimer" }, { neighborhood: "Larimer" }, { neighborhood: "Hazelwood" }];
    const base = [true, false, false];
    const csv = scenarioCsv(lots, [{ label: "Today", allowed: base }, { label: "Lot, small", allowed: [true, true, false] }], base).trim().split("\n");
    expect(csv[0]).toBe('neighborhood,Today: allowed,Today: +vs today,"Lot, small: allowed","Lot, small: +vs today"');
    expect(csv[1]).toBe("Hazelwood,0,0,0,0");
    expect(csv[2]).toBe("Larimer,1,0,2,1");
    expect(csv[3]).toBe("Citywide,1,0,2,1");
  });

  it("summarizes counts with signed deltas", () => {
    const s = scenarioSummary(row("x", 150, 50), TODAY_PARAMS, 11338, 225, "https://x");
    expect(s).toContain("150 of 11,338 City lots");
    expect(s).toContain("(+50 vs today)");
    expect(s).toContain("Larimer +50");
  });

  it("round-trips custom params through the URL codec and rejects junk", () => {
    const p = { ...TODAY_PARAMS, minLotArea: { ...TODAY_PARAMS.minLotArea, L: 1800 } };
    expect(decodeParams(encodeParams(p))).toEqual(p);
    expect(decodeParams("not-base64!")).toBeNull();
    expect(decodeParams(btoa(JSON.stringify({ minLotArea: { VL: -1 } })))).toBeNull();
  });
});
