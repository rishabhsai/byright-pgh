import { describe, expect, it } from "vitest";
import type { Comps, CompsFile, Lot } from "./types";
import {
  compsForLot,
  computeProforma,
  DEFAULT_ASSUMPTIONS,
  DEFAULT_FINANCE,
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
    // 1,200 sf × $185 = $222,000 hard; 22% soft; 13% developer fee; $10,000 assessed land
    expect(r.hard).toBe(222_000);
    expect(r.totalCost).toBeCloseTo(10_000 + 222_000 * 1.35, 0);
    expect(r.revenue).toBeCloseTo(780_000 * (1200 / 1400), 0);
    expect(r.landSource).toBe("assessed");
  });

  it("does not pencil in a low-ZHVI neighborhood and reports the subsidy gap", () => {
    const r = runProforma(lot({ neighborhood: "Homewood North" }), "single", comps(54_000))!;
    expect(r.pencils).toBe(false);
    expect(r.gap).toBeGreaterThan(0);
    expect(r.revenue + r.gap).toBeCloseTo(r.totalCost * 1.1, 0);
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
    // $10,000 land + 1,200 sf × $185 × 1.35 = $309,700 cost; 10% target → $340,670
    expect(r.breakEvenValue).toBeCloseTo(340_670, 0);
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

  it("adds the premium case to the per-lot sensitivity line", () => {
    // Worked example (docs/comps-and-proforma.md): cost $309,700, target value $340,670; at ZHVI $300k the shortfall is $83,527.
    // +$10/sf: cost 309,700 + 12,000 x 1.35 = 325,900; target 358,490; value 257,143 -> short $101,347.
    // 1.3x index: value 334,286 vs target 340,670 -> short $6,384.
    expect(sensitivityLine(lot(), "single", comps(300_000))).toBe(
      "Value needed for the target return $340,670; at $195/sq ft short by $101,347; at a new-construction premium (1.3× index) short by $6,384.",
    );
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
