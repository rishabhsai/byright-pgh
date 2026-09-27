import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Lot } from "../types";
import { DISTRICTS } from "./districts";
import { evaluateLot } from "./evaluate";
import { BILL_PARAMS, buildRegistry, TODAY_PARAMS } from "./params";

// Captured from districts.ts before the registry was parameterized (docs/reform.md).
const GOLDEN = readFileSync(new URL("./__fixtures__/districts.golden.json", import.meta.url), "utf8").trim();

describe("buildRegistry reproduces the two encoded rule sets", () => {
  it("TODAY_PARAMS and BILL_PARAMS rebuild the pre-refactor tables byte for byte", () => {
    const rebuilt = { current: buildRegistry(TODAY_PARAMS), "bill-2025-1545": buildRegistry(BILL_PARAMS) };
    expect(JSON.parse(JSON.stringify(rebuilt))).toEqual(JSON.parse(GOLDEN));
    expect(JSON.stringify(rebuilt)).toBe(GOLDEN);
  });

  it("DISTRICTS is the two prebuilt registries", () => {
    expect(buildRegistry(TODAY_PARAMS)).toStrictEqual(DISTRICTS.current);
    expect(buildRegistry(BILL_PARAMS)).toStrictEqual(DISTRICTS["bill-2025-1545"]);
  });

  it("today's lot-size minimums are 6,000 / 3,000 / 2,400 / 1,200 / none and Hillside 3,200", () => {
    expect(TODAY_PARAMS.minLotArea).toEqual({ VL: 6000, L: 3000, M: 2400, H: 1200, VH: null });
    expect(TODAY_PARAMS.hillsideMinLot).toBe(3200);
    expect(BILL_PARAMS).toEqual({ ...TODAY_PARAMS, aduByRight: true, parkingMinimums: false });
  });
});

const lot = (o: Partial<Lot>): Lot => ({
  id: "0000X00000000000",
  address: "1 Test St",
  neighborhood: "Test",
  councilDistrict: "1",
  ward: "1",
  lat: 40.44,
  lon: -79.99,
  zone: "R1D-L",
  lotAreaSqFt: 2000,
  frontageFt: 25,
  landValue: 1000,
  status: "Available for Sale",
  inventoryType: "Vacant Lot",
  hazards: { steepSlope: false, undermined: false, floodZone: false },
  ...o,
});

describe("evaluateLot with a registry built from params", () => {
  const lowerL = buildRegistry({ ...TODAY_PARAMS, minLotArea: { ...TODAY_PARAMS.minLotArea, L: 1800 } });

  it("a 2,000 sf R1D-L lot needs relief today and is allowed with L at 1,800, citing the same § 903.03.B.2", () => {
    const today = evaluateLot(lot({}), "current").find((f) => f.typology === "single")!;
    const lever = evaluateLot(lot({}), "current", lowerL).find((f) => f.typology === "single")!;
    expect(today.verdict).toBe("variance");
    expect(lever.verdict).toBe("by-right");
    const area = lever.checks.find((c) => c.id === "lot-area")!;
    expect(area.required).toBe("1,800 sq ft");
    expect(area.citation.section).toBe("§ 903.03.B.2");
    expect(area.note).toContain("Hypothetical lever");
  });

  it("marks every check from a custom registry as citationScenario custom, and none from the prebuilt one", () => {
    const custom = evaluateLot(lot({}), "current", lowerL).flatMap((f) => f.checks);
    expect(custom.length).toBeGreaterThan(0);
    expect(custom.every((c) => c.citationScenario === "custom" && c.citation.ruleSet === "current")).toBe(true);
    const prebuilt = evaluateLot(lot({}), "current", DISTRICTS.current).flatMap((f) => f.checks);
    expect(prebuilt.some((c) => "citationScenario" in c)).toBe(false);
    expect(evaluateLot(lot({}), "current", DISTRICTS.current)).toStrictEqual(evaluateLot(lot({}), "current"));
  });

  it("two-unit in R1 makes a duplex allowed in R1D; three-unit in R2 makes a triplex allowed in R2", () => {
    const big = lot({ lotAreaSqFt: 5000 });
    const duplex = (reg?: ReturnType<typeof buildRegistry>, z = "R1D-L", t = "duplex") =>
      evaluateLot({ ...big, zone: z }, "current", reg).find((f) => f.typology === t)!.verdict;
    expect(duplex()).toBe("prohibited");
    expect(duplex(buildRegistry({ ...TODAY_PARAMS, twoUnitInR1: true }))).toBe("by-right");
    expect(duplex(undefined, "R2-L", "triplex")).toBe("prohibited");
    expect(duplex(buildRegistry({ ...TODAY_PARAMS, threeUnitInR2: true }), "R2-L", "triplex")).toBe("by-right");
  });
});
