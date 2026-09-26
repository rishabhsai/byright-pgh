import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Comps, CompsFile, Finding, Lot, LotsFile, Typology, Verdict } from "./types";
import { evaluateLot } from "./rules";
import { triageCounts, triageLot } from "./triage";

function lot(overrides: Partial<Lot> = {}): Lot {
  return {
    id: "0043R00172000000",
    address: "1 Test St",
    neighborhood: "Test",
    councilDistrict: "1",
    lat: 40.44,
    lon: -79.99,
    zone: "R1D-H",
    lotAreaSqFt: 3000,
    frontageFt: 25,
    landValue: 1000,
    status: "Vacant Land",
    inventoryType: "City",
    hazards: { steepSlope: false, undermined: false, floodZone: false },
    ...overrides,
  };
}

const comps = (zhvi: number | null): Comps => ({
  neighborhood: "Test",
  zip: "15217",
  zhvi,
  zhviDate: "2026-08-31",
  zori: 1500,
  zoriDate: "2026-08-31",
});
const RICH = comps(780_000);
const POOR = comps(60_000);

const TYPES: Typology[] = ["single", "single_adu", "duplex", "triplex", "townhome"];
const findingsAll = (v: Verdict): Finding[] => TYPES.map((typology) => ({ typology, verdict: v, checks: [], summary: `${v}` }));

describe("triageLot", () => {
  it("green: by right, no hazards, pencils", () => {
    const l = lot();
    const t = triageLot(l, evaluateLot(l, "current"), RICH);
    expect(t.triage).toBe("green");
    expect(t.pencils).toBe(true);
    expect(t.gap).toBe(0);
    expect(t.bestTypology).not.toBeNull();
  });

  it("yellow, not green, when comps are unavailable: finance not assessed", () => {
    const l = lot();
    const t = triageLot(l, evaluateLot(l, "current"), null);
    expect(t.triage).toBe("yellow");
    expect(t.pencils).toBeNull();
    expect(t.reasons.join(" ")).toContain("comps unavailable; finance not assessed");
  });

  it("yellow: by right but needs subsidy", () => {
    const l = lot();
    const t = triageLot(l, evaluateLot(l, "current"), POOR);
    expect(t.triage).toBe("yellow");
    expect(t.pencils).toBe(false);
    expect(t.gap).toBeGreaterThan(0);
  });

  it("yellow: hazard flag", () => {
    const l = lot({ hazards: { steepSlope: true, undermined: false, floodZone: false } });
    const t = triageLot(l, evaluateLot(l, "current"), RICH);
    expect(t.triage).toBe("yellow");
    expect(t.reasons.join(" ")).toContain("steep slope");
  });

  it("yellow: only a variance is available", () => {
    const t = triageLot(lot(), findingsAll("variance"), RICH);
    expect(t.triage).toBe("yellow");
    expect(t.reasons[0]).toContain("variance");
  });

  it("falls back to sale comps when the ZIP has no rent comp", () => {
    const l = lot();
    const t = triageLot(l, evaluateLot(l, "current"), { ...POOR, zori: null }, { mode: "rent" });
    expect(t.triage).toBe("yellow");
    expect(t.reasons.join(" ")).toContain("sale comps were used");
  });

  it("red: no typology permitted", () => {
    const t = triageLot(lot({ zone: "XX" }), findingsAll("prohibited"), RICH);
    expect(t.triage).toBe("red");
    expect(t.bestTypology).toBeNull();
    expect(t.reasons[0]).toMatch(/^Zoning/);
  });

  it("red: flood zone on steep or undermined ground", () => {
    const l = lot({ hazards: { steepSlope: false, undermined: true, floodZone: true } });
    const t = triageLot(l, evaluateLot(l, "current"), RICH);
    expect(t.triage).toBe("red");
    expect(t.reasons[0]).toContain("flood zone");
  });

  it("gray: district not encoded", () => {
    const l = lot({ zone: "GI" });
    const t = triageLot(l, evaluateLot(l, "current"), RICH);
    expect(t.triage).toBe("gray");
    expect(t.pencils).toBeNull();
  });

  it("picks the best-verdict typology with the highest margin", () => {
    const f: Finding[] = [
      { typology: "single", verdict: "by-right", checks: [], summary: "" },
      { typology: "single_adu", verdict: "by-right", checks: [], summary: "" },
      { typology: "triplex", verdict: "variance", checks: [], summary: "" },
    ];
    // single_adu sells 1,800 sf at a 1.29 scale; its margin beats a 1,200 sf single in a rich market
    expect(triageLot(lot(), f, RICH).bestTypology).toBe("single_adu");
  });
});

describe("triageCounts", () => {
  it("counts every lot once", () => {
    const lots = [lot(), lot({ zone: "GI" }), lot({ hazards: { steepSlope: true, undermined: false, floodZone: true } })];
    const file: CompsFile = { generatedAt: "", sources: [], byNeighborhood: { Test: { zhvi: 780_000, zhviDate: "2026-08-31" } }, byZip: {}, lotZip: {} };
    expect(triageCounts(lots, "current", file)).toEqual({ green: 1, yellow: 0, red: 1, gray: 1 });
  });

  const LOTS = "public/data/lots.json";
  const COMPS = "public/data/comps.json";
  it.runIf(existsSync(LOTS) && existsSync(COMPS) && process.env.TRIAGE_REPORT)("prints inventory counts", () => {
    const lots = (JSON.parse(readFileSync(LOTS, "utf8")) as LotsFile).lots;
    const file = JSON.parse(readFileSync(COMPS, "utf8")) as CompsFile;
    const out = {
      current: triageCounts(lots, "current", file),
      "bill-2025-1545": triageCounts(lots, "bill-2025-1545", file),
      "current (rent)": triageCounts(lots, "current", file, { mode: "rent" }),
      "current (no comps)": triageCounts(lots, "current", null),
    };
    process.stdout.write(`\nTRIAGE ${JSON.stringify(out, null, 1)}\n`);
  });
});
