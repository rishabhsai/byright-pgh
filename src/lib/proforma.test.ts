import { describe, expect, it } from "vitest";
import type { Comps, CompsFile, Lot } from "./types";
import { compsForLot, computeProforma, DEFAULT_ASSUMPTIONS, DEFAULT_FINANCE, runProforma, saleScale, validateFinance } from "./proforma";

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
