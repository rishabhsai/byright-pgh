// Ask ByRight's tool vocabulary: what a model may ask the app to do, and the guards every call passes before the
// app applies it. The model picks tools and arguments; it never supplies a number or a verdict the app shows.
// Pure (no Node or React imports): the route validates with it and the client reads its types.
import { PRESETS } from "@/lib/levers";
import { FINANCE_RANGES } from "@/lib/proforma";

/** Reform preset ids a set_scenario call may name. */
export const PRESET_IDS = PRESETS.map((p) => p.id);

const HILL_DISTRICT = ["Bedford Dwellings", "Crawford-Roberts", "Middle Hill", "Terrace Village", "Upper Hill"];
/** A word shared by more neighborhoods than this is too loose to pick from ("hill"). */
const MAX_WORD_MATCHES = 5;

/** Lowercase words: "Mt." and "Mt" read as "mount", "St." as "saint"; punctuation and hyphens are spaces. */
function normName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\bmt\b\.?/g, "mount")
    .replace(/\bst\b\.?/g, "saint")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^the /, "")
    .replace(/ (neighborhood|neighbourhood|area)$/, "");
}

function editDistance(a: string, b: string): number {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return d[b.length];
}

/**
 * The canonical neighborhood names one requested name stands for: an exact match (ignoring case, punctuation,
 * spacing and "Mt."/"Mount"), every neighborhood whose name contains it as whole words ("homewood" → the three
 * Homewoods), "Hill District" → its five neighborhoods, or a single near spelling. Empty when nothing fits.
 */
export function resolveNeighborhood(name: string, known: string[]): string[] {
  const q = normName(name);
  if (!q) return [];
  if (q === "hill district" || q === "hill") return q === "hill" ? [] : HILL_DISTRICT.filter((h) => known.includes(h));
  const names = known.map((k) => ({ k, n: normName(k) }));
  const exact = names.filter(({ n }) => n === q || n.replace(/ /g, "") === q.replace(/ /g, ""));
  if (exact.length) return [exact[0].k];
  const words = names.filter(({ n }) => ` ${n} `.includes(` ${q} `));
  if (words.length) return words.length <= MAX_WORD_MATCHES ? words.map(({ k }) => k).sort() : [];
  if (q.length < 5) return [];
  const limit = q.length < 8 ? 1 : 2;
  let best: string[] = [];
  let bestD = limit + 1;
  for (const { k, n } of names) {
    const dist = editDistance(q, n);
    if (dist < bestD) [best, bestD] = [[k], dist];
    else if (dist === bestD) best.push(k);
  }
  return best.length === 1 ? best : [];
}

// ---- Tool calls -------------------------------------------------------------------------------------------

export const HOME_TYPES = ["any", "single", "single_adu", "duplex", "triplex", "townhome"] as const;
export const STATUSES = ["any", "for-sale", "hold", "permanent", "pending", "other"] as const;
export const TRIAGES = ["any", "green", "yellow", "red", "gray"] as const;
export const TABS = ["lots", "plan", "reform"] as const;
export const EXPLAIN_TOPICS = ["green-policy", "finance-gate", "district-unconfirmed", "lever", "how-screened"] as const;
export const SUBDISTRICTS = ["VL", "L", "M", "H", "VH"] as const;

export type HomeTypeArg = (typeof HOME_TYPES)[number];
export type StatusArg = (typeof STATUSES)[number];
export type TriageArg = (typeof TRIAGES)[number];
export type TabArg = (typeof TABS)[number];
export type ExplainTopic = (typeof EXPLAIN_TOPICS)[number];
export type Subdistrict = (typeof SUBDISTRICTS)[number];

/** A partial RuleParams: only the knobs the Reform tab exposes, inside the ranges below. */
export interface RulePatch {
  minLotArea?: Partial<Record<Subdistrict, number>>;
  hillsideMinLot?: number;
  r1dAttachedWidthCap?: number;
  twoUnitInR1?: boolean;
  threeUnitInR2?: boolean;
  aduByRight?: boolean;
  parkingMinimums?: boolean;
}

export interface FinancePatch {
  hardCostPerSf?: number;
  siteCostPerProject?: number;
  targetMarginPct?: number;
  mode?: "sale" | "rent";
}

export type ToolCall =
  | { tool: "open_tab"; tab: TabArg }
  | { tool: "set_scenario"; preset: string }
  | { tool: "set_rule_params"; params: RulePatch }
  | { tool: "set_neighborhoods"; names: string[] }
  | { tool: "set_home_type"; type: HomeTypeArg }
  | { tool: "set_status"; status: StatusArg }
  | { tool: "set_triage"; triage: TriageArg }
  | { tool: "set_finance"; finance: FinancePatch }
  | { tool: "select_lot"; query: string; lotId: string | null }
  | { tool: "explain"; topic: ExplainTopic };

export type ToolName = ToolCall["tool"];

/** The order the app applies a set in: the tab and scenario first, then filters, then the lot, then text. */
export const APPLY_ORDER: ToolName[] = [
  "open_tab",
  "set_scenario",
  "set_rule_params",
  "set_neighborhoods",
  "set_home_type",
  "set_status",
  "set_triage",
  "set_finance",
  "select_lot",
  "explain",
];

/** Rule-lever ranges the model may set (sq ft, ft). */
export const RULE_RANGES = {
  minLotArea: { min: 0, max: 20_000 },
  hillsideMinLot: { min: 0, max: 20_000 },
  r1dAttachedWidthCap: { min: 10, max: 100 },
} as const;

/** The pro forma's accepted ranges for the inputs the model may set. */
export const FINANCE_LIMITS = {
  hardCostPerSf: FINANCE_RANGES.hardCostPerSf,
  siteCostPerProject: FINANCE_RANGES.siteCostPerProject,
  targetMarginPct: FINANCE_RANGES.targetMarginPct,
};

export const MAX_CALLS = 8;
const MAX_NAMES = 6;
const MAX_QUERY = 80;

// ---- JSON schemas (OpenAI-style function tools) -----------------------------------------------------------

const fn = (name: ToolName, description: string, properties: Record<string, unknown>, required: string[]) => ({
  type: "function" as const,
  function: { name, description, parameters: { type: "object", properties, required, additionalProperties: false } },
});
const range = (r: { min: number; max: number }, description: string) => ({ type: "number", minimum: r.min, maximum: r.max, description });

/** One schema per tool; `leverIds` are the Reform presets (PRESETS ids, including "today" and "bill-2025-1545"). */
export function toolSchemas(leverIds: string[]) {
  return [
    fn("set_neighborhoods", "Limit the lots to Pittsburgh neighborhoods. An empty list means citywide.", { names: { type: "array", items: { type: "string" }, maxItems: MAX_NAMES } }, ["names"]),
    fn("set_home_type", "Home type filter. single = house, single_adu = house plus backyard unit (ADU), townhome = townhouse / attached.", { type: { type: "string", enum: HOME_TYPES } }, ["type"]),
    fn("set_status", "City inventory status filter. for-sale = Available for Sale, pending = Sale Pending, hold = Hold for Study, permanent = Permanent City Ownership.", { status: { type: "string", enum: STATUSES } }, ["status"]),
    fn("set_triage", "Triage color filter (green = candidate for staff review that clears every screen).", { triage: { type: "string", enum: TRIAGES } }, ["triage"]),
    fn("set_scenario", "Which zoning code to screen with: today's code, the housing bill (Bill 2025-1545), or one named rule lever.", { preset: { type: "string", enum: leverIds } }, ["preset"]),
    fn(
      "set_rule_params",
      "A custom rule lever when no named lever fits. Send ONLY the parameters the request changes; omitted parameters keep their current values. Minimum lot sizes are per density subdistrict (VL, L, M, H, VH), in square feet.",
      {
        minLotArea: {
          type: "object",
          properties: Object.fromEntries(SUBDISTRICTS.map((s) => [s, range(RULE_RANGES.minLotArea, `${s} subdistrict minimum lot size, sq ft`)])),
          additionalProperties: false,
        },
        hillsideMinLot: range(RULE_RANGES.hillsideMinLot, "H (Hillside) district minimum lot size, sq ft"),
        r1dAttachedWidthCap: range(RULE_RANGES.r1dAttachedWidthCap, "R1D attached (townhouse) by-right lot width cap, ft"),
        twoUnitInR1: { type: "boolean", description: "Two-unit (duplex) by right in R1D and R1A" },
        threeUnitInR2: { type: "boolean", description: "Three-unit by right in R2" },
        aduByRight: { type: "boolean", description: "ADUs by right citywide" },
        parkingMinimums: { type: "boolean", description: "Keep parking minimums (false removes them)" },
      },
      [],
    ),
    fn("open_tab", "Show a rail tab: lots (the list), plan (disposition plan), reform (rule levers).", { tab: { type: "string", enum: TABS } }, ["tab"]),
    fn("select_lot", "Open one lot by street address, block-lot (56-N-203) or parcel ID.", { query: { type: "string", maxLength: MAX_QUERY } }, ["query"]),
    fn(
      "set_finance",
      "Change pro forma assumptions: hard cost $/sf, site cost $ per project, target return %, sale or rent.",
      {
        hardCostPerSf: range(FINANCE_LIMITS.hardCostPerSf, "Hard construction cost, $ per sq ft"),
        siteCostPerProject: range(FINANCE_LIMITS.siteCostPerProject, "Site work, $ per project"),
        targetMarginPct: range(FINANCE_LIMITS.targetMarginPct, "Target return, %"),
        mode: { type: "string", enum: ["sale", "rent"] },
      },
      [],
    ),
    fn("explain", "Show the app's fixed explanation of a topic (why nothing is Green, the finance screen, unconfirmed districts, the active lever, how lots are screened).", { topic: { type: "string", enum: EXPLAIN_TOPICS } }, ["topic"]),
  ];
}

// ---- Guards ----------------------------------------------------------------------------------------------

export interface AskContext {
  /** Every neighborhood name in lots.json. */
  neighborhoods: string[];
  /** The ⌘K search index's best lot for a query: a parcel ID, or null. */
  findLot: (query: string) => string | null;
  /** Reform preset ids; defaults to PRESET_IDS. */
  leverIds?: string[];
  /**
   * The user's words. When given, a rule or finance number the question does not contain is dropped, and so is a
   * rule switch whose subject it does not name: every value the app applies came from the user, not the model.
   */
  question?: string;
}

/** The numbers a question contains: "1,800" and "1.8k" are 1800, "$250/sf" is 250; "zero" or "no minimum" add 0. */
export function typedNumbers(q: string): Set<number> {
  const out = new Set<number>();
  for (const m of q.toLowerCase().matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(k\b)?/g)) {
    const v = Number(m[1].replace(/,/g, "")) * (m[2] ? 1000 : 1);
    if (Number.isFinite(v)) out.add(Math.round(v * 100) / 100);
  }
  if (/\bzero\b|\bno (?:\w+ )?minimum|\bwithout (?:a |the )?(?:\w+ )?minimum/.test(q.toLowerCase())) out.add(0);
  return out;
}

/** One call as the model sent it: `args` is the arguments object or its JSON string. */
export interface RawCall {
  name: string;
  args: unknown;
}

export type Validation = { ok: true; actions: ToolCall[] } | { ok: false; error: string };

class Invalid extends Error {}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function objArgs(args: unknown): Record<string, unknown> {
  let v = args;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v || "{}");
    } catch {
      throw new Invalid("arguments are not JSON");
    }
  }
  if (!isObj(v)) throw new Invalid("arguments must be an object");
  return v;
}

function onlyKeys(o: Record<string, unknown>, allowed: readonly string[]) {
  const extra = Object.keys(o).filter((k) => !allowed.includes(k));
  if (extra.length) throw new Invalid(`unexpected arguments: ${extra.join(", ")}`);
}

function oneOf<T extends string>(v: unknown, values: readonly T[], what: string): T {
  if (typeof v !== "string" || !values.includes(v as T)) throw new Invalid(`${what} is not one of ${values.join(", ")}`);
  return v as T;
}

function inRange(v: unknown, r: { min: number; max: number }, what: string): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < r.min || v > r.max) throw new Invalid(`${what} must be ${r.min}–${r.max}`);
  return v;
}

function bool(v: unknown, what: string): boolean {
  if (typeof v !== "boolean") throw new Invalid(`${what} must be true or false`);
  return v;
}

/** A rule switch is applied only when the question names its subject. */
const SWITCH_WORDS = {
  twoUnitInR1: /two[- ]?unit|two[- ]?family|duplex|\br1/i,
  threeUnitInR2: /three[- ]?unit|three[- ]?family|triplex|\br2\b/i,
  aduByRight: /\badus?\b|accessory|backyard|granny|in-law/i,
  parkingMinimums: /parking/i,
} as const;

const RULE_KEYS = ["minLotArea", "hillsideMinLot", "r1dAttachedWidthCap", "twoUnitInR1", "threeUnitInR2", "aduByRight", "parkingMinimums"] as const;
const FINANCE_KEYS = ["hardCostPerSf", "siteCostPerProject", "targetMarginPct", "mode"] as const;

function one(raw: RawCall, ctx: AskContext, leverIds: string[], typed: Set<number> | null): ToolCall {
  const a = objArgs(raw.args);
  const userTyped = (v: number) => !typed || typed.has(v);
  switch (raw.name) {
    case "set_neighborhoods": {
      onlyKeys(a, ["names"]);
      if (!Array.isArray(a.names) || a.names.length > MAX_NAMES) throw new Invalid(`names must be a list of at most ${MAX_NAMES}`);
      const out = new Set<string>();
      for (const n of a.names) {
        if (typeof n !== "string" || n.length > 60) throw new Invalid("names must be strings");
        const hit = resolveNeighborhood(n, ctx.neighborhoods);
        if (!hit.length) throw new Invalid(`unknown neighborhood: ${n}`);
        hit.forEach((h) => out.add(h));
      }
      return { tool: "set_neighborhoods", names: [...out].sort() };
    }
    case "set_home_type":
      onlyKeys(a, ["type"]);
      return { tool: "set_home_type", type: oneOf(a.type, HOME_TYPES, "type") };
    case "set_status":
      onlyKeys(a, ["status"]);
      return { tool: "set_status", status: oneOf(a.status, STATUSES, "status") };
    case "set_triage":
      onlyKeys(a, ["triage"]);
      return { tool: "set_triage", triage: oneOf(a.triage, TRIAGES, "triage") };
    case "set_scenario":
      onlyKeys(a, ["preset"]);
      return { tool: "set_scenario", preset: oneOf(a.preset, leverIds, "preset") };
    case "set_rule_params": {
      onlyKeys(a, RULE_KEYS);
      const params: RulePatch = {};
      if (a.minLotArea !== undefined) {
        if (!isObj(a.minLotArea)) throw new Invalid("minLotArea must be an object");
        onlyKeys(a.minLotArea, SUBDISTRICTS);
        const m: Partial<Record<Subdistrict, number>> = {};
        for (const [k, v] of Object.entries(a.minLotArea)) {
          const x = inRange(v, RULE_RANGES.minLotArea, `minLotArea.${k}`);
          if (userTyped(x)) m[k as Subdistrict] = x;
        }
        if (Object.keys(m).length) params.minLotArea = m;
      }
      for (const k of ["hillsideMinLot", "r1dAttachedWidthCap"] as const) {
        if (a[k] === undefined) continue;
        const x = inRange(a[k], RULE_RANGES[k], k);
        if (userTyped(x)) params[k] = x;
      }
      for (const k of ["twoUnitInR1", "threeUnitInR2", "aduByRight", "parkingMinimums"] as const) {
        if (a[k] === undefined) continue;
        const x = bool(a[k], k);
        if (ctx.question === undefined || SWITCH_WORDS[k].test(ctx.question)) params[k] = x;
      }
      if (!Object.keys(params).length) throw new Invalid("set_rule_params changes nothing the request names");
      return { tool: "set_rule_params", params };
    }
    case "open_tab":
      onlyKeys(a, ["tab"]);
      return { tool: "open_tab", tab: oneOf(a.tab, TABS, "tab") };
    case "select_lot": {
      onlyKeys(a, ["query"]);
      if (typeof a.query !== "string" || !a.query.trim() || a.query.length > MAX_QUERY) throw new Invalid("query must be a short string");
      const query = a.query.trim();
      return { tool: "select_lot", query, lotId: ctx.findLot(query) };
    }
    case "set_finance": {
      onlyKeys(a, FINANCE_KEYS);
      const finance: FinancePatch = {};
      for (const k of ["hardCostPerSf", "siteCostPerProject", "targetMarginPct"] as const) {
        if (a[k] === undefined) continue;
        const x = inRange(a[k], FINANCE_LIMITS[k], k);
        if (userTyped(x)) finance[k] = x;
      }
      if (a.mode !== undefined) finance.mode = oneOf(a.mode, ["sale", "rent"] as const, "mode");
      if (!Object.keys(finance).length) throw new Invalid("set_finance changes nothing the request names");
      return { tool: "set_finance", finance };
    }
    case "explain":
      onlyKeys(a, ["topic"]);
      return { tool: "explain", topic: oneOf(a.topic, EXPLAIN_TOPICS, "topic") };
    default:
      throw new Invalid(`unknown tool: ${String(raw.name).slice(0, 40)}`);
  }
}

/** All or nothing: every call must pass its guard, or the set is rejected and the app changes nothing. */
export function validateCalls(raw: RawCall[], ctx: AskContext): Validation {
  if (!raw.length) return { ok: false, error: "no tool calls" };
  if (raw.length > MAX_CALLS) return { ok: false, error: `more than ${MAX_CALLS} tool calls` };
  const leverIds = ctx.leverIds ?? PRESET_IDS;
  const typed = ctx.question === undefined ? null : typedNumbers(ctx.question);
  try {
    const actions = raw.map((r) => one(r, ctx, leverIds, typed));
    actions.sort((x, y) => APPLY_ORDER.indexOf(x.tool) - APPLY_ORDER.indexOf(y.tool));
    return { ok: true, actions };
  } catch (err) {
    if (err instanceof Invalid) return { ok: false, error: err.message };
    throw err;
  }
}

/**
 * The calls in one chat-completion message: OpenAI-style `tool_calls`, or, for a provider without tool
 * support, a JSON-only reply `{"actions":[{"tool":…,"args":{…}}]}` (optionally fenced). Null otherwise.
 */
export function parseModelMessage(message: unknown): RawCall[] | null {
  if (!isObj(message)) return null;
  if (Array.isArray(message.tool_calls) && message.tool_calls.length) {
    return message.tool_calls.map((c) => {
      const f = isObj(c) && isObj(c.function) ? c.function : {};
      return { name: typeof f.name === "string" ? f.name : "", args: f.arguments ?? {} };
    });
  }
  if (typeof message.content !== "string") return null;
  const text = message.content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  if (!text.startsWith("{")) return null;
  try {
    const o = JSON.parse(text) as unknown;
    if (!isObj(o) || !Array.isArray(o.actions)) return null;
    return o.actions.map((c) => (isObj(c) ? { name: typeof c.tool === "string" ? c.tool : "", args: c.args ?? {} } : { name: "", args: {} }));
  } catch {
    return null;
  }
}
