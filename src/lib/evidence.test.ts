import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Comps, CompsFile, Lot, LotsFile, RuleSet, Typology } from "./types";
import { evaluateLot } from "./rules";
import { triageLot } from "./triage";
import { compsFor, DEFAULT_FINANCE, proformaWithFallback } from "./finance";
import { deriveEvidence, evidenceForLot, financeResult, firstOpenItem, summary, yellowReason } from "./evidence";

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
  it("counts a clean, penciling, by-right lot as 5 pass and 1 not checked: fit is never a pass by omission", () => {
    const { evidence } = evidenceFor(lot(), RICH);
    expect(evidence.total).toBe(6);
    expect(evidence.passed).toBe(5);
    expect(evidence.counts).toEqual({ pass: 5, fail: 0, unknown: 0, notChecked: 1 });
    expect(summary(evidence)).toBe("5 pass · 1 not checked");
    expect(evidence.checks.map((c) => c.id)).toEqual(["use", "lotSize", "width", "fit", "site", "finance"]);
    expect(check(evidence, "use")).toMatchObject({ state: "pass" });
    expect(check(evidence, "use").detail).toContain("§ 911.02");
    expect(check(evidence, "lotSize").detail).toBe("3,000 sf ≥ 2,400 sf minimum · § 903.03.C.2");
    expect(check(evidence, "fit")).toMatchObject({ state: "notChecked" });
    expect(check(evidence, "fit").detail).toBe("Setbacks, height, lot coverage not modeled");
    expect(check(evidence, "site").detail).toMatch(/at the inventory point.*[Aa]ccess, water\/sewer, soils not checked/);
    expect(check(evidence, "finance")).toMatchObject({ state: "pass" });
    expect(check(evidence, "finance").detail).toMatch(/Screen, not underwriting/);
  });

  it("marks use unknown when the City zoning map names a different district at the inventory point", () => {
    const { evidence } = evidenceFor(lot({ zone: "R1D-H", zoneMap: "RM-M", zoneAgrees: false }), RICH);
    expect(check(evidence, "use")).toMatchObject({
      state: "unknown",
      detail: "Inventory says R1D-H; City zoning map says RM-M at this point. Confirm district before relying on this.",
    });
    // Lot size, width and site pass; finance is not screened until the district is confirmed.
    expect(evidence.counts.pass).toBe(3);
    expect(check(evidence, "finance").state).toBe("notChecked");
  });

  it("keeps use as the rule result when the map agrees or was not compared", () => {
    expect(check(evidenceFor(lot({ zoneMap: "R2-M", zoneAgrees: true }), RICH).evidence, "use").state).toBe("pass");
    expect(check(evidenceFor(lot(), RICH).evidence, "use").state).toBe("pass");
  });

  it("marks use unknown when no zoning map district contains the inventory point: the district is unconfirmed", () => {
    expect(check(evidenceFor(lot({ zoneMap: null, zoneAgrees: null }), RICH).evidence, "use")).toMatchObject({
      state: "unknown",
      detail: "Inventory says R2-M; no City zoning map district contains this point. Confirm district before relying on this.",
    });
  });

  it("fails site on a steep-slope flag and says what was not checked; the Hillside citation is for H lots only", () => {
    const { evidence } = evidenceFor(lot({ hazards: { steepSlope: true, undermined: false, floodZone: false } }), RICH);
    expect(check(evidence, "site").state).toBe("fail");
    // An R2-M lot: a slope flag does not make it an H-district lot.
    expect(check(evidence, "site").detail).toMatch(/^Slope ≥ 25% flag at the inventory point \(City GIS\)\. Site review needed\. /);
    expect(check(evidence, "site").detail).not.toMatch(/911\.04\.A\.69/);
    const h = evidenceFor(lot({ zone: "H", lotAreaSqFt: 50_000, frontageFt: 100, hazards: { steepSlope: true, undermined: false, floodZone: false } }), RICH).evidence;
    expect(check(h, "site").detail).toMatch(/Site review needed; H-district conditions in § 911\.04\.A\.69\(a\)/);
    expect(check(evidence, "site").detail).toMatch(/Access, water\/sewer, soils not checked/);
    expect(evidence.passed).toBe(4);
    expect(summary(evidence)).toBe("4 pass · 1 fail · 1 not checked");
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

  it("names the LNC FAR check only on LNC lots", () => {
    for (const zone of ["R2-M", "R1D-H"]) {
      expect(check(evidenceFor(lot({ zone }), RICH).evidence, "fit").detail).not.toMatch(/LNC|FAR/);
    }
  });

  it("an LNC FAR pass is not a building-fit pass: fit stays not checked", () => {
    const { evidence } = evidenceFor(lot({ zone: "LNC", lotAreaSqFt: 3000 }), RICH);
    expect(check(evidence, "fit")).toMatchObject({
      state: "notChecked",
      detail: "FAR 2:1 passes; setbacks, height, coverage not modeled · § 904.02.C",
    });
  });

  it("keeps required parking visible as an unresolved requirement", () => {
    const { evidence } = evidenceFor(lot({ zone: "R1D-H", frontageFt: 40 }), RICH);
    expect(evidence.unresolved).toEqual([
      expect.objectContaining({ id: "parking", label: "Parking", detail: expect.stringMatching(/^1 space required · § 914\.02\.A\. Must fit on the site plan; not verified/) }),
    ]);
  });

  it("no unresolved parking where the rule set has no minimum", () => {
    const { evidence } = evidenceFor(lot(), RICH, "single", "bill-2025-1545");
    expect(evidence.unresolved).toEqual([]);
  });

  it("fails fit on a 259 sf LNC lot where FAR 2:1 caps a three-unit at 518 sf", () => {
    const { evidence } = evidenceFor(lot({ zone: "LNC", lotAreaSqFt: 259 }), RICH, "triplex");
    expect(check(evidence, "fit")).toMatchObject({
      state: "fail",
      detail: "FAR 2:1 caps floor area at 518 sf · § 904.02.C. The 2,550 sf proposal does not fit.",
    });
  });

  it("a lot under the 1,000 sf screening floor that meets the code minimum fails as Below floor, not as a code failure", () => {
    const { evidence } = evidenceFor(lot({ zone: "LNC", lotAreaSqFt: 259 }), RICH, "triplex");
    expect(check(evidence, "lotSize")).toMatchObject({
      state: "fail",
      belowFloor: true,
      label: "Below floor",
      detail: "259 sq ft; below our 1,000 sf screening floor (not a code minimum); code minimum 0 here",
    });
    expect(check(evidenceFor(lot(), RICH).evidence, "lotSize")).toMatchObject({ label: "Lot size", belowFloor: false });
    expect(check(evidenceFor(lot({ lotAreaSqFt: 1860 }), RICH).evidence, "lotSize")).toMatchObject({ label: "Lot size", belowFloor: false });
  });

  it("fails lot size with the relief-path copy", () => {
    const { evidence } = evidenceFor(lot({ lotAreaSqFt: 1860 }), RICH);
    expect(check(evidence, "lotSize").detail).toBe(
      "1,860 sf < 2,400 sf minimum · § 903.03.C.2. Relief needed: variance or § 921.04 nonconforming-lot exception; staff determine which.",
    );
  });

  it("marks finance unknown without comps, and fails it with the shortfall when the numbers do not pencil", () => {
    const none = evidenceFor(lot({ neighborhood: "New Homestead" }), null).evidence;
    expect(check(none, "finance")).toMatchObject({ state: "unknown", detail: "No Zillow series for New Homestead; finance not screened." });
    const poor = evidenceFor(lot(), POOR).evidence;
    expect(check(poor, "finance").state).toBe("fail");
    expect(check(poor, "finance").detail).toMatch(/^Modeled shortfall \$[\d,]+ to a 10% return at \$225\/sf\. Target sale value \$[\d,]+; Test ZHVI \$83,082 \(2026-08\)\.$/);
  });
});

const LOTS = "public/data/lots.json";
const COMPS = "public/data/comps.json";
describe.runIf(existsSync(LOTS) && existsSync(COMPS))("financeResult on real records", () => {
  const lots = existsSync(LOTS) ? (JSON.parse(readFileSync(LOTS, "utf8")) as LotsFile).lots : [];
  const file = existsSync(COMPS) ? (JSON.parse(readFileSync(COMPS, "utf8")) as CompsFile) : null;
  const gate = (id: string, typology: Typology) => {
    const l = lots.find((x) => x.id === id)!;
    const c = compsFor(l, file);
    const findings = evaluateLot(l, "current");
    const f = findings.find((x) => x.typology === typology)!;
    const pf = proformaWithFallback(l, typology, c);
    const ev = evidenceForLot(l, findings, null, c, DEFAULT_FINANCE, typology);
    return { r: financeResult(l, f, ev, pf), ev };
  };

  it("0 Forbes Av triplex fails FAR: not screened, no proforma", () => {
    const { r } = gate("0086L00500000000", "triplex");
    expect(r).toEqual({ screened: false, reason: "building does not fit (FAR)", proforma: null });
  });

  it("0 Warren St (Hillside) house needs an administrator exception: permission unresolved, figures hypothetical only", () => {
    const { r, ev } = gate("0046S00371000000", "single");
    expect(r.screened).toBe(false);
    expect(r.reason).toBe("permission unresolved");
    expect(r.proforma).not.toBeNull();
    expect(ev.checks.find((x) => x.id === "finance")!.detail).toBe("Not screened: permission unresolved");
  });

  it("3336 Oregon St (Esplen; inventory R1D-H, map RIV-RM): district unconfirmed, not screened", () => {
    const { r } = gate("0043R00172000000", "single");
    expect(r).toMatchObject({ screened: false, reason: "district unconfirmed" });
  });

  it("126 Carrington as a duplex is not permitted: not screened, no margin anywhere", () => {
    const { r } = gate("0023F00165000000", "duplex");
    expect(r).toEqual({ screened: false, reason: "use not permitted", proforma: null });
    expect(gate("0023F00165000000", "townhome").r.screened).toBe(true);
  });
});

describe.runIf(existsSync(LOTS) && existsSync(COMPS))("deriveEvidence on real records", () => {
  it("0 Forbes Av (259 sf LNC): the triplex fails Fit, so Finance is not screened rather than showing a margin", () => {
    const l = (JSON.parse(readFileSync(LOTS, "utf8")) as LotsFile).lots.find((x) => x.id === "0086L00500000000")!;
    const c = compsFor(l, JSON.parse(readFileSync(COMPS, "utf8")) as CompsFile);
    const findings = evaluateLot(l, "current");
    const triage = triageLot(l, findings, c, DEFAULT_FINANCE);
    expect(triage.bestTypology).toBe("triplex");
    const ev = evidenceForLot(l, findings, triage, c, DEFAULT_FINANCE, null);
    expect(ev.checks.find((x) => x.id === "fit")!.state).toBe("fail");
    expect(ev.checks.find((x) => x.id === "finance")).toMatchObject({
      state: "notChecked",
      detail: "Not screened: building does not fit (FAR)",
    });
  });

  it("5724 Murray Hill Pl (frontage missing; inventory RM-M, zoning map R1D-L) reads 2 pass · 2 unknown · 2 not checked", () => {
    const l = (JSON.parse(readFileSync(LOTS, "utf8")) as LotsFile).lots.find((x) => x.id === "0085K00296000000")!;
    const c = compsFor(l, JSON.parse(readFileSync(COMPS, "utf8")) as CompsFile);
    const findings = evaluateLot(l, "current");
    const triage = triageLot(l, findings, c, DEFAULT_FINANCE);
    const ev = evidenceForLot(l, findings, triage, c, DEFAULT_FINANCE, null);
    // Use is Unknown (district unconfirmed), so Finance is not screened for this proposal.
    expect(ev.counts).toEqual({ pass: 2, fail: 0, unknown: 2, notChecked: 2 });
    expect(summary(ev)).toBe("2 pass · 2 unknown · 2 not checked");
    expect(ev.checks.find((x) => x.id === "use")!.detail).toBe(
      "Inventory says RM-M; City zoning map says R1D-L at this point. Confirm district before relying on this.",
    );
    expect(triage.triage).toBe("yellow");
  });
});

describe("unresolved permission in the evidence row", () => {
  it("R1D townhouse with no width in the record: Use unknown with the question, Finance not screened, first open item resolves permission", () => {
    const l = lot({ zone: "R1D-M", frontageFt: null });
    const { evidence } = evidenceFor(l, RICH, "townhome");
    expect(check(evidence, "use")).toMatchObject({ state: "unknown" });
    expect(check(evidence, "use").detail).toContain("P if lot width ≤ 35 ft, else S; width not in the record");
    expect(check(evidence, "finance")).toMatchObject({ state: "notChecked", detail: "Not screened: permission unresolved" });
    expect(evidence.needsApproval).toBe(false);
    const f = evaluateLot(l, "current").find((x) => x.typology === "townhome")!;
    expect(firstOpenItem(l, f, evidence)).toEqual({ id: "permission", label: "Resolve permission: confirm lot width (§ 911.04.A.69A)" });
  });

  it("House + ADU under current code: Use unknown pending the overlay question, not a use-variance failure", () => {
    const l = lot({ zone: "R1D-H" });
    const { evidence } = evidenceFor(l, RICH, "single_adu");
    expect(check(evidence, "use").state).toBe("unknown");
    expect(check(evidence, "use").detail).toMatch(/ADU overlay applicability unknown/);
    const f = evaluateLot(l, "current").find((x) => x.typology === "single_adu")!;
    expect(firstOpenItem(l, f, evidence)?.label).toBe("Resolve permission: confirm ADU overlay (§ 912.08)");
  });
});

describe("financeResult: one screened / not-screened answer", () => {
  const result = (l: Lot, typology: Typology, c: Comps | null = RICH) => {
    const findings = evaluateLot(l, "current");
    const f = findings.find((x) => x.typology === typology)!;
    const pf = c ? proformaWithFallback(l, typology, c) : null;
    const ev = deriveEvidence(l, f, null, pf, c);
    return financeResult(l, f, ev, pf);
  };

  it("screens a permitted proposal on a lot recorded for sale", () => {
    const r = result(lot(), "single");
    expect(r.screened).toBe(true);
    expect(r.reason).toBeUndefined();
    expect(r.proforma?.pencils).toBe(true);
  });

  it("does not screen a lot that is not recorded Available for Sale, but keeps the hypothetical", () => {
    const r = result(lot({ status: "Hold for Study", inventoryType: "Hold For Study" }), "single");
    expect(r).toMatchObject({ screened: false, reason: "not recorded Available for Sale" });
    expect(r.proforma).not.toBeNull();
  });

  it("does not screen a protected-purpose record", () => {
    expect(result(lot({ inventoryType: "Greenway" }), "single")).toMatchObject({ screened: false, reason: "not a disposition-eligible record" });
  });

  it("does not screen without comps", () => {
    expect(result(lot(), "single", null)).toMatchObject({ screened: false, reason: "no value comps for this lot", proforma: null });
  });
});

describe("yellowReason", () => {
  it("names a modeled shortfall to target return, not subsidy, for a clean by-right lot that does not pencil", () => {
    const { evidence, triage } = evidenceFor(lot(), POOR);
    expect(yellowReason(triage, evidence)).toBe("modeled shortfall to target return");
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
