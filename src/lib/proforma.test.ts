import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Comps, CompsFile, Lot, LotsFile } from "./types";
import {
  compsForLot,
  computeProforma,
  DEFAULT_ASSUMPTIONS,
  DEFAULT_FINANCE,
  MENTOR_SOURCES,
  NEW_CONSTRUCTION_PREMIUM,
  prototypeNote,
  runProforma,
  saleScale,
  sensitivityLine,
  validateFinance,
} from "./proforma";

function lot(overrides: Partial<Lot> = {}): Lot {
  return {
    id: "0043R00172000000",
    address: "1 Test St",
    neighborhood: "Squirrel Hill North",
    councilDistrict: "1",
    ward: "8",
    lat: 40.44,
    lon: -79.99,
    zone: "R1D-H",
    lotAreaSqFt: 6000,
    frontageFt: 40,
    landValue: 10000,
    status: "Vacant Land",
    inventoryType: "City",
    hazards: { steepSlope: false, undermined: false, floodZone: false },
    ...overrides,
  };
}

const comps = (zhvi: number | null, zori: number | null = 1500): Comps => ({
  neighborhood: "Test",
  zip: "15217",
  zhvi,
  zhviDate: "2026-08-31",
  zori,
  zoriDate: "2026-08-31",
});

describe("runProforma", () => {
  it("pencils on a cheap, big lot in a high-ZHVI neighborhood", () => {
    const r = runProforma(lot(), "single", comps(780_000))!;
    expect(r.pencils).toBe(true);
    expect(r.gap).toBe(0);
    expect(r.marginPct).toBeGreaterThanOrEqual(15);
    // 1,200 sf × $225 = $270,000 hard; 22% soft; 13% developer fee; $35,000 site work; $10,000 assessed land
    expect(r.hard).toBe(270_000);
    expect(r.totalCost).toBeCloseTo(10_000 + 35_000 + 270_000 * 1.35, 0);
    expect(r.revenue).toBeCloseTo(780_000 * (1200 / 1400), 0);
    expect(r.landSource).toBe("assessed");
  });

  it("does not pencil in a low-ZHVI neighborhood and reports the subsidy gap", () => {
    const r = runProforma(lot({ neighborhood: "Homewood North" }), "single", comps(54_000))!;
    expect(r.pencils).toBe(false);
    expect(r.gap).toBeGreaterThan(0);
    expect(r.revenue + r.gap).toBeCloseTo(r.totalCost * 1.1, 0);
  });

  it("charges site work once per project, not per dwelling", () => {
    const single = runProforma(lot(), "single", comps(300_000))!;
    const duplex = runProforma(lot(), "duplex", comps(300_000))!;
    const duplexNoSite = runProforma(lot(), "duplex", comps(300_000), { siteCostPerProject: 0 })!;
    expect(single.site).toBe(35_000);
    expect(duplex.site).toBe(35_000);
    expect(duplex.totalCost - duplexNoSite.totalCost).toBe(35_000);
    // Duplex: $10,000 land + $35,000 site + 1,900 sf × $225 = $427,500 hard, × 1.35 with soft and fee = $577,125
    expect(duplex.totalCost).toBeCloseTo(10_000 + 35_000 + 577_125, 0);
    // Soft cost and fee stay a share of hard cost only.
    expect(duplex.soft).toBeCloseTo(427_500 * 0.22, 6);
    expect(duplex.devFee).toBeCloseTo(427_500 * 0.13, 6);
  });

  it("clamps site cost to $0–$150,000 and accepts zero", () => {
    expect(validateFinance({ siteCostPerProject: 0 }).siteCostPerProject).toBe(0);
    expect(validateFinance({ siteCostPerProject: 400_000 }).siteCostPerProject).toBe(150_000);
    expect(validateFinance({ siteCostPerProject: -5 }).siteCostPerProject).toBe(0);
    expect(validateFinance({ siteCostPerProject: Number.NaN }).siteCostPerProject).toBe(35_000);
  });

  it("cites the hackathon mentors for hard cost and site cost", () => {
    const r = runProforma(lot(), "single", comps(300_000))!;
    const src = (k: string) => r.inputsUsed.find((i) => i.key === k)!.source;
    expect(src("hardCostPerSf")).toMatch(/Dennis Steigerwalt, Housing Innovation Alliance/);
    expect(src("hardCostPerSf")).toMatch(/hackathon SME channel, Sept 26, 2026/);
    expect(src("hardCostPerSf")).toContain("$200–$250/sf is a reasonable range");
    expect(src("siteCostPerProject")).toMatch(/Tom Hardy, hackathon SME/);
    expect(src("siteCostPerProject")).toMatch(/Sept 26, 2026/);
    expect(src("siteCostPerProject")).toContain("$25k–$50k");
    expect(r.inputsUsed.find((i) => i.key === "siteCostPerProject")!.display).toBe("$35,000 per project");
    // $35,000 is not the midpoint of $25k–$50k, and Hardy's range is for one unit: say what we chose.
    expect(src("siteCostPerProject")).toContain(
      "$35,000 is a chosen allowance within Tom Hardy's $25k–$50k range (single unit); applied once per project as our assumption",
    );
    expect(src("siteCostPerProject")).not.toMatch(/midpoint/);
    const hardy = MENTOR_SOURCES.find((m) => m.name.startsWith("Tom Hardy"))!;
    expect(hardy.vintage).toContain(
      "$35,000 is a chosen allowance within Tom Hardy's $25k–$50k range (single unit); applied once per project as our assumption",
    );
  });

  it("returns null when comps are missing", () => {
    expect(runProforma(lot(), "single", null)).toBeNull();
    expect(runProforma(lot(), "single", comps(null))).toBeNull();
    expect(runProforma(lot(), "duplex", comps(300_000, null), { mode: "rent" })).toBeNull();
  });

  it("capitalizes ZIP rent after opex in rent mode", () => {
    const r = runProforma(lot(), "duplex", comps(300_000, 1500), { mode: "rent" })!;
    expect(r.grossAnnualRent).toBe(1500 * 12 * 2);
    expect(r.revenue).toBeCloseTo((36_000 * 0.65) / 0.07, 0);
  });

  it("uses a land override, then assessed value, then the default", () => {
    expect(runProforma(lot(), "single", comps(300_000), { landOverride: 1 })!.land).toBe(1);
    const noLand = runProforma(lot({ landValue: null }), "single", comps(300_000))!;
    expect(noLand.land).toBe(DEFAULT_FINANCE.defaultLand);
    expect(noLand.landSource).toBe("default");
  });

  it("cites every number it used", () => {
    const r = runProforma(lot(), "single", comps(300_000))!;
    const keys = r.inputsUsed.map((i) => i.key);
    expect(keys).toEqual(expect.arrayContaining(["land", "hardCostPerSf", "softCostPct", "devFeePct", "zhvi", "saleScale", "targetMarginPct"]));
    expect(r.inputsUsed.find((i) => i.key === "zhvi")!.url).toContain("zillow.com");
  });

  it("rejects a zero cap rate instead of producing an infinite value", () => {
    const r = runProforma(lot(), "duplex", comps(300_000, 1500), { mode: "rent", capRate: 0 })!;
    expect(Number.isFinite(r.revenue)).toBe(true);
    expect(Number.isFinite(r.margin)).toBe(true);
  });

  it("uses the default typical home size when given 0 or a non-number", () => {
    const base = runProforma(lot(), "single", comps(300_000))!;
    expect(runProforma(lot(), "single", comps(300_000), { typicalHomeSf: 0 })!.revenue).toBe(base.revenue);
    expect(runProforma(lot(), "single", comps(300_000), { typicalHomeSf: NaN })!.revenue).toBe(base.revenue);
  });

  it("clamps finance inputs to their accepted ranges", () => {
    const r = runProforma(lot(), "single", comps(300_000), { hardCostPerSf: 5, softCostPct: -10, targetMarginPct: 90 })!;
    expect(r.hard).toBe(1200 * 50);
    expect(r.soft).toBe(0);
    expect(validateFinance({ capRate: 40 }).capRate).toBe(15);
    expect(validateFinance({ opexPct: 1 }).opexPct).toBe(10);
    expect(validateFinance({ devFeePct: 99 }).devFeePct).toBe(30);
    expect(validateFinance({ typicalHomeSf: 9000 }).typicalHomeSf).toBe(4000);
  });

  it("reports the break-even value at which margin equals the target", () => {
    const r = runProforma(lot(), "single", comps(300_000))!;
    // $10,000 land + $35,000 site + 1,200 sf × $225 × 1.35 = $409,500 cost; 10% target → $450,450
    expect(r.breakEvenValue).toBeCloseTo(450_450, 0);
  });

  it("clamps the sale size scale", () => {
    expect(saleScale(400, 1400)).toBe(0.6);
    expect(saleScale(3000, 1400)).toBe(1.3);
  });
});

describe("prototypeNote", () => {
  it("names the attached prototype on a lot under 25 ft", () => {
    expect(prototypeNote(lot({ frontageFt: 19.51 }), "townhome")).toBe("Prototype chosen for a 20 ft lot: attached form, 0 parking under § 914.02.A");
  });

  it("warns that a detached house is the wrong prototype on a lot under 25 ft", () => {
    expect(prototypeNote(lot({ frontageFt: 20 }), "single")).toBe(
      "Detached prototype on a 20 ft lot: side yards leave a narrow house; the attached form (0 parking under § 914.02.A) is the modeling assumption at this width (building fit not checked)",
    );
  });

  it("says nothing on wider lots, unknown frontage, or other types", () => {
    expect(prototypeNote(lot({ frontageFt: 25 }), "townhome")).toBeNull();
    expect(prototypeNote(lot({ frontageFt: null }), "single")).toBeNull();
    expect(prototypeNote(lot({ frontageFt: 20 }), "duplex")).toBeNull();
  });
});

describe("new-construction premium", () => {
  it("values the home at 1.3x the index and says so", () => {
    const base = runProforma(lot(), "single", comps(300_000))!;
    const prem = runProforma(lot(), "single", comps(300_000), { valuePremium: NEW_CONSTRUCTION_PREMIUM })!;
    expect(NEW_CONSTRUCTION_PREMIUM).toBe(1.3);
    // 1,200 sf / 1,400 sf typical = 0.857 scale; 300,000 x 0.857 = 257,143; x 1.3 = 334,286
    expect(base.revenue).toBeCloseTo(257_142.86, 1);
    expect(prem.revenue).toBeCloseTo(334_285.71, 1);
    expect(prem.totalCost).toBe(base.totalCost);
    expect(prem.revenueNote).toMatch(/× 1\.3 new-construction premium/);
  });

  it("ignores a non-positive or non-numeric premium", () => {
    const base = runProforma(lot(), "single", comps(300_000))!;
    expect(runProforma(lot(), "single", comps(300_000), { valuePremium: 0 })!.revenue).toBe(base.revenue);
    expect(runProforma(lot(), "single", comps(300_000), { valuePremium: Number.NaN })!.revenue).toBe(base.revenue);
  });

  it("shows the mentor hard-cost scenarios and the premium case in the per-lot sensitivity line", () => {
    // Worked example (docs/comps-and-proforma.md): cost $409,500, target value $450,450; at ZHVI $300k the value is $257,143.
    // $185/sf: cost 45,000 + 222,000 x 1.35 = 344,700; target 379,170 -> short $122,027.
    // $250/sf: cost 45,000 + 300,000 x 1.35 = 450,000; target 495,000 -> short $237,857.
    // $350/sf: cost 45,000 + 420,000 x 1.35 = 612,000; target 673,200 -> short $416,057.
    // 1.3x index: value 334,286 vs target 450,450 -> short $116,164.
    expect(sensitivityLine(lot(), "single", comps(300_000))).toBe(
      "Value needed for the target return $450,450; at $185/sq ft short by $122,027; at $250/sq ft short by $237,857; at $350/sq ft short by $416,057; at a new-construction premium (1.3× index) short by $116,164.",
    );
  });

  it("states by how much a clearing scenario beats the target, never a rounded margin", () => {
    // $185/sf: target value 379,170 (above); ZHVI $500k -> value 428,571 clears it by $49,401.
    const line = sensitivityLine(lot(), "single", comps(500_000));
    expect(line).toContain("at $185/sq ft clears the target by $49,401");
    expect(line).not.toMatch(/% margin/);
  });

  it("leaves the displayed rate out of the sensitivity scenarios", () => {
    const line = sensitivityLine(lot(), "single", comps(300_000), { hardCostPerSf: 250 });
    expect(line).toMatch(/at \$185\/sq ft .*; at \$225\/sq ft .*; at \$350\/sq ft /);
    expect(line).not.toMatch(/at \$250\/sq ft/);
  });
});

describe("compsForLot", () => {
  const file: CompsFile = {
    generatedAt: "",
    sources: [],
    byNeighborhood: { "Squirrel Hill North": { zhvi: 780_000, zhviDate: "2026-08-31" } },
    byZip: { "15217": { zori: 1585, zoriDate: "2026-08-31" } },
    lotZip: { "0043R00172000000": "15217" },
  };
  it("joins neighborhood ZHVI and ZIP ZORI", () => {
    expect(compsForLot(lot(), file)).toMatchObject({ zip: "15217", zhvi: 780_000, zori: 1585 });
    expect(compsForLot(lot({ id: "X", neighborhood: "Nowhere" }), file)).toMatchObject({ zip: null, zhvi: null, zori: null });
    expect(compsForLot(lot(), null)).toBeNull();
  });
});

describe("computeProforma (legacy)", () => {
  it("still returns the AMI-based result", () => {
    const r = computeProforma("single", null, DEFAULT_ASSUMPTIONS, "sale");
    expect(r.landIsAssumed).toBe(true);
    expect(r.revenue).toBe(75000 * 3.5);
    expect(r.gap).toBeCloseTo(r.revenue - r.totalCost, 6);
  });
});

const haveData = existsSync("public/data/lots.json") && existsSync("public/data/comps.json");

describe.runIf(haveData)("sensitivity line on the shipped data", () => {
  it("126 Carrington (townhouse): the premium line gives the exact amount it clears the target by", () => {
    const lots = (JSON.parse(readFileSync("public/data/lots.json", "utf8")) as LotsFile).lots;
    const file = JSON.parse(readFileSync("public/data/comps.json", "utf8")) as CompsFile;
    const carrington = lots.find((l) => l.id === "0023F00165000000")!;
    expect(sensitivityLine(carrington, "townhome", compsForLot(carrington, file))).toMatch(
      /at a new-construction premium \(1\.3× index\) clears the target by \$1,207\.$/,
    );
  });
});
