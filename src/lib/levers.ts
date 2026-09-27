// Reform levers: what one hypothetical zoning parameter change does to the public-lot screen (docs/reform.md).
// Pure; runs in the Web Worker (evalCompute.ts "reform" request) and in tests.
import type { Citation, Comps, LeverResult, Lot, RulePreset, RuleParams, RuleSet, Typology } from "./types";
import { BILL_PARAMS, BILL_URL, buildRegistry, DISTRICTS, normalizeZone, sameParams, TODAY_PARAMS, TYPOLOGY_ORDER, evaluateLot, type DistrictFamily, type Registry } from "./rules";
import { triageLot } from "./triage";
import { pickFinding } from "./evidence";
import { isCandidateLot } from "./plan";
import type { FinanceAssumptions } from "./proforma";

const code = (section: string, title: string, url: string): Citation => ({ section, title, url, ruleSet: "current" });

const withMinLot = (sub: keyof RuleParams["minLotArea"], value: number): RuleParams => ({
  ...TODAY_PARAMS,
  minLotArea: { ...TODAY_PARAMS.minLotArea, [sub]: value },
});

/** Today, the bill, and single-knob levers. Each lever edits one parameter of today's code and nothing else. */
export const PRESETS: RulePreset[] = [
  {
    id: "today",
    label: "Today's code",
    params: TODAY_PARAMS,
    note: "Title Nine as encoded: the baseline every lever is compared with.",
  },
  {
    id: "bill-2025-1545",
    label: "Bill 2025-1545 (substitute)",
    params: BILL_PARAMS,
    note: "Up to two ADUs by right on any residential lot and no parking minimums; lot sizes and the use table unchanged.",
    citation: { section: "Bill 2025-1545 §§ 37, 40", title: "Substitute bill, June 2, 2026, corrected July 24, 2026", url: BILL_URL, ruleSet: "bill-2025-1545" },
  },
  {
    id: "min-lot-L-1800",
    label: "Minimum lot size L 3,000 → 1,800 (§ 903.03.B.2)",
    params: withMinLot("L", 1800),
    note: "Low-Density subdistricts (R1D-L, R1A-L, R2-L, R3-L, RM-L) at 1,800 sq ft.",
    citation: code("§ 903.03.B.2", "Low-Density Subdistrict site development standards", "https://ecode360.com/45474231"),
  },
  {
    id: "min-lot-M-1500",
    label: "Minimum lot size M 2,400 → 1,500 (§ 903.03.C.2)",
    params: withMinLot("M", 1500),
    note: "Moderate-Density subdistricts at 1,500 sq ft.",
    citation: code("§ 903.03.C.2", "Moderate Density Subdistrict site development standards", "https://ecode360.com/45474237"),
  },
  {
    id: "min-lot-H-900",
    label: "Minimum lot size H 1,200 → 900 (§ 903.03.D.2)",
    params: withMinLot("H", 900),
    note: "High-Density subdistricts at 900 sq ft. Our 1,000 sf screening floor still applies to candidates.",
    citation: code("§ 903.03.D.2", "High Density Subdistrict site development standards", "https://ecode360.com/45474243"),
  },
  {
    id: "hillside-2000",
    label: "Hillside minimum 3,200 → 2,000 (§ 905.02.C)",
    params: { ...TODAY_PARAMS, hillsideMinLot: 2000 },
    note: "H district minimum lot size at 2,000 sq ft. Hillside homes still need an Administrator or Special Exception, so none becomes allowed by right.",
    citation: code("§ 905.02.C", "H, Hillside District site development standards", "https://ecode360.com/45474542#45474559"),
  },
  {
    id: "two-unit-r1",
    label: "Two-unit by right in R1D/R1A (§ 911.02)",
    params: { ...TODAY_PARAMS, twoUnitInR1: true },
    note: "Two-Unit Residential moves from N to P in the R1D and R1A use-table columns.",
    citation: code("§ 911.02", "Use Table — Two-Unit Residential", "https://ecode360.com/45476524"),
  },
  {
    id: "three-unit-r2",
    label: "Three-unit by right in R2 (§ 911.02)",
    params: { ...TODAY_PARAMS, threeUnitInR2: true },
    note: "Three-Unit Residential moves from N to P in the R2 use-table column.",
    citation: code("§ 911.02", "Use Table — Three-Unit Residential", "https://ecode360.com/45476524"),
  },
  {
    id: "adu-by-right",
    label: "ADUs by right citywide (§ 912.08)",
    params: { ...TODAY_PARAMS, aduByRight: true },
    note: "The bill's ADU text alone: up to two ADUs by right on any residential lot, no owner occupancy.",
    citation: code("§ 912.08", "Accessory Dwelling Unit Overlay District", "https://ecode360.com/45477814"),
  },
  {
    id: "no-parking-min",
    label: "No parking minimums (§ 914.02.A)",
    params: { ...TODAY_PARAMS, parkingMinimums: false },
    note: "The bill's parking text alone: Schedule A minimums struck.",
    citation: code("§ 914.02.A", "Parking Schedule A", "https://ecode360.com/45478031"),
  },
];

export const presetById = (id: string): RulePreset | undefined => PRESETS.find((p) => p.id === id);

const FAMILIES: DistrictFamily[] = ["R1D", "R1A", "R2", "R3", "RM", "LNC", "H"];
const TOP_NEIGHBORHOODS = 10;

/** The prebuilt registry when the params are exactly today's or the bill's; otherwise a fresh custom one. */
function registryFor(params: RuleParams): { ruleSet: RuleSet; registry: Registry } {
  if (sameParams(params, TODAY_PARAMS)) return { ruleSet: "current", registry: DISTRICTS.current };
  if (sameParams(params, BILL_PARAMS)) return { ruleSet: "bill-2025-1545", registry: DISTRICTS["bill-2025-1545"] };
  return { ruleSet: "current", registry: buildRegistry(params, "current") };
}

/** Per-lot rule outcome: bit i set when TYPOLOGY_ORDER[i] is allowed by right; candidate for staff review. */
interface Screen {
  mask: Uint8Array;
  candidate: Uint8Array;
  family: (DistrictFamily | null)[];
  clearing: number;
  parkingUnresolved: number;
}

function screen(lots: Lot[], comps: (Comps | null)[], assumptions: FinanceAssumptions, params: RuleParams): Screen {
  const { ruleSet, registry } = registryFor(params);
  const n = lots.length;
  const out: Screen = { mask: new Uint8Array(n), candidate: new Uint8Array(n), family: new Array(n), clearing: 0, parkingUnresolved: 0 };
  for (let i = 0; i < n; i++) {
    const lot = lots[i];
    out.family[i] = registry[normalizeZone(lot.zone)]?.family ?? null;
    const fs = evaluateLot(lot, ruleSet, registry);
    let m = 0;
    for (let t = 0; t < fs.length; t++) if (fs[t].verdict === "by-right") m |= 1 << t;
    out.mask[i] = m;
    if (m === 0 || !isCandidateLot(lot, fs, null)) continue;
    out.candidate[i] = 1;
    // The same triage the Lots and Plan tabs run: its proposal, its financial result.
    const tr = triageLot(lot, fs, comps[i] ?? null, assumptions, null);
    if (tr.pencils) out.clearing++;
    if (pickFinding(fs, tr, null).unresolved.includes("parking")) out.parkingUnresolved++;
  }
  return out;
}

/**
 * Today's per-lot outcome depends only on the lots, comps and finance inputs; reuse it across custom runs.
 * Assumptions compare by value: each worker request carries a fresh structured clone.
 */
const baselines = new WeakMap<Lot[], { comps: (Comps | null)[]; assumptions: string; screen: Screen }>();

function baseline(lots: Lot[], comps: (Comps | null)[], assumptions: FinanceAssumptions): Screen {
  const key = JSON.stringify(assumptions);
  const hit = baselines.get(lots);
  if (hit && hit.comps === comps && hit.assumptions === key) return hit.screen;
  const s = screen(lots, comps, assumptions, TODAY_PARAMS);
  baselines.set(lots, { comps, assumptions: key, screen: s });
  return s;
}

function aggregate(preset: Pick<RulePreset, "id" | "label">, lots: Lot[], s: Screen, today: Screen): LeverResult {
  let allowed = 0;
  let newly = 0;
  let lost = 0;
  let candidates = 0;
  let candidatesNewly = 0;
  const typologyDelta = Object.fromEntries(TYPOLOGY_ORDER.map((t) => [t, 0])) as Record<Typology, number>;
  const hoods = new Map<string, { allowed: number; newlyAllowed: number }>();
  const fams = new Map<DistrictFamily, { allowed: number; newlyAllowed: number }>(FAMILIES.map((f) => [f, { allowed: 0, newlyAllowed: 0 }]));
  for (let i = 0; i < lots.length; i++) {
    const m = s.mask[i];
    const m0 = today.mask[i];
    for (let t = 0; t < TYPOLOGY_ORDER.length; t++) typologyDelta[TYPOLOGY_ORDER[t]] += ((m >> t) & 1) - ((m0 >> t) & 1);
    const isNew = m !== 0 && m0 === 0;
    if (m === 0 && m0 !== 0) lost++;
    if (s.candidate[i]) {
      candidates++;
      if (!today.candidate[i]) candidatesNewly++;
    }
    if (m === 0) continue;
    allowed++;
    if (isNew) newly++;
    const name = lots[i].neighborhood;
    const h = hoods.get(name) ?? { allowed: 0, newlyAllowed: 0 };
    h.allowed++;
    if (isNew) h.newlyAllowed++;
    hoods.set(name, h);
    const f = s.family[i] ? fams.get(s.family[i]!) : undefined;
    if (f) {
      f.allowed++;
      if (isNew) f.newlyAllowed++;
    }
  }
  const byNeighborhood = [...hoods]
    .map(([name, h]) => ({ name, ...h }))
    .sort((a, b) => b.newlyAllowed - a.newlyAllowed || b.allowed - a.allowed || a.name.localeCompare(b.name))
    .slice(0, TOP_NEIGHBORHOODS);
  return {
    presetId: preset.id,
    label: preset.label,
    publicLotsAllowed: allowed,
    publicLotsNewlyAllowed: newly,
    publicLotsNoLongerAllowed: lost,
    candidates,
    candidatesNewly,
    clearingCostScreen: s.clearing,
    parkingUnresolved: s.parkingUnresolved,
    typologyDelta,
    byNeighborhood,
    byDistrictFamily: FAMILIES.map((family) => ({ family, ...fams.get(family)! })),
  };
}

/** One LeverResult per preset over every lot, each compared with today's code under the same finance inputs. */
export function runLevers(
  lots: Lot[],
  comps: (Comps | null)[],
  assumptions: FinanceAssumptions,
  presets: RulePreset[] = PRESETS,
): LeverResult[] {
  const today = baseline(lots, comps, assumptions);
  return presets.map((p) => aggregate(p, lots, sameParams(p.params, TODAY_PARAMS) ? today : screen(lots, comps, assumptions, p.params), today));
}

/** The UI's custom knobs: one LeverResult with presetId "custom". */
export function runCustom(params: RuleParams, lots: Lot[], comps: (Comps | null)[], assumptions: FinanceAssumptions, label = "Custom"): LeverResult {
  return runLevers(lots, comps, assumptions, [{ id: "custom", label, params, note: "" }])[0];
}
