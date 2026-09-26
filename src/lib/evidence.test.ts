import { describe, expect, it } from "vitest";
import type { Comps, Lot, RuleSet, Typology } from "./types";
import { evaluateLot } from "./rules";
import { triageLot } from "./triage";
import { proformaWithFallback } from "./finance";
import { deriveEvidence, yellowReason } from "./evidence";

function lot(overrides: Partial<Lot> = {}): Lot {
  return {
    id: "0043R00172000000",
    address: "1 Test St",
    neighborhood: "Test",
    councilDistrict: "1",
    ward: "8",
    lat: 40.44,
    lon: -79.99,
    zone: "R2-M",
    lotAreaSqFt: 3000,
    frontageFt: 25,
    landValue: 1000,
    status: "Available for Sale",
    inventoryType: "Public Sale",
    hazards: { steepSlope: false, undermined: false, floodZone: false },
    ...overrides,
  };
}

const comps = (zhvi: number): Comps => ({
  neighborhood: "Test",
  zip: "15217",
  zhvi,
  zhviDate: "2026-08-31",
  zori: 1500,
  zoriDate: "2026-08-31",
});
const RICH = comps(780_000);
const POOR = comps(83_082);

/** Evidence for one typology on a lot, wired the way the app wires it. */
function evidenceFor(l: Lot, c: Comps | null, typology: Typology = "single", ruleSet: RuleSet = "current") {
  const findings = evaluateLot(l, ruleSet);
  const triage = triageLot(l, findings, c, undefined, typology);
  const finding = findings.find((f) => f.typology === typology)!;
  const pf = c ? proformaWithFallback(l, typology, c) : null;
  return { evidence: deriveEvidence(l, finding, triage, pf, c), triage };
}

const check = (e: ReturnType<typeof deriveEvidence>, id: string) => e.checks.find((c) => c.id === id)!;

describe("deriveEvidence", () => {
  it("scores a clean, penciling, by-right lot 6 of 6, with fit visible as not checked", () => {
    const { evidence } = evidenceFor(lot(), RICH);
    expect(evidence.total).toBe(6);
    expect(evidence.passed).toBe(6);
    expect(evidence.checks.map((c) => c.id)).toEqual(["use", "lotSize", "width", "fit", "site", "finance"]);
    expect(check(evidence, "use")).toMatchObject({ state: "pass" });
    expect(check(evidence, "use").detail).toContain("§ 911.02");
    expect(check(evidence, "lotSize").detail).toBe("3,000 sf ≥ 2,400 sf minimum · § 903.03.C.2");
    expect(check(evidence, "fit")).toMatchObject({ state: "notChecked" });
    expect(check(evidence, "fit").detail).toMatch(/^Setbacks, height, lot coverage not modeled/);
    expect(check(evidence, "site").detail).toMatch(/at the inventory point.*[Aa]ccess, water\/sewer, soils not checked/);
    expect(check(evidence, "finance")).toMatchObject({ state: "pass" });
    expect(check(evidence, "finance").detail).toMatch(/Screen, not underwriting/);
  });

  it("fails site on a steep-slope flag and says what was not checked", () => {
    const { evidence } = evidenceFor(lot({ hazards: { steepSlope: true, undermined: false, floodZone: false } }), RICH);
    expect(check(evidence, "site").state).toBe("fail");
    expect(check(evidence, "site").detail).toMatch(/^Slope ≥ 25% flag at the inventory point \(City GIS\)\. Site review needed; H-district conditions in § 911\.04\.A\.69\(a\)/);
    expect(check(evidence, "site").detail).toMatch(/Access, water\/sewer, soils not checked/);
    expect(evidence.passed).toBe(5);
  });

  it("marks site unknown when flood screening is missing", () => {
    const { evidence } = evidenceFor(lot({ hazards: { steepSlope: false, undermined: false, floodZone: null } }), RICH);
    expect(check(evidence, "site").state).toBe("unknown");
  });

  it("marks width unknown when frontage is not recorded", () => {
    const { evidence } = evidenceFor(lot({ frontageFt: null }), RICH);
    expect(check(evidence, "width")).toMatchObject({ state: "unknown", detail: "Frontage not in the County legal description; survey needed" });
  });

  it("fails width for an attached unit on an R1D lot wider than 35 ft", () => {
    const { evidence } = evidenceFor(lot({ zone: "R1D-M", frontageFt: 40 }), RICH, "townhome");
    expect(check(evidence, "width").state).toBe("fail");
    expect(check(evidence, "use").state).toBe("unknown");
    expect(evidence.needsApproval).toBe(true);
  });

  it("fails fit on a 259 sf LNC lot where FAR 2:1 caps a three-unit at 518 sf", () => {
    const { evidence } = evidenceFor(lot({ zone: "LNC", lotAreaSqFt: 259 }), RICH, "triplex");
    expect(check(evidence, "fit")).toMatchObject({
      state: "fail",
      detail: "FAR 2:1 caps floor area at 518 sf · § 904.02.C. The 2,550 sf proposal does not fit.",
    });
  });

  it("fails lot size with the relief-path copy", () => {
    const { evidence } = evidenceFor(lot({ lotAreaSqFt: 1860 }), RICH);
    expect(check(evidence, "lotSize").detail).toBe(
      "1,860 sf < 2,400 sf minimum · § 903.03.C.2. Relief needed: variance or § 921.04 nonconforming-lot exception; staff determine which.",
    );
  });

  it("marks finance unknown without comps, and fails it with the shortfall when the numbers do not pencil", () => {
    const none = evidenceFor(lot({ neighborhood: "New Homestead" }), null).evidence;
    expect(check(none, "finance")).toMatchObject({ state: "unknown", detail: "No Zillow series for New Homestead. Enter a comp to screen." });
    const poor = evidenceFor(lot(), POOR).evidence;
    expect(check(poor, "finance").state).toBe("fail");
    expect(check(poor, "finance").detail).toMatch(/^Modeled shortfall \$[\d,]+ to a 10% return at \$185\/sf\. Break-even sale value \$[\d,]+; Test ZHVI \$83,082 \(2026-08\)\.$/);
  });
});

describe("yellowReason", () => {
  it("names subsidy for a clean by-right lot that does not pencil", () => {
    const { evidence, triage } = evidenceFor(lot(), POOR);
    expect(yellowReason(triage, evidence)).toBe("needs subsidy");
  });

  it("names a hearing or staff approval when relief is needed", () => {
    const { evidence, triage } = evidenceFor(lot({ lotAreaSqFt: 1860 }), POOR);
    expect(yellowReason(triage, evidence)).toBe("needs a hearing or staff approval");
  });

  it("names unknowns when a survey is needed", () => {
    const { evidence, triage } = evidenceFor(lot({ frontageFt: null }), RICH);
    expect(yellowReason(triage, evidence)).toBe("unknowns to resolve");
  });

  it("is null for Green", () => {
    const { evidence, triage } = evidenceFor(lot(), RICH);
    expect(triage.triage).toBe("green");
    expect(yellowReason(triage, evidence)).toBeNull();
  });
});
