// Ask ByRight's reply: composed by the app from the engine's own results, never by a model.
import type { Comps, Finding, Lot, RuleParams, Triage, Typology } from "@/lib/types";
import { TYPOLOGY_LABEL } from "@/lib/types";
import type { StatusGroup } from "@/lib/ranking";
import type { FinanceAssumptions } from "@/lib/proforma";
import { BILL_PARAMS, buildRegistry, DISTRICTS, evaluateLot, sameParams, TODAY_PARAMS, TYPOLOGY_ORDER, type Registry } from "@/lib/rules";
import { triageLot, GREEN_POLICY } from "@/lib/triage";
import { DISTRICT_OPEN_ITEM, FUNNEL_STAGES, isCandidateLot } from "@/lib/plan";
import { PRESETS } from "@/lib/levers";
import { paramChanges } from "./apply";
import type { ExplainTopic } from "./tools";

export interface Scenario {
  params: RuleParams;
  label: string;
}

export interface AnswerInput {
  lots: Lot[];
  comps: (Comps | null)[];
  assumptions: FinanceAssumptions;
  /** The lots in scope: the current filters without "only allowed", parks included (as the header counts). */
  inScope: boolean[];
  neighborhoods: string[];
  status: StatusGroup | "";
  triage: Triage | "";
  typology: Typology | null;
  scenario: Scenario;
}

const NUM = new Intl.NumberFormat("en-US");
const n = (x: number) => NUM.format(x);

const registries = new WeakMap<RuleParams, { ruleSet: "current" | "bill-2025-1545"; registry: Registry }>();
function registryFor(p: RuleParams) {
  if (sameParams(p, TODAY_PARAMS)) return { ruleSet: "current" as const, registry: DISTRICTS.current };
  if (sameParams(p, BILL_PARAMS)) return { ruleSet: "bill-2025-1545" as const, registry: DISTRICTS["bill-2025-1545"] };
  let r = registries.get(p);
  if (!r) registries.set(p, (r = { ruleSet: "current", registry: buildRegistry(p, "current") }));
  return r;
}

/** Every home type's finding for one lot under the params (the Reform tab's lotFindings). */
function findingsUnder(lot: Lot, p: RuleParams): Finding[] {
  const { ruleSet, registry } = registryFor(p);
  return evaluateLot(lot, ruleSet, registry);
}

const TYPE_PHRASE: Record<Typology, string> = {
  single: "a house",
  single_adu: "a house + backyard unit",
  duplex: "a duplex",
  triplex: "a triplex",
  townhome: "a townhouse",
};

function placeText(hoods: string[]): string {
  if (!hoods.length) return "the city";
  if (hoods.length === 1) return hoods[0];
  if (hoods.length <= 3) return `${hoods.slice(0, -1).join(", ")} and ${hoods[hoods.length - 1]}`;
  return `these ${hoods.length} neighborhoods`;
}

const STATUS_PHRASE: Record<StatusGroup, string> = {
  "Available for Sale": " recorded Available for Sale",
  "Sale Pending": " recorded Sale Pending",
  "Hold for Study": " recorded Hold for Study",
  "Permanent City Ownership": " recorded Permanent City Ownership",
  other: " with another inventory status",
};

/**
 * One sentence from the engine: how many lots in scope pass the use-table and lot-size screen (by right) for the
 * home type, or for any small type, under the scenario; the change against today's code; and how many of them are
 * candidates for staff review that clear the cost screen at the displayed assumptions.
 */
export function composeAnswer(a: AnswerInput): string {
  const isToday = sameParams(a.scenario.params, TODAY_PARAMS);
  const typIdx = a.typology ? TYPOLOGY_ORDER.indexOf(a.typology) : -1;
  const passes = (fs: Finding[]) => (typIdx >= 0 ? fs[typIdx]?.verdict === "by-right" : fs.some((f) => f.verdict === "by-right"));
  let now = 0,
    today = 0,
    clearing = 0,
    gaining = 0;
  const gainedTypes = new Map<Typology, number>();
  a.lots.forEach((lot, i) => {
    if (!a.inScope[i]) return;
    const fs = findingsUnder(lot, a.scenario.params);
    const base = isToday ? fs : findingsUnder(lot, TODAY_PARAMS);
    if (passes(base)) today++;
    if (!passes(fs)) return;
    now++;
    if (!isToday && typIdx < 0) {
      const gained = fs.filter((f, t) => f.verdict === "by-right" && base[t]?.verdict !== "by-right").map((f) => f.typology);
      if (gained.length) gaining++;
      for (const t of gained) gainedTypes.set(t, (gainedTypes.get(t) ?? 0) + 1);
    }
    if (isCandidateLot(lot, fs, a.typology) && triageLot(lot, fs, a.comps[i] ?? null, a.assumptions, a.typology).pencils) clearing++;
  });

  const head = isToday ? "Under today's code" : sameParams(a.scenario.params, BILL_PARAMS) ? `Under ${a.scenario.label}` : `Under the scenario ${a.scenario.label}`;
  const what = a.typology ? `${TYPE_PHRASE[a.typology]} passes` : "at least one small home type passes";
  const scope = `${a.status ? STATUS_PHRASE[a.status] : ""}${a.triage ? ` triaged ${a.triage[0].toUpperCase()}${a.triage.slice(1)}` : ""}`;
  const d = now - today;
  const delta = isToday ? "" : ` (${d < 0 ? "−" : "+"}${n(Math.abs(d))} vs today)`;
  const types = [...gainedTypes].sort((x, y) => y[1] - x[1]).map(([t]) => TYPOLOGY_LABEL[t]);
  const gains = gaining ? `, and ${n(gaining)} of them ${gaining === 1 ? "gains a home type it lacks" : "gain a home type they lack"} today (${types.join(", ")})` : "";
  const lotsWord = now === 1 ? "lot" : "lots";
  const cost = `${n(clearing)} of them ${clearing === 1 ? "clears" : "clear"} the cost screen at $${n(a.assumptions.hardCostPerSf)}/sf`;
  return `${head}, ${placeText(a.neighborhoods)} has ${n(now)} ${lotsWord}${scope} where ${what} the use-table and lot-size screen${delta}${gains}; ${cost}.`;
}

// ---- Fixed explanations ----------------------------------------------------------------------------------

export const FINANCE_GATE_TEXT =
  "The cost-and-return screen runs only when Use passes, Fit does not fail, the district is confirmed, the lot is recorded Available for Sale and disposition-eligible, and value comps exist for it. " +
  "Otherwise Finance reads Not screened with the reason, and the lot carries no margin or shortfall in any count or total. " +
  "A screened proposal clears the screen when the reference value covers what the pro forma needs for the target return; the gap otherwise is the modeled shortfall to target return, a screening estimate at editable assumptions.";

export const DISTRICT_UNCONFIRMED_TEXT = `${DISTRICT_OPEN_ITEM.detail} Until it is resolved, Use is Unknown, Finance is not screened, and the lot cannot be Green.`;

export const HOW_SCREENED_TEXT = `${FUNNEL_STAGES} Rules decide: every verdict and number comes from the encoded code tables, public data and arithmetic, never from a model.`;

const HYPOTHETICAL = "A hypothetical lever, compared with today's code; not the code.";

/** A fixed paragraph for the topic; "lever" describes the scenario in force from the preset registry. */
export function explainText(topic: ExplainTopic, scenario: Scenario): string {
  switch (topic) {
    case "green-policy":
      return GREEN_POLICY;
    case "finance-gate":
      return FINANCE_GATE_TEXT;
    case "district-unconfirmed":
      return DISTRICT_UNCONFIRMED_TEXT;
    case "how-screened":
      return HOW_SCREENED_TEXT;
    case "lever": {
      const p = scenario.params;
      if (sameParams(p, TODAY_PARAMS)) return "No lever is applied: this is today's code as encoded. Each lever on the Reform tab edits one zoning parameter and is compared with today's code.";
      const preset = PRESETS.find((x) => x.id !== "today" && sameParams(x.params, p));
      if (preset?.id === "bill-2025-1545") return `${scenario.label}: ${preset.note} Proposed; not adopted as of Sept 26, 2026.`;
      if (preset) return `${scenario.label}: ${preset.note} ${HYPOTHETICAL}`;
      return `${scenario.label}: ${paramChanges(TODAY_PARAMS, p).join("; ")}. ${HYPOTHETICAL}`;
    }
  }
}

// ---- Question or search? ---------------------------------------------------------------------------------

const ASK_WORDS = new Set(
  (
    "show find list what whats why which how where who can could should would is are does do if under explain compare set drop drops " +
    "lower raise open select filter only give tell pass passes passing allowed allow change changes happen lots homes houses duplex duplexes " +
    "triplex triplexes townhouse townhouses townhomes adu adus sale bill scenario green yellow red lever levers cost costs"
  ).split(" "),
);

/**
 * Whether ⌘K text is a request for Ask ByRight rather than an address search: it starts with "?", or ends with
 * "?" after a space, or has three or more words and one of them is a verb or a screening word.
 */
export function looksLikeQuestion(raw: string): boolean {
  const q = raw.trim();
  if (q.startsWith("?")) return q.length > 1;
  const words = q.toLowerCase().replace(/[^a-z0-9'\s-]/g, " ").split(/\s+/).filter(Boolean);
  if (q.endsWith("?") && words.length > 1) return true;
  return words.length >= 3 && words.some((w) => ASK_WORDS.has(w.replace(/'/g, "")));
}
