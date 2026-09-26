import { describe, expect, it } from "vitest";
import type { Lot } from "../types";
import { bestVerdict, countByRight, evaluateLot } from "./index";

function lot(overrides: Partial<Lot>): Lot {
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
    hazards: { steepSlope: false, undermined: false, floodZone: null },
    ...overrides,
  };
}

const byTypology = (lotIn: Lot, ruleSet: "current" | "bill-2025-1545" = "current") =>
  Object.fromEntries(evaluateLot(lotIn, ruleSet).map((f) => [f.typology, f]));

describe("evaluateLot", () => {
  it("R1D-H lot of 3,000 sq ft / 25 ft frontage: single is by-right under current (min lot 1,200 sq ft, §903.03.D)", () => {
    const f = byTypology(lot({ zone: "R1D-H", lotAreaSqFt: 3000, frontageFt: 25 }));
    expect(f.single.verdict).toBe("by-right");
    const area = f.single.checks.find((c) => c.id === "lot-area");
    expect(area?.passed).toBe(true);
    expect(area?.required).toContain("1,200");
    expect(area?.citation.section).toContain("903.03");
  });

  it("returns one finding per typology in order single, single_adu, duplex, triplex, townhome", () => {
    expect(evaluateLot(lot({}), "current").map((f) => f.typology)).toEqual([
      "single",
      "single_adu",
      "duplex",
      "triplex",
      "townhome",
    ]);
  });

  it("duplex in R1D is prohibited (Two-Unit Residential has no entry in the R1D column of §911.02)", () => {
    const f = byTypology(lot({ zone: "R1D-H" }));
    expect(f.duplex.verdict).toBe("prohibited");
    expect(f.triplex.verdict).toBe("prohibited");
    expect(f.duplex.checks.find((c) => c.id === "use")?.citation.section).toContain("911.02");
  });

  it("R2-L lot of 2,000 sq ft is below the 3,000 sq ft minimum: variance with failing lot-area check citing §903.03", () => {
    const f = byTypology(lot({ zone: "R2-L", lotAreaSqFt: 2000, frontageFt: 20 }));
    expect(f.single.verdict).toBe("variance");
    expect(f.duplex.verdict).toBe("variance");
    const area = f.duplex.checks.find((c) => c.id === "lot-area");
    expect(area?.passed).toBe(false);
    expect(area?.required).toBe("3,000 sq ft");
    expect(area?.citation.section).toContain("903.03");
    expect(f.duplex.summary).toContain("903.03");
  });

  it("RM-M lot of 3,000 sq ft: duplex and triplex are by-right (min lot 2,400 sq ft)", () => {
    const f = byTypology(lot({ zone: "RM-M", lotAreaSqFt: 3000, frontageFt: 30 }));
    expect(f.duplex.verdict).toBe("by-right");
    expect(f.triplex.verdict).toBe("by-right");
  });

  it("single_adu in R1D-H: prohibited outside an ADU overlay under current, by-right under bill-2025-1545", () => {
    const now = byTypology(lot({ zone: "R1D-H" }), "current");
    const bill = byTypology(lot({ zone: "R1D-H" }), "bill-2025-1545");
    expect(now.single_adu.verdict).toBe("prohibited");
    expect(now.single_adu.checks.find((c) => c.id === "adu-eligibility")?.citation.section).toContain("912.08");
    expect(bill.single_adu.verdict).toBe("by-right");
    const adu = bill.single_adu.checks.find((c) => c.id === "adu-eligibility");
    expect(adu?.passed).toBe(true);
    expect(adu?.citation.url).toContain("2025-1545");
    expect(adu?.citation.ruleSet).toBe("bill-2025-1545");
  });

  it("bill-2025-1545 removes minimum parking (0 per unit); current requires 1 per unit for a detached single", () => {
    const now = byTypology(lot({ zone: "R2-M" }), "current");
    const bill = byTypology(lot({ zone: "R2-M" }), "bill-2025-1545");
    expect(now.duplex.checks.find((c) => c.id === "parking")?.required).toContain("1 per unit");
    expect(now.duplex.checks.find((c) => c.id === "parking")?.citation.section).toContain("914.02");
    expect(bill.duplex.checks.find((c) => c.id === "parking")?.required).toContain("0 per unit");
  });

  it("zone P (Parks) is not encoded: every typology is unknown with an honest summary", () => {
    const findings = evaluateLot(lot({ zone: "P" }), "current");
    expect(findings.map((f) => f.verdict)).toEqual(["unknown", "unknown", "unknown", "unknown", "unknown"]);
    expect(findings[0].summary).toContain("P (Parks)");
    expect(findings[0].summary).toContain("not encoded");
    expect(bestVerdict(findings)).toBe("unknown");
  });

  it("lotAreaSqFt null: lot-area check passed is null, labelled needs survey, verdict not downgraded", () => {
    const f = byTypology(lot({ zone: "R1D-H", lotAreaSqFt: null }));
    const area = f.single.checks.find((c) => c.id === "lot-area");
    expect(area?.passed).toBeNull();
    expect(area?.label).toContain("needs survey");
    expect(f.single.verdict).toBe("by-right");
    expect(f.single.summary).toContain("needs survey");
  });

  it("H (Hillside): single needs Administrator Exception review; 3,000 sq ft is under the 3,200 sq ft minimum so variance; duplex prohibited", () => {
    const small = byTypology(lot({ zone: "H", lotAreaSqFt: 3000 }));
    expect(small.single.verdict).toBe("variance");
    const big = byTypology(lot({ zone: "H", lotAreaSqFt: 4000 }));
    expect(big.single.verdict).toBe("review");
    expect(big.townhome.verdict).toBe("review");
    expect(big.duplex.verdict).toBe("prohibited");
    expect(big.single.checks.find((c) => c.id === "lot-area")?.citation.section).toContain("905.02");
  });

  it("townhome in R1D: by right on a 25 ft lot, Special Exception review on a 40 ft lot, review when frontage unknown (§911.04.A.69A)", () => {
    expect(byTypology(lot({ zone: "R1D-M", frontageFt: 25 })).townhome.verdict).toBe("by-right");
    expect(byTypology(lot({ zone: "R1D-M", frontageFt: 40 })).townhome.verdict).toBe("review");
    expect(byTypology(lot({ zone: "R1D-M", frontageFt: null })).townhome.verdict).toBe("review");
  });

  it("LNC: minimum lot size 0, all four housing rows permitted by right", () => {
    const f = byTypology(lot({ zone: "LNC", lotAreaSqFt: 900, frontageFt: 18 }));
    expect(f.single.verdict).toBe("by-right");
    expect(f.triplex.verdict).toBe("by-right");
    expect(f.townhome.verdict).toBe("by-right");
  });

  it("every check in every encoded district and rule set has a non-empty citation url and section", () => {
    for (const ruleSet of ["current", "bill-2025-1545"] as const) {
      for (const zone of ["R1D-VL", "R1D-L", "R1A-M", "R2-H", "R3-VH", "RM-M", "LNC", "H"]) {
        for (const f of evaluateLot(lot({ zone }), ruleSet)) {
          expect(f.checks.length).toBeGreaterThan(0);
          for (const c of f.checks) {
            expect(c.citation.url, `${ruleSet} ${zone} ${f.typology} ${c.id}`).toMatch(/^https:\/\//);
            expect(c.citation.section.length).toBeGreaterThan(0);
            expect(c.citation.ruleSet).toBe(ruleSet);
          }
        }
      }
    }
  });
});

describe("bestVerdict / countByRight", () => {
  it("bestVerdict picks the most permissive verdict; countByRight counts by-right findings", () => {
    const findings = evaluateLot(lot({ zone: "R2-M", lotAreaSqFt: 3000, frontageFt: 30 }), "current");
    expect(bestVerdict(findings)).toBe("by-right");
    expect(countByRight(findings)).toBe(3); // single, duplex, townhome
    const h = evaluateLot(lot({ zone: "H", lotAreaSqFt: 4000 }), "current");
    expect(bestVerdict(h)).toBe("review");
    expect(countByRight(h)).toBe(0);
    expect(bestVerdict([])).toBe("unknown");
  });
});
