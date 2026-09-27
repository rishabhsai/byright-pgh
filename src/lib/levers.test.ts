import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CompsFile, Lot, LotsFile } from "./types";
import { compsFor, DEFAULT_FINANCE } from "./finance";
import { presetById, PRESETS, runCustom, runLevers } from "./levers";
import { handleReformRequest, type EvalWorkerState, type ReformRequest, type ReformResponse } from "./evalCompute";
import { NEW_CONSTRUCTION_PREMIUM } from "./proforma";
import { TODAY_PARAMS, TYPOLOGY_ORDER } from "./rules";

const lot = (id: string, o: Partial<Lot>): Lot => ({
  id,
  address: `${id} Test St`,
  neighborhood: "Alpha",
  councilDistrict: "1",
  ward: "1",
  lat: 40.44,
  lon: -79.99,
  zone: "R1D-L",
  zoneMap: "R1D-L",
  zoneAgrees: true,
  lotAreaSqFt: 2000,
  frontageFt: 25,
  landValue: 1000,
  status: "Available for Sale",
  inventoryType: "Vacant Lot",
  hazards: { steepSlope: false, undermined: false, floodZone: false },
  ...o,
});

describe("runCustom on hand-built lots", () => {
  // Under today's R1D-L minimum (3,000 sf): only b is allowed. With L at 1,800: a and b; c (1,500 sf) still fails.
  const lots = [
    lot("a", {}),
    lot("b", { lotAreaSqFt: 4000, neighborhood: "Beta" }),
    lot("c", { lotAreaSqFt: 1500 }),
    lot("d", { zone: "GI", neighborhood: "Beta" }),
  ];
  const comps = lots.map(() => null);
  const L1800 = { ...TODAY_PARAMS, minLotArea: { ...TODAY_PARAMS.minLotArea, L: 1800 } };

  it("counts allowed, newly allowed and candidates against today", () => {
    const r = runCustom(L1800, lots, comps, DEFAULT_FINANCE);
    expect(r.presetId).toBe("custom");
    expect(r.publicLotsAllowed).toBe(2);
    expect(r.publicLotsNewlyAllowed).toBe(1);
    expect(r.publicLotsNoLongerAllowed).toBe(0);
    expect(r.candidates).toBe(2);
    expect(r.candidatesNewly).toBe(1);
    expect(r.clearingCostScreen).toBe(0); // no comps, so nothing is screened
    expect(r.byNeighborhood).toEqual([
      { name: "Alpha", allowed: 1, newlyAllowed: 1 },
      { name: "Beta", allowed: 1, newlyAllowed: 0 },
    ]);
    expect(r.byDistrictFamily.find((f) => f.family === "R1D")).toEqual({ family: "R1D", allowed: 2, newlyAllowed: 1 });
    // Single and townhome become allowed on lot a; nothing else changes.
    expect(r.typologyDelta).toEqual({ single: 1, single_adu: 0, duplex: 0, triplex: 0, townhome: 1 });
  });

  it("today's params change nothing", () => {
    const r = runCustom(TODAY_PARAMS, lots, comps, DEFAULT_FINANCE);
    expect([r.publicLotsAllowed, r.publicLotsNewlyAllowed, r.candidatesNewly]).toEqual([1, 0, 0]);
  });
});

const LOTS = "public/data/lots.json";
const COMPS = "public/data/comps.json";
const haveData = existsSync(LOTS) && existsSync(COMPS);

describe.runIf(haveData)("levers over the City inventory", () => {
  const lots = haveData ? (JSON.parse(readFileSync(LOTS, "utf8")) as LotsFile).lots : [];
  const compsFile = haveData ? (JSON.parse(readFileSync(COMPS, "utf8")) as CompsFile) : null;
  const comps = lots.map((l) => compsFor(l, compsFile));
  const results = haveData ? runLevers(lots, comps, DEFAULT_FINANCE) : [];
  const by = (id: string) => results.find((r) => r.presetId === id)!;
  const today = () => by("today");

  it("runs every preset over all 11,338 lots", () => {
    expect(lots.length).toBe(11338);
    expect(results.map((r) => r.presetId)).toEqual(PRESETS.map((p) => p.id));
    expect(today().publicLotsNewlyAllowed).toBe(0);
    expect(today().candidatesNewly).toBe(0);
  });

  it("lowering L to 1,800 adds allowed lots and takes none away", () => {
    const r = by("min-lot-L-1800");
    expect(r.publicLotsNewlyAllowed).toBeGreaterThan(0);
    expect(r.publicLotsNoLongerAllowed).toBe(0);
    expect(r.publicLotsAllowed).toBe(today().publicLotsAllowed + r.publicLotsNewlyAllowed);
    expect(r.candidates).toBeGreaterThanOrEqual(today().candidates);
  });

  it("the bill moves no lot's best-type count; its effect is the ADU typology", () => {
    const r = by("bill-2025-1545");
    expect(r.publicLotsNewlyAllowed).toBe(0);
    expect(r.publicLotsAllowed).toBe(today().publicLotsAllowed);
    expect(r.typologyDelta.single_adu).toBeGreaterThan(0);
    expect({ ...r.typologyDelta, single_adu: 0 }).toEqual({ single: 0, single_adu: 0, duplex: 0, triplex: 0, townhome: 0 });
  });

  it("no parking minimums changes no allowed count but clears every unverified parking requirement", () => {
    const r = by("no-parking-min");
    expect(r.publicLotsAllowed).toBe(today().publicLotsAllowed);
    expect(r.publicLotsNewlyAllowed).toBe(0);
    expect(today().parkingUnresolved).toBeGreaterThan(0);
    expect(r.parkingUnresolved).toBe(0);
  });

  it("lists at most 10 neighborhoods, most newly allowed first", () => {
    for (const r of results) {
      expect(r.byNeighborhood.length).toBeLessThanOrEqual(10);
      const newly = r.byNeighborhood.map((h) => h.newlyAllowed);
      expect(newly).toEqual([...newly].sort((a, b) => b - a));
    }
    expect(by("min-lot-L-1800").byNeighborhood[0].newlyAllowed).toBeGreaterThan(0);
  });

  it("district families add up to the allowed count", () => {
    for (const r of results) {
      expect(r.byDistrictFamily.reduce((n, f) => n + f.allowed, 0)).toBe(r.publicLotsAllowed);
      expect(r.byDistrictFamily.reduce((n, f) => n + f.newlyAllowed, 0)).toBe(r.publicLotsNewlyAllowed);
    }
  });

  it("one custom run takes under 400 ms once today's baseline is cached", () => {
    const params = { ...TODAY_PARAMS, minLotArea: { ...TODAY_PARAMS.minLotArea, M: 1500 } };
    runCustom(params, lots, comps, DEFAULT_FINANCE); // warm the JIT
    // Best of three: a major GC after the ten-preset run above can land in any single timing.
    let ms = Infinity;
    let r = runCustom(params, lots, comps, DEFAULT_FINANCE);
    for (let k = 0; k < 3; k++) {
      const t = performance.now();
      r = runCustom(params, lots, comps, DEFAULT_FINANCE);
      ms = Math.min(ms, performance.now() - t);
    }
    console.log(`runCustom over ${lots.length} lots: ${ms.toFixed(0)} ms (best of 3)`);
    expect(r.publicLotsNewlyAllowed).toBe(by("min-lot-M-1500").publicLotsNewlyAllowed);
    expect(ms).toBeLessThan(400);
  });

  it("prints the lever table for docs/reform.md", () => {
    const premium = runLevers(lots, comps, { ...DEFAULT_FINANCE, valuePremium: NEW_CONSTRUCTION_PREMIUM });
    const d = (n: number) => (n > 0 ? `+${n}` : String(n));
    const rows = results.map(
      (r, i) =>
        `| ${r.label} | ${r.publicLotsAllowed} | ${r.publicLotsNewlyAllowed} | ${r.candidates} | ${r.candidatesNewly} | ${r.clearingCostScreen} | ${premium[i].clearingCostScreen} | ${r.parkingUnresolved} | ${TYPOLOGY_ORDER.map((t) => d(r.typologyDelta[t])).join(" / ")} |`,
    );
    console.log(
      [
        "| Preset | Allowed | Newly allowed | Candidates | Newly candidates | Clear cost screen | Clear at 1.3× | Parking unresolved | Δ house / +ADU / duplex / triplex / townhouse |",
        "|---|--:|--:|--:|--:|--:|--:|--:|---|",
        ...rows,
      ].join("\n"),
    );
    for (const r of results.filter((x) => x.publicLotsNewlyAllowed > 0)) {
      console.log(r.presetId, JSON.stringify(r.byNeighborhood.slice(0, 5)), JSON.stringify(r.byDistrictFamily.filter((f) => f.newlyAllowed)));
    }
  }, 60_000);
});

describe("worker reform request", () => {
  const lots = [lot("a", {}), lot("b", { lotAreaSqFt: 4000 }), lot("c", { lotAreaSqFt: 1500 })];
  const comps = lots.map(() => null);
  const run = (state: EvalWorkerState, req: Omit<ReformRequest, "kind" | "seq">) => {
    const out: ReformResponse[] = [];
    handleReformRequest(state, { kind: "reform", seq: 7, ...req }, (r) => out.push(structuredClone(r)));
    return out;
  };

  it("answers a preset id with that preset's LeverResult, using the lots and comps the worker already holds", () => {
    const state: EvalWorkerState = { lots, evals: null, comps };
    const [res] = run(state, { presetId: "min-lot-L-1800", assumptions: DEFAULT_FINANCE });
    expect(res.part).toBe("reform");
    if (res.part !== "reform") return;
    expect(res.seq).toBe(7);
    expect(res.result).toEqual(runLevers(lots, comps, DEFAULT_FINANCE, [presetById("min-lot-L-1800")!])[0]);
    expect(res.result.publicLotsNewlyAllowed).toBe(1);
  });

  it("answers custom params, and takes lots and comps on the request when the worker has none", () => {
    const state: EvalWorkerState = { lots: [], evals: null };
    const params = { ...TODAY_PARAMS, minLotArea: { ...TODAY_PARAMS.minLotArea, L: 1800 } };
    const [res] = run(state, { params, assumptions: DEFAULT_FINANCE, lots, comps });
    expect(res.part === "reform" && res.result.presetId).toBe("custom");
    expect(res.part === "reform" && res.result.publicLotsAllowed).toBe(2);
  });

  it("reports an unknown preset or missing lots as a reform-error", () => {
    expect(run({ lots, evals: null, comps }, { presetId: "nope", assumptions: DEFAULT_FINANCE })[0]).toMatchObject({ part: "reform-error", seq: 7 });
    expect(run({ lots: [], evals: null }, { presetId: "today", assumptions: DEFAULT_FINANCE })[0].part).toBe("reform-error");
  });
});
