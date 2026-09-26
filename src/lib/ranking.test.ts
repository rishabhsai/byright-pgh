import { describe, expect, it } from "vitest";
import type { Lot, Triage } from "./types";
import { compareTriageRanked, type TriageRanked } from "./ranking";

const row = (id: string, status: string, triage: Triage, score: number): TriageRanked => ({
  score,
  triage,
  margin: null,
  lot: {
    id,
    address: id,
    neighborhood: "Test",
    councilDistrict: "1",
    ward: "1",
    lat: 40.44,
    lon: -79.99,
    zone: "R2-M",
    lotAreaSqFt: 3000,
    frontageFt: 30,
    landValue: 1000,
    status,
    inventoryType: "City",
    hazards: { steepSlope: false, undermined: false, floodZone: false },
  } satisfies Lot,
});

describe("compareTriageRanked", () => {
  it("ranks lots available for sale first, then by triage color, then by score", () => {
    const rows = [
      row("held-green", "Hold for Study", "green", 20),
      row("sale-yellow", "Available for Sale", "yellow", 1),
      row("sale-green", "Available for Sale", "green", 2),
      row("held-yellow", "Hold for Study", "yellow", 30),
      row("sale-green-top", "Available for Sale", "green", 9),
    ];
    expect(rows.sort(compareTriageRanked).map((r) => r.lot.id)).toEqual([
      "sale-green-top",
      "sale-green",
      "sale-yellow",
      "held-green",
      "held-yellow",
    ]);
  });
});
