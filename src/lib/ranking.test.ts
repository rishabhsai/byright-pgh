import { describe, expect, it } from "vitest";
import type { Lot } from "./types";
import { compareTriageRanked, isDispositionEligible, isParkOrGreenway, statusGroup, type TriageRanked } from "./ranking";

interface RowOpts {
  status?: string;
  byRight?: boolean;
  hazard?: boolean;
  area?: number | null;
  gap?: number | null;
  score?: number;
  inventoryType?: string;
}

const row = (id: string, o: RowOpts = {}): TriageRanked => ({
  score: o.score ?? 3,
  triage: "yellow",
  margin: null,
  byRight: o.byRight ?? true,
  gap: o.gap === undefined ? 100_000 : o.gap,
  lot: {
    id,
    address: id,
    neighborhood: "Test",
    councilDistrict: "1",
    ward: "1",
    lat: 40.44,
    lon: -79.99,
    zone: "R2-M",
    lotAreaSqFt: o.area === undefined ? 3000 : o.area,
    frontageFt: 30,
    landValue: 1000,
    status: o.status ?? "Available for Sale",
    inventoryType: o.inventoryType ?? "Public Sale",
    hazards: { steepSlope: !!o.hazard, undermined: false, floodZone: false },
  } satisfies Lot,
});

const order = (rows: TriageRanked[]) => rows.sort(compareTriageRanked).map((r) => r.lot.id);

describe("compareTriageRanked", () => {
  it("ranks available, then by right, then no hazard flag, then at least 1,000 sf, then lowest shortfall", () => {
    expect(
      order([
        row("held", { status: "Hold for Study", gap: 0 }),
        row("relief", { byRight: false, gap: 0 }),
        row("flagged", { hazard: true, gap: 0 }),
        row("sliver", { area: 800, gap: 0 }),
        row("gap-200k", { gap: 200_000 }),
        row("no-comps", { gap: null }),
        row("gap-50k", { gap: 50_000 }),
      ]),
    ).toEqual(["gap-50k", "gap-200k", "no-comps", "sliver", "flagged", "relief", "held"]);
  });

  it("breaks shortfall ties by score", () => {
    expect(order([row("low", { score: 1, gap: 0 }), row("high", { score: 9, gap: 0 })])).toEqual(["high", "low"]);
  });
});

describe("inventory helpers", () => {
  it("groups statuses for the Status filter, folding case variants", () => {
    expect(statusGroup("Hold For Study")).toBe("Hold for Study");
    expect(statusGroup("Available for Sale")).toBe("Available for Sale");
    expect(statusGroup("Litigation Pending")).toBe("other");
  });

  it("treats parks, greenways and infrastructure protection as non-disposition inventory", () => {
    expect(isParkOrGreenway("Legislated Greenway")).toBe(true);
    expect(isParkOrGreenway("Infrastructure Protection")).toBe(true);
    expect(isParkOrGreenway("URA Transfer")).toBe(false);
  });

  it("one disposition-eligibility policy: protected-purpose inventory types and privately owned records are never eligible", () => {
    const lot = (inventoryType: string, status = "Available for Sale") => row("x", { inventoryType, status }).lot;
    for (const t of ["Park", "Greenway", "Legislated Greenway", "Infrastructure Protection"]) expect(isDispositionEligible(lot(t))).toBe(false);
    expect(isDispositionEligible(lot("URA Transfer", "Privately Owned"))).toBe(false);
    expect(isDispositionEligible(lot("Public Sale"))).toBe(true);
    expect(isDispositionEligible(lot("URA Transfer"))).toBe(true);
  });

  it("ranks a Greenway below an eligible lot even when its shortfall is lower", () => {
    const rows = [row("greenway", { inventoryType: "Greenway", gap: 1 }), row("sale", { gap: 200_000 })];
    expect(order(rows)).toEqual(["sale", "greenway"]);
  });
});
