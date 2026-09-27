// The one seam between the Reform UI and the levers engine (src/lib/levers.ts). The engine returns aggregates;
// the map needs a per-lot outcome, which lotScreen derives with the same registry and candidate rule.
import type { Check, Comps, Finding, LeverResult, Lot, RuleParams, RulePreset, RuleSet, Typology, Verdict } from "@/lib/types";
import type { FinanceAssumptions } from "@/lib/finance";
import { BILL_PARAMS, DISTRICTS, TODAY_PARAMS, TYPOLOGY_ORDER, buildRegistry, evaluateLot, sameParams, type Registry } from "@/lib/engine";
import { isCandidateLot } from "@/lib/plan";
import { PRESETS, runCustom as runCustomEngine, runLevers } from "@/lib/levers";

export { PRESETS, runLevers, TODAY_PARAMS, sameParams };
export type { LeverResult, RuleParams, RulePreset };
export type SubKey = keyof RuleParams["minLotArea"];

/** One LeverResult for the params: a preset's own row when they match one, else the engine's custom run. */
export function runScenario(params: RuleParams, lots: Lot[], comps: (Comps | null)[], assumptions: FinanceAssumptions, label: string): LeverResult {
  const preset = PRESETS.find((p) => sameParams(p.params, params));
  return preset ? runLevers(lots, comps, assumptions, [preset])[0] : runCustomEngine(params, lots, comps, assumptions, label);
}

const registries = new WeakMap<RuleParams, { ruleSet: RuleSet; registry: Registry }>();
function registryFor(p: RuleParams): { ruleSet: RuleSet; registry: Registry } {
  if (sameParams(p, TODAY_PARAMS)) return { ruleSet: "current", registry: DISTRICTS.current };
  if (sameParams(p, BILL_PARAMS)) return { ruleSet: "bill-2025-1545", registry: DISTRICTS["bill-2025-1545"] };
  let r = registries.get(p);
  if (!r) registries.set(p, (r = { ruleSet: "current", registry: buildRegistry(p, "current") }));
  return r;
}

export interface LotScreen {
  /** At least one home type is allowed by the use table and lot-size standards (and LNC FAR). */
  allowed: boolean;
  /** Allowed, and a candidate for staff review (isCandidateLot). */
  candidate: boolean;
  /** Not allowed, and at least one home type needs dimensional relief. */
  relief: boolean;
  byType: Partial<Record<Typology, boolean>>;
}

/** Every home type's finding for one lot under the params: evaluateLot with buildRegistry(params). */
export function lotFindings(lot: Lot, p: RuleParams): Finding[] {
  const { ruleSet, registry } = registryFor(p);
  return evaluateLot(lot, ruleSet, registry);
}

/** One lot under the params: evaluateLot with buildRegistry(params), the same rule the levers engine counts. */
export function lotScreen(lot: Lot, p: RuleParams): LotScreen {
  return screenOf(lot, lotFindings(lot, p));
}

function screenOf(lot: Lot, fs: Finding[]): LotScreen {
  const byType: Partial<Record<Typology, boolean>> = {};
  for (const f of fs) byType[f.typology] = f.verdict === "by-right";
  const allowed = fs.some((f) => f.verdict === "by-right");
  return { allowed, candidate: allowed && isCandidateLot(lot, fs, null), relief: !allowed && fs.some((f) => f.verdict === "variance"), byType };
}

export const TODAY_ID = "today";
export const BILL_ID = "bill-2025-1545";
export const CUSTOM_ID = "custom";

/** A lever label that never wraps between "(§" and its section number or before "(§". */
export const leverLabel = (label: string) => label.replace(/ \(§ /g, "\u00a0(§\u00a0").replace(/§ /g, "§\u00a0");

export const presetById = (id: string): RulePreset | null => PRESETS.find((p) => p.id === id) ?? null;

/** A lot's scenario outcome against today, as the map colors it. */
export type LotShift = "same" | "newly-allowed" | "newly-candidate" | "lost";
export const SHIFT_CODE: Record<LotShift, number> = { same: 0, "newly-allowed": 1, "newly-candidate": 2, lost: 3 };
export const SHIFT_ORDER: LotShift[] = ["newly-candidate", "newly-allowed", "lost", "same"];

export type Screen = ReturnType<typeof lotScreen>;

export function screenAll(lots: Lot[], params: RuleParams): Screen[] {
  return lots.map((l) => lotScreen(l, params));
}

export function shiftOf(now: Screen, base: Screen): LotShift {
  if (now.candidate && !base.candidate) return "newly-candidate";
  if (now.allowed && !base.allowed) return "newly-allowed";
  if (!now.allowed && base.allowed) return "lost";
  return "same";
}

export function shiftCodes(now: Screen[], base: Screen[]): Uint8Array {
  const out = new Uint8Array(now.length);
  for (let i = 0; i < now.length; i++) out[i] = SHIFT_CODE[shiftOf(now[i], base[i])];
  return out;
}

/** The id a set of params matches, or "custom". */
export function matchPreset(p: RuleParams): string {
  return PRESETS.find((x) => sameParams(x.params, p))?.id ?? CUSTOM_ID;
}

/** URL codec for custom params: base64 of the JSON, validated on the way in. */
export function encodeParams(p: RuleParams): string {
  return btoa(JSON.stringify(p)).replace(/=+$/, "");
}

const SUBS: SubKey[] = ["VL", "L", "M", "H", "VH"];
const areaOk = (v: unknown) => v === null || (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100_000);

export function decodeParams(raw: string | null): RuleParams | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(atob(raw)) as Partial<RuleParams>;
    const m = o.minLotArea as Record<string, unknown> | undefined;
    if (!m || !SUBS.every((k) => areaOk(m[k]))) return null;
    if (!areaOk(o.hillsideMinLot) || o.hillsideMinLot == null || !areaOk(o.r1dAttachedWidthCap) || o.r1dAttachedWidthCap == null) return null;
    const bools = ["twoUnitInR1", "threeUnitInR2", "aduByRight", "parkingMinimums"] as const;
    if (!bools.every((k) => typeof o[k] === "boolean")) return null;
    return {
      minLotArea: { VL: m.VL as number | null, L: m.L as number | null, M: m.M as number | null, H: m.H as number | null, VH: m.VH as number | null },
      hillsideMinLot: o.hillsideMinLot,
      r1dAttachedWidthCap: o.r1dAttachedWidthCap,
      twoUnitInR1: o.twoUnitInR1!,
      threeUnitInR2: o.threeUnitInR2!,
      aduByRight: o.aduByRight!,
      parkingMinimums: o.parkingMinimums!,
    };
  } catch {
    return null;
  }
}

/** A check whose requirement or result differs between today and the scenario, for one home type. */
export interface ChangedCheck {
  id: string;
  label: string;
  measured: string | null;
  required: string | null;
  requiredToday: string | null;
  passed: boolean | null;
  passedToday: boolean | null;
}

/** One lot, today against the scenario: the map's shift plus the home type and checks that moved. */
export interface LotComparison {
  shift: LotShift;
  now: LotScreen;
  base: LotScreen;
  /** The home type the comparison reads: the first whose by-right result changed, else the first allowed today. */
  typology: Typology | null;
  verdict: Verdict | null;
  verdictToday: Verdict | null;
  checks: ChangedCheck[];
  /** Home types newly allowed (by right) under the scenario, and those no longer allowed. */
  gainedTypes: Typology[];
  lostTypes: Typology[];
}

const sameCheck = (a: Check, b: Check) => a.passed === b.passed && a.required === b.required;

export function compareLot(lot: Lot, p: RuleParams): LotComparison {
  const fs = lotFindings(lot, p);
  const f0 = lotFindings(lot, TODAY_PARAMS);
  const now = screenOf(lot, fs);
  const base = screenOf(lot, f0);
  const byRight = (f: Finding | undefined) => f?.verdict === "by-right";
  const gainedTypes: Typology[] = [];
  const lostTypes: Typology[] = [];
  for (const t of TYPOLOGY_ORDER) {
    const a = fs.find((f) => f.typology === t);
    const b = f0.find((f) => f.typology === t);
    if (byRight(a) && !byRight(b)) gainedTypes.push(t);
    if (!byRight(a) && byRight(b)) lostTypes.push(t);
  }
  const typology =
    gainedTypes[0] ??
    lostTypes[0] ??
    TYPOLOGY_ORDER.find((t) => fs.find((f) => f.typology === t)?.verdict !== f0.find((f) => f.typology === t)?.verdict) ??
    TYPOLOGY_ORDER.find((t) => byRight(f0.find((f) => f.typology === t))) ??
    null;
  const f = typology ? fs.find((x) => x.typology === typology) : undefined;
  const g = typology ? f0.find((x) => x.typology === typology) : undefined;
  const checks: ChangedCheck[] = [];
  if (f && g) {
    for (const c of f.checks) {
      const c0 = g.checks.find((x) => x.id === c.id);
      if (!c0 || sameCheck(c, c0)) continue;
      checks.push({ id: c.id, label: c.label, measured: c.measured, required: c.required, requiredToday: c0.required, passed: c.passed, passedToday: c0.passed });
    }
  }
  return { shift: shiftOf(now, base), now, base, typology, verdict: f?.verdict ?? null, verdictToday: g?.verdict ?? null, checks, gainedTypes, lostTypes };
}
