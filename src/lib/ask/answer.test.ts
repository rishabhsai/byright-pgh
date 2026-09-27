import { describe, expect, it } from "vitest";
import type { Lot } from "@/lib/types";
import { DEFAULT_FINANCE } from "@/lib/proforma";
import { BILL_PARAMS, TODAY_PARAMS } from "@/lib/rules";
import { PRESETS } from "@/lib/levers";
import { GREEN_POLICY } from "@/lib/triage";
import { composeAnswer, explainText, greenReason, looksLikeQuestion, type AnswerInput } from "./answer";

function lot(o: Partial<Lot>): Lot {
  return {
    id: "0043R00172000000",
    address: "1 Test St",
    neighborhood: "Hazelwood",
    councilDistrict: "5",
    ward: "15",
    lat: 40.41,
    lon: -79.94,
    zone: "R2-L",
    zoneMap: "R2-L",
    zoneAgrees: true,
    lotAreaSqFt: 3500,
    frontageFt: 40,
    landValue: 1000,
    status: "Available for Sale",
    inventoryType: "Public Sale",
    hazards: { steepSlope: false, undermined: false, floodZone: false },
    ...o,
  };
}

// Hazelwood: an R2-L lot under the 3,000 sf L minimum and one over it; Larimer is outside the scope.
const LOTS = [lot({ id: "A", lotAreaSqFt: 2000 }), lot({ id: "B" }), lot({ id: "C", neighborhood: "Larimer" })];
const L1800 = PRESETS.find((p) => p.id === "min-lot-L-1800")!;

const input = (o: Partial<AnswerInput>): AnswerInput => ({
  lots: LOTS,
  comps: LOTS.map(() => null),
  assumptions: DEFAULT_FINANCE,
  inScope: LOTS.map((l) => l.neighborhood === "Hazelwood"),
  neighborhoods: ["Hazelwood"],
  status: "",
  triage: "",
  typology: "duplex",
  scenario: { params: TODAY_PARAMS, label: "Today's code" },
  ...o,
});

describe("composeAnswer", () => {
  it("counts lots where the home type passes under today's code", () => {
    expect(composeAnswer(input({}))).toBe(
      "Under today's code, Hazelwood has 1 lot where a duplex passes the use-table and lot-size screen; 0 of them clear the cost screen at $225/sf.",
    );
  });

  it("gives the change against today under a lever", () => {
    expect(composeAnswer(input({ scenario: { params: L1800.params, label: "Minimum lot size L 3,000 → 1,800" } }))).toBe(
      "Under the scenario Minimum lot size L 3,000 → 1,800, Hazelwood has 2 lots where a duplex passes the use-table and lot-size screen (+1 vs today); 0 of them clear the cost screen at $225/sf.",
    );
  });

  it("names home types a scenario adds when no home type is chosen", () => {
    expect(composeAnswer(input({ typology: null, scenario: { params: BILL_PARAMS, label: "Bill 2025-1545 (substitute)" } }))).toBe(
      "Under Bill 2025-1545 (substitute), Hazelwood has 1 lot where at least one small home type passes the use-table and lot-size screen (+0 vs today), and 1 of them gains House + backyard unit; 0 of them clear the cost screen at $225/sf.",
    );
  });

  it("counts lots that need an approval apart from lots that pass, so the two add up to the list", () => {
    // Central Northside for sale: two R1A lots where a townhouse passes and one Hillside lot where it needs approval.
    const hood = [lot({ id: "D", neighborhood: "Central Northside", zone: "R1A-VH", zoneMap: "R1A-VH" }), lot({ id: "E", neighborhood: "Central Northside", zone: "R1A-VH", zoneMap: "R1A-VH" }), lot({ id: "F", neighborhood: "Central Northside", zone: "H", zoneMap: "H" })];
    const scoped = input({ lots: hood, comps: hood.map(() => null), inScope: hood.map(() => true), neighborhoods: ["Central Northside"], status: "Available for Sale", typology: "townhome" });
    expect(composeAnswer(scoped)).toBe(
      "Under today's code, Central Northside has 2 lots recorded Available for Sale where a townhouse passes the use-table and lot-size screen and 1 more that needs board approval (Hillside); 0 clear the cost screen at $225/sf.",
    );
  });

  it("names every home type a scenario adds as alternatives", () => {
    const small = [lot({ id: "G", lotAreaSqFt: 2000 })];
    expect(composeAnswer(input({ lots: small, comps: [null], inScope: [true], typology: null, scenario: { params: L1800.params, label: "Minimum lot size L 3,000 → 1,800" } }))).toBe(
      "Under the scenario Minimum lot size L 3,000 → 1,800, Hazelwood has 1 lot where at least one small home type passes the use-table and lot-size screen (+1 vs today), and 1 of them gains House, Duplex or Townhouse; 0 of them clear the cost screen at $225/sf.",
    );
  });

  it("carries the status filter and a citywide scope into the sentence", () => {
    expect(composeAnswer(input({ neighborhoods: [], inScope: LOTS.map(() => true), status: "Available for Sale", typology: "townhome" }))).toMatch(
      /^Under today's code, the city has \d+ lots? recorded Available for Sale where a townhouse passes the use-table and lot-size screen; \d+ of them clears? the cost screen at \$225\/sf\.$/,
    );
  });
});

describe("explainText", () => {
  it("returns the app's fixed Green policy", () => {
    expect(explainText("green-policy", { params: TODAY_PARAMS, label: "Today's code" })).toBe(GREEN_POLICY);
  });

  it("leads the Green policy with the reason read off the hero's counts", () => {
    const today = { params: TODAY_PARAMS, label: "Today's code" };
    expect(explainText("green-policy", today, { green: 0, clearAtPremium: 7, hardCostPerSf: 225 })).toBe(
      `Nothing is Green because no lot clears the cost-and-return screen at $225/sf; 7 would at a 1.3× new-construction premium. ${GREEN_POLICY}`,
    );
    expect(greenReason({ green: 1, clearAtPremium: 4, hardCostPerSf: 180 })).toBe("1 lot is Green at $180/sf; 4 would at a 1.3× new-construction premium.");
  });

  it("describes the active lever from the preset registry", () => {
    expect(explainText("lever", { params: L1800.params, label: "Minimum lot size L 3,000 → 1,800" })).toBe(
      `Minimum lot size L 3,000 → 1,800: ${L1800.note} A hypothetical lever, compared with today's code; not the code.`,
    );
    expect(explainText("lever", { params: { ...TODAY_PARAMS, twoUnitInR1: true, hillsideMinLot: 2500 }, label: "Custom scenario" })).toBe(
      "Custom scenario: Hillside minimum 3,200 → 2,500; Two-unit by right in R1D/R1A: off → on. A hypothetical lever, compared with today's code; not the code.",
    );
  });
});

describe("looksLikeQuestion", () => {
  it("treats requests as questions and addresses as searches", () => {
    for (const q of [
      "Hazelwood lots where a duplex passes if the L minimum drops to 1,800",
      "Show Central Northside townhouses for sale",
      "What changes under the housing bill for Larimer?",
      "Why isn't anything Green?",
      "?larimer",
    ])
      expect(looksLikeQuestion(q), q).toBe(true);
    for (const q of ["5118 Ladora Way", "56-N-203", "Forbes Squirrel Hill", "Hazelwood", "0056N00203000000", "110 Roup Ave"])
      expect(looksLikeQuestion(q), q).toBe(false);
  });
});
