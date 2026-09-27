// How a validated tool call changes the app's state, how one change is undone, and the chip text for it.
// Pure: ByRightApp reads its state into an AskState, applies, and writes the difference back through its setters.
import type { RuleParams, RuleSet, Triage, Typology } from "@/lib/types";
import { TYPOLOGY_LABEL } from "@/lib/types";
import type { StatusGroup } from "@/lib/ranking";
import type { FinanceAssumptions } from "@/lib/proforma";
import { BILL_PARAMS, sameParams, TODAY_PARAMS } from "@/lib/rules";
import { PRESETS } from "@/lib/levers";
import type { ExplainTopic, RulePatch, StatusArg, Subdistrict, TabArg, ToolCall } from "./tools";

/** The part of the app's state Ask ByRight may change. */
export interface AskState {
  neighborhoods: string[];
  homeType: Typology | "";
  status: StatusGroup | "";
  triage: Triage | "";
  /** The Lots tab's code (the header toggle). */
  ruleSet: RuleSet;
  tab: TabArg;
  /** The Reform tab's scenario: a preset id or "custom". */
  reform: { presetId: string; params: RuleParams };
  finance: FinanceAssumptions;
  lotId: string | null;
}

export type Slice = keyof AskState;

/** One applied call: the state before and after it, and which slices it changed (empty when it changed none). */
export interface Applied {
  action: ToolCall;
  before: AskState;
  after: AskState;
  changed: Slice[];
}

const CUSTOM = "custom";

export const STATUS_OF: Record<StatusArg, StatusGroup | ""> = {
  any: "",
  "for-sale": "Available for Sale",
  pending: "Sale Pending",
  hold: "Hold for Study",
  permanent: "Permanent City Ownership",
  other: "other",
};

export const EXPLAIN_LABEL: Record<ExplainTopic, string> = {
  "green-policy": "what Green requires",
  "finance-gate": "the cost screen",
  "district-unconfirmed": "unconfirmed districts",
  lever: "the active lever",
  "how-screened": "how lots are screened",
};

/** "Minimum lot size L 3,000 → 1,800 (§ 903.03.B.2)" → "Minimum lot size L 3,000 → 1,800". */
const shortLabel = (label: string) => label.replace(/\s*\(§[^)]*\)\s*$/, "");

function presetMatching(p: RuleParams): string {
  return PRESETS.find((x) => sameParams(x.params, p))?.id ?? CUSTOM;
}

function mergeParams(p: RuleParams, patch: RulePatch): RuleParams {
  const { minLotArea, ...rest } = patch;
  return { ...p, ...rest, minLotArea: { ...p.minLotArea, ...(minLotArea ?? {}) } };
}

/** The scenario the answer is computed under: the Reform scenario on the Reform tab, else the header's code. */
export function scenarioOf(s: AskState): { params: RuleParams; label: string } {
  if (s.tab === "reform") {
    const p = PRESETS.find((x) => x.id === s.reform.presetId);
    return { params: s.reform.params, label: s.reform.presetId === CUSTOM || !p ? "Custom scenario" : shortLabel(p.label) };
  }
  return s.ruleSet === "bill-2025-1545"
    ? { params: BILL_PARAMS, label: shortLabel(PRESETS.find((x) => x.id === "bill-2025-1545")!.label) }
    : { params: TODAY_PARAMS, label: "Today's code" };
}

function withTab(s: AskState, tab: TabArg): AskState {
  // Entering Reform closes the lot (ByRightApp.onTab does the same).
  return tab === "reform" && s.tab !== "reform" ? { ...s, tab, lotId: null } : { ...s, tab };
}

export function applyAction(s: AskState, a: ToolCall): AskState {
  switch (a.tool) {
    case "open_tab":
      return withTab(s, a.tab);
    case "set_scenario": {
      if (a.preset === "today") return { ...s, ruleSet: "current", reform: { presetId: "today", params: TODAY_PARAMS } };
      if (a.preset === "bill-2025-1545") return { ...s, ruleSet: "bill-2025-1545", reform: { presetId: a.preset, params: BILL_PARAMS } };
      const p = PRESETS.find((x) => x.id === a.preset);
      return p ? withTab({ ...s, reform: { presetId: p.id, params: p.params } }, "reform") : s;
    }
    case "set_rule_params": {
      const params = mergeParams(s.reform.params, a.params);
      return withTab({ ...s, reform: { presetId: presetMatching(params), params } }, "reform");
    }
    case "set_neighborhoods":
      return { ...s, neighborhoods: a.names };
    case "set_home_type":
      return { ...s, homeType: a.type === "any" ? "" : a.type };
    case "set_status":
      return { ...s, status: STATUS_OF[a.status] };
    case "set_triage":
      return { ...s, triage: a.triage === "any" ? "" : a.triage };
    case "set_finance":
      return { ...s, finance: { ...s.finance, ...a.finance } };
    case "select_lot":
      return a.lotId ? { ...s, lotId: a.lotId } : s;
    case "explain":
      return s;
  }
}

const SLICES: Slice[] = ["neighborhoods", "homeType", "status", "triage", "ruleSet", "tab", "reform", "finance", "lotId"];
const same = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y);

/** Applies the calls in order; each Applied records what it changed so it can be undone on its own. */
export function applyAll(start: AskState, actions: ToolCall[]): { state: AskState; applied: Applied[] } {
  let state = start;
  const applied: Applied[] = [];
  for (const action of actions) {
    const after = applyAction(state, action);
    applied.push({ action, before: state, after, changed: SLICES.filter((k) => !same(state[k], after[k])) });
    state = after;
  }
  return { state, applied };
}

/** The current state with the slices one call changed put back as they were before it. */
export function undoApplied(current: AskState, a: Applied): AskState {
  const next = { ...current } as Record<Slice, unknown>;
  for (const k of a.changed) next[k] = a.before[k];
  return next as unknown as AskState;
}

/** The view as the model sees it: filters, scenario id, tab and three finance inputs. No lot, no lot data. */
export function compactAskState(s: AskState) {
  const status = (Object.keys(STATUS_OF) as StatusArg[]).find((k) => k !== "any" && STATUS_OF[k] === s.status) ?? "any";
  return {
    neighborhoods: s.neighborhoods,
    homeType: s.homeType || "any",
    status,
    triage: s.triage || "any",
    scenario: s.tab === "reform" ? s.reform.presetId : s.ruleSet === "bill-2025-1545" ? "bill-2025-1545" : "today",
    tab: s.tab,
    finance: { hardCostPerSf: s.finance.hardCostPerSf, siteCostPerProject: s.finance.siteCostPerProject, targetMarginPct: s.finance.targetMarginPct, mode: s.finance.mode },
  };
}

// ---- Chip text -------------------------------------------------------------------------------------------

const NUM = new Intl.NumberFormat("en-US");
const sf = (n: number | null) => (n == null ? "none" : NUM.format(n));
const onOff = (b: boolean) => (b ? "on" : "off");

const BOOL_LABEL = {
  twoUnitInR1: "Two-unit by right in R1D/R1A",
  threeUnitInR2: "Three-unit by right in R2",
  aduByRight: "ADUs by right citywide",
  parkingMinimums: "Parking minimums",
} as const;

/** What moved between two parameter sets, in lever wording: "Minimum lot size L 3,000 → 1,800". */
export function paramChanges(from: RuleParams, to: RuleParams): string[] {
  const out: string[] = [];
  for (const k of Object.keys(from.minLotArea) as Subdistrict[])
    if (from.minLotArea[k] !== to.minLotArea[k]) out.push(`Minimum lot size ${k} ${sf(from.minLotArea[k])} → ${sf(to.minLotArea[k])}`);
  if (from.hillsideMinLot !== to.hillsideMinLot) out.push(`Hillside minimum ${sf(from.hillsideMinLot)} → ${sf(to.hillsideMinLot)}`);
  if (from.r1dAttachedWidthCap !== to.r1dAttachedWidthCap) out.push(`R1D attached width cap ${from.r1dAttachedWidthCap} → ${to.r1dAttachedWidthCap} ft`);
  for (const k of Object.keys(BOOL_LABEL) as (keyof typeof BOOL_LABEL)[])
    if (from[k] !== to[k]) out.push(`${BOOL_LABEL[k]}: ${onOff(from[k])} → ${onOff(to[k])}`);
  return out;
}

const money = (n: number) => `$${NUM.format(n)}`;

export function chipLabel({ action: a, before, after }: Applied): string {
  switch (a.tool) {
    case "open_tab":
      return `Tab: ${a.tab[0].toUpperCase()}${a.tab.slice(1)}`;
    case "set_scenario":
      return `Scenario: ${a.preset === "today" ? "Today's code" : shortLabel(PRESETS.find((p) => p.id === a.preset)?.label ?? a.preset)}`;
    case "set_rule_params": {
      const id = after.reform.presetId;
      if (id !== CUSTOM && id !== "today") return `Scenario: ${shortLabel(PRESETS.find((p) => p.id === id)!.label)}`;
      const moved = paramChanges(before.reform.params, after.reform.params);
      return `Scenario: ${moved.length ? moved.join("; ") : "no change"}`;
    }
    case "set_neighborhoods":
      return `Neighborhoods: ${a.names.length ? a.names.join(", ") : "all"}`;
    case "set_home_type":
      return `Home type: ${a.type === "any" ? "any" : TYPOLOGY_LABEL[a.type]}`;
    case "set_status":
      return `Status: ${a.status === "any" ? "any" : a.status === "other" ? "Other" : STATUS_OF[a.status]}`;
    case "set_triage":
      return `Triage: ${a.triage === "any" ? "any" : `${a.triage[0].toUpperCase()}${a.triage.slice(1)}`}`;
    case "set_finance": {
      const f0 = before.finance;
      const f1 = after.finance;
      const parts: string[] = [];
      if (a.finance.hardCostPerSf !== undefined) parts.push(`Hard cost: ${money(f0.hardCostPerSf)} → ${money(f1.hardCostPerSf)}/sf`);
      if (a.finance.siteCostPerProject !== undefined) parts.push(`Site cost: ${money(f0.siteCostPerProject)} → ${money(f1.siteCostPerProject)}`);
      if (a.finance.targetMarginPct !== undefined) parts.push(`Target return: ${f0.targetMarginPct}% → ${f1.targetMarginPct}%`);
      if (a.finance.mode !== undefined) parts.push(`Value: ${f0.mode} → ${f1.mode}`);
      return parts.join("; ");
    }
    case "select_lot":
      return a.lotId ? `Lot: ${a.query}` : `Lot: no match for “${a.query}”`;
    case "explain":
      return `Explain: ${EXPLAIN_LABEL[a.topic]}`;
  }
}
