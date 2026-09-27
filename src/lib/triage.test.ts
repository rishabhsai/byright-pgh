import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Comps, CompsFile, Finding, Lot, LotsFile, Typology, Verdict } from "./types";
import { evaluateLot } from "./rules";
import { GREEN_POLICY, meetsGreenPolicy, triageCounts, triageLot } from "./triage";
import { compsFor, DEFAULT_FINANCE } from "./finance";
import { evidenceForLot } from "./evidence";

function lot(overrides: Partial<Lot> = {}): Lot {
  return {
    id: "0043R00172000000",
    address: "1 Test St",
    neighborhood: "Test",
    councilDistrict: "1",
    ward: "8",
    lat: 40.44,
    lon: -79.99,
    zone: "R1D-H",
    lotAreaSqFt: 3000,
    frontageFt: 25,
    landValue: 1000,
    status: "Available for Sale",
    inventoryType: "Public Sale",
    hazards: { steepSlope: false, undermined: false, floodZone: false },
    ...overrides,
  };
}

const comps = (zhvi: number | null): Comps => ({
  neighborhood: "Test",
  zip: "15217",
  zhvi,
  zhviDate: "2026-08-31",
  zori: 1500,
  zoriDate: "2026-08-31",
});
const RICH = comps(780_000);
const POOR = comps(60_000);

const TYPES: Typology[] = ["single", "single_adu", "duplex", "triplex", "townhome"];
const findingsAll = (v: Verdict): Finding[] => TYPES.map((typology) => ({ typology, verdict: v, checks: [], summary: `${v}`, unresolved: [], reviewKind: null }));

describe("triageLot", () => {
  it("green: by right, no hazards, pencils", () => {
    const l = lot();
    const t = triageLot(l, evaluateLot(l, "current"), RICH);
    expect(t.triage).toBe("green");
    expect(t.pencils).toBe(true);
    expect(t.gap).toBe(0);
    expect(t.bestTypology).not.toBeNull();
  });

  it("not green when lot area is unknown: the 1,000 sq ft floor and minimum lot size cannot be evaluated", () => {
    const l = lot({ lotAreaSqFt: null });
    const t = triageLot(l, evaluateLot(l, "current"), RICH);
    expect(t.triage).toBe("yellow");
    expect(t.reasons.join(" ")).toMatch(/lot area/i);
  });

  it("not green when flood screening is missing: unknown hazard is unresolved, not clear", () => {
    const l = lot({ hazards: { steepSlope: false, undermined: false, floodZone: null } });
    const t = triageLot(l, evaluateLot(l, "current"), RICH);
    expect(t.triage).toBe("yellow");
    expect(t.reasons.join(" ")).toMatch(/flood/i);
  });

  it("not green when frontage is not recorded: the evidence row's width check is unknown", () => {
    const l = lot({ frontageFt: null });
    const t = triageLot(l, evaluateLot(l, "current"), RICH);
    expect(t.triage).toBe("yellow");
    expect(t.reasons.join(" ")).toMatch(/frontage/i);
  });

  it("green with a parking reason when the only open question is on-site parking", () => {
    // 40 ft wide R1D: attached needs a Special Exception, so the detached house (1 space) is the best type
    const l = lot({ frontageFt: 40 });
    const f = evaluateLot(l, "current");
    const t = triageLot(l, f, RICH);
    const best = f.find((x) => x.typology === t.bestTypology)!;
    expect(best.checks.find((c) => c.id === "parking")?.passed).toBeNull();
    expect(t.triage).toBe("green");
    expect(t.reasons).toContain("Confirm on-site parking on the site plan (§ 914.02.A)");
  });

  it("not green when the City zoning map disagrees with the inventory district", () => {
    const l = lot({ zoneMap: "RM-M", zoneAgrees: false });
    const t = triageLot(l, evaluateLot(l, "current"), RICH);
    expect(t.triage).toBe("yellow");
    expect(t.reasons).toContain(
      "Zoning: Inventory says R1D-H; City zoning map says RM-M at this point. Confirm district before relying on this.",
    );
  });

  it("not green when the lot is not for sale, even if everything else passes", () => {
    const l = lot({ status: "Hold for Study", inventoryType: "Hold For Study" });
    const t = triageLot(l, evaluateLot(l, "current"), RICH);
    expect(t.triage).toBe("yellow");
    expect(t.reasons).toContain("Not for sale (City status: Hold for Study)");
  });

  it("not green when the record is a park or greenway, even if recorded for sale", () => {
    const l = lot({ inventoryType: "Greenway" });
    const t = triageLot(l, evaluateLot(l, "current"), RICH);
    expect(t.triage).toBe("yellow");
    expect(t.reasons).toContain("Not a disposition candidate (City inventory type: Greenway)");
  });

  it("a selected home type drives the color: duplex is red where it is not listed", () => {
    const l = lot();
    const t = triageLot(l, evaluateLot(l, "current"), RICH, undefined, "duplex");
    expect(t.triage).toBe("red");
    expect(t.reasons[0]).toContain("is not listed in R1D-H");
    expect(triageLot(l, evaluateLot(l, "current"), RICH).triage).toBe("green");
  });

  it("a selected home type is priced as that type", () => {
    const l = lot({ zone: "R2-M" });
    const t = triageLot(l, evaluateLot(l, "current"), RICH, undefined, "duplex");
    expect(t.bestTypology).toBe("duplex");
    expect(t.triage).toBe("green");
  });

  it("yellow, not green, when comps are unavailable: finance not assessed", () => {
    const l = lot();
    const t = triageLot(l, evaluateLot(l, "current"), null);
    expect(t.triage).toBe("yellow");
    expect(t.pencils).toBeNull();
    expect(t.reasons.join(" ")).toContain("comps unavailable; finance not assessed");
  });

  it("yellow: by right but needs subsidy", () => {
    const l = lot();
    const t = triageLot(l, evaluateLot(l, "current"), POOR);
    expect(t.triage).toBe("yellow");
    expect(t.pencils).toBe(false);
    expect(t.gap).toBeGreaterThan(0);
  });

  it("yellow: hazard flag", () => {
    const l = lot({ hazards: { steepSlope: true, undermined: false, floodZone: false } });
    const t = triageLot(l, evaluateLot(l, "current"), RICH);
    expect(t.triage).toBe("yellow");
    expect(t.reasons.join(" ")).toContain("steep slope");
  });

  it("yellow: only a variance is available", () => {
    const t = triageLot(lot(), findingsAll("variance"), RICH);
    expect(t.triage).toBe("yellow");
    expect(t.reasons[0]).toContain("variance");
  });

  it("falls back to sale comps when the ZIP has no rent comp", () => {
    const l = lot();
    const t = triageLot(l, evaluateLot(l, "current"), { ...POOR, zori: null }, { mode: "rent" });
    expect(t.triage).toBe("yellow");
    expect(t.reasons.join(" ")).toContain("sale comps were used");
  });

  it("red: no typology permitted", () => {
    const t = triageLot(lot({ zone: "XX" }), findingsAll("prohibited"), RICH);
    expect(t.triage).toBe("red");
    expect(t.bestTypology).toBeNull();
    expect(t.reasons[0]).toMatch(/^Zoning/);
  });

  it("red: flood zone on steep or undermined ground", () => {
    const l = lot({ hazards: { steepSlope: false, undermined: true, floodZone: true } });
    const t = triageLot(l, evaluateLot(l, "current"), RICH);
    expect(t.triage).toBe("red");
    expect(t.reasons[0]).toContain("flood zone");
  });

  it("gray: district not encoded", () => {
    const l = lot({ zone: "GI" });
    const t = triageLot(l, evaluateLot(l, "current"), RICH);
    expect(t.triage).toBe("gray");
    expect(t.pencils).toBeNull();
  });

  it("on a lot under 25 ft, prefers the attached townhouse over a detached house when both are by right", () => {
    const f: Finding[] = [
      { typology: "single", verdict: "by-right", checks: [], summary: "", unresolved: [], reviewKind: null },
      { typology: "townhome", verdict: "by-right", checks: [], summary: "", unresolved: [], reviewKind: null },
    ];
    // At a $60k index the smaller detached house has the lower shortfall, so margin alone would pick it.
    expect(triageLot(lot({ frontageFt: 30 }), f, POOR).bestTypology).toBe("single");
    expect(triageLot(lot({ frontageFt: 20 }), f, POOR).bestTypology).toBe("townhome");
    expect(triageLot(lot({ frontageFt: null }), f, POOR).bestTypology).toBe("single");
  });

  it("picks the best-verdict typology with the highest margin", () => {
    const f: Finding[] = [
      { typology: "single", verdict: "by-right", checks: [], summary: "", unresolved: [], reviewKind: null },
      { typology: "single_adu", verdict: "by-right", checks: [], summary: "", unresolved: [], reviewKind: null },
      { typology: "triplex", verdict: "variance", checks: [], summary: "", unresolved: [], reviewKind: null },
    ];
    // single_adu sells 1,800 sf at a 1.29 scale; its margin beats a 1,200 sf single in a rich market
    expect(triageLot(lot(), f, RICH).bestTypology).toBe("single_adu");
  });
});

describe("GREEN_POLICY", () => {
  it("states the policy in plain English, including that fit is not checked and parking is listed", () => {
    expect(GREEN_POLICY).toMatch(/allowed by the use table and lot-size standards/);
    expect(GREEN_POLICY).not.toMatch(/by right/);
    expect(GREEN_POLICY).toMatch(/Use, Lot size, Width and Site checks all pass/);
    expect(GREEN_POLICY).toMatch(/Fit is not failing/);
    expect(GREEN_POLICY).toMatch(/Finance passes/);
    expect(GREEN_POLICY).toMatch(/parking/i);
    expect(GREEN_POLICY).toMatch(/Available for Sale/);
    expect(GREEN_POLICY).toMatch(/park, greenway/i);
    expect(GREEN_POLICY).toMatch(/zoning map/i);
  });

  it("a Fit failure keeps a lot out of Green even when everything else passes", () => {
    const l = lot();
    const f = evaluateLot(l, "current").find((x) => x.typology === "single")!;
    type Ev = Parameters<typeof meetsGreenPolicy>[1];
    const row = (id: string, state: string) => ({ id, state, label: id, detail: "" });
    const ev = { checks: [...["use", "lotSize", "width", "site", "finance"].map((id) => row(id, "pass")), row("fit", "fail")] } as unknown as Ev;
    expect(meetsGreenPolicy(f, ev, l)).toBe(false);
    ev.checks.find((c) => c.id === "fit")!.state = "notChecked";
    expect(meetsGreenPolicy(f, ev, l)).toBe(true);
    expect(meetsGreenPolicy(f, ev, { status: "Sale Pending", inventoryType: "Public Sale" })).toBe(false);
  });
});

describe("triageCounts", () => {
  it("counts every lot once", () => {
    const lots = [lot(), lot({ zone: "GI" }), lot({ hazards: { steepSlope: true, undermined: false, floodZone: true } })];
    const file: CompsFile = { generatedAt: "", sources: [], byNeighborhood: { Test: { zhvi: 780_000, zhviDate: "2026-08-31" } }, byZip: {}, lotZip: {} };
    expect(triageCounts(lots, "current", file)).toEqual({ green: 1, yellow: 0, red: 1, gray: 1 });
  });

  const LOTS = "public/data/lots.json";
  const COMPS = "public/data/comps.json";
  it.runIf(existsSync(LOTS) && existsSync(COMPS))("every Green lot's evidence row shows Use, Lot size, Width, Site and Finance passing and Fit not failing", () => {
    const lots = (JSON.parse(readFileSync(LOTS, "utf8")) as LotsFile).lots;
    const file = JSON.parse(readFileSync(COMPS, "utf8")) as CompsFile;
    let green = 0;
    for (const l of lots) {
      const f = evaluateLot(l, "current");
      const c = compsFor(l, file);
      const t = triageLot(l, f, c, DEFAULT_FINANCE);
      if (t.triage !== "green") continue;
      green++;
      const ev = evidenceForLot(l, f, t, c, DEFAULT_FINANCE, null);
      const state = (id: string) => ev.checks.find((x) => x.id === id)!.state;
      for (const id of ["use", "lotSize", "width", "site", "finance"]) expect(state(id), `${l.id} ${id}`).toBe("pass");
      expect(state("fit")).not.toBe("fail");
      expect(f.find((x) => x.typology === t.bestTypology)!.verdict).toBe("by-right");
    }
    expect(green).toBeGreaterThan(0);
  }, 60_000);

  it.runIf(existsSync(LOTS) && existsSync(COMPS) && process.env.TRIAGE_REPORT)("prints inventory counts", () => {
    const lots = (JSON.parse(readFileSync(LOTS, "utf8")) as LotsFile).lots;
    const file = JSON.parse(readFileSync(COMPS, "utf8")) as CompsFile;
    const out = {
      current: triageCounts(lots, "current", file),
      "bill-2025-1545": triageCounts(lots, "bill-2025-1545", file),
      "current (rent)": triageCounts(lots, "current", file, { mode: "rent" }),
      "current (no comps)": triageCounts(lots, "current", null),
      "current ($195/sf)": triageCounts(lots, "current", file, { hardCostPerSf: 195 }),
      "current (15% target)": triageCounts(lots, "current", file, { targetMarginPct: 15 }),
      ...Object.fromEntries(TYPES.map((t) => [`current, ${t} selected`, triageCounts(lots, "current", file, undefined, t)])),
    };
    process.stdout.write(`\nTRIAGE ${JSON.stringify(out)}\n`);
  }, 120_000);
});
