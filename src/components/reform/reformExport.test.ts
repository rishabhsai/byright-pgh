import { describe, expect, it } from "vitest";
import { changeText, leverChanges, scenarioCsv, scenarioSummary } from "./reformExport";
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

const o = (allowed: boolean, candidate = false) => ({ allowed, candidate });
const meta = { presetId: "custom", params: TODAY_PARAMS, generatedAt: new Date("2026-09-27T10:05:00Z") };

describe("reform exports", () => {
  it("writes gained, lost and net per neighborhood and citywide, with scenario metadata on every row", () => {
    const lots = [{ neighborhood: "Larimer" }, { neighborhood: "Larimer" }, { neighborhood: "Hazelwood" }];
    const base = [o(true, true), o(false), o(true)];
    const csv = scenarioCsv(lots, [{ label: "Lot, small", lots: [o(true), o(true, true), o(false)] }], base, meta).trim().split("\n");
    expect(csv[0]).toBe(
      'neighborhood,"Lot, small: allowed","Lot, small: lots_gained","Lot, small: lots_lost","Lot, small: lots_net","Lot, small: candidates","Lot, small: candidates_gained","Lot, small: candidates_lost","Lot, small: candidates_net",scenario_preset_id,scenario_params,generated_at_et,hypothetical',
    );
    const tail = csv[1].split(",").slice(-2);
    expect(tail).toEqual(["2026-09-27 06:05 ET", "true"]);
    expect(csv[1].startsWith("Hazelwood,0,0,1,-1,0,0,0,0,custom,")).toBe(true);
    expect(csv[2].startsWith("Larimer,2,1,0,1,1,1,1,0,custom,")).toBe(true);
    expect(csv[3].startsWith("Citywide,2,1,1,0,1,1,1,0,custom,")).toBe(true);
  });

  it("reports gains, losses and net, never gains as net", () => {
    const r = { ...row("custom", 3639, 587), publicLotsNoLongerAllowed: 589, candidates: 980, candidatesNewly: 175 };
    const ch = leverChanges(r, { allowed: 3641, candidates: 1038 });
    expect(changeText(ch.lots)).toBe("587 gained · 589 lost · net −2");
    expect(changeText(ch.candidates)).toBe("175 gained · 233 lost · net −58");
  });

  it("summarizes counts with gained, lost and net, home types and parking", () => {
    const s = scenarioSummary(row("x", 150, 50), TODAY_PARAMS, 11338, 225, "https://x", { allowed: 100, candidates: 8, parkingUnresolved: 3 }, { single_adu: "House + backyard unit" });
    expect(s).toContain("150 of 11,338 City lots");
    expect(s).toContain("(50 gained · 0 lost · net +50 vs today's 100)");
    expect(s).toContain("Larimer +50");
    expect(s).toContain("Parking to verify: 3 → 0.");
    expect(s).toContain("Home-type options: no change.");
  });

  it("round-trips custom params through the URL codec and rejects junk", () => {
    const p = { ...TODAY_PARAMS, minLotArea: { ...TODAY_PARAMS.minLotArea, L: 1800 } };
    expect(decodeParams(encodeParams(p))).toEqual(p);
    expect(decodeParams("not-base64!")).toBeNull();
    expect(decodeParams(btoa(JSON.stringify({ minLotArea: { VL: -1 } })))).toBeNull();
  });
});
