import { searchLots, normalizeAddress, type SearchEntry } from "@/lib/search";
import { PRESETS } from "@/lib/levers";
import { parseModelMessage, PRESET_IDS, toolSchemas, validateCalls, HOME_TYPES, STATUSES, TRIAGES, TABS, type AskContext } from "@/lib/ask/tools";
import { BadRequest, badRequest, completeTools, loadData, MAX_BODY_BYTES } from "../_lib/server";

export const maxDuration = 20;

/*
 * POST { q, state? } -> { actions: ToolCall[], model, ms }, or an error status with { error } and no actions.
 * The model sees only the question and a compact view state (filters, scenario id, tab, three finance inputs);
 * never a lot record. It may only pick tools and arguments; every call passes the guards in src/lib/ask/tools.ts
 * or the whole set is rejected. The app composes the reply from its own engine.
 */

const MAX_Q = 300;
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

/** Requests per IP in the last minute, in this server instance's memory. */
const hits = new Map<string, number[]>();

function allow(ip: string, now = Date.now()): boolean {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    hits.set(ip, recent);
    return false;
  }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < RATE_WINDOW_MS)) hits.delete(k);
  return true;
}

function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
}

interface Parsed {
  q: string;
  state: Record<string, unknown>;
}

async function parseBody(request: Request): Promise<Parsed> {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) throw new BadRequest("body too large");
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) throw new BadRequest("body too large");
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new BadRequest("body is not JSON");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new BadRequest("body must be an object");
  const b = body as Record<string, unknown>;
  const extra = Object.keys(b).filter((k) => k !== "q" && k !== "state");
  if (extra.length) throw new BadRequest(`unexpected keys: ${extra.join(", ")}`);
  if (typeof b.q !== "string" || !b.q.trim() || b.q.length > MAX_Q) throw new BadRequest(`q must be 1–${MAX_Q} characters`);
  if (b.state !== undefined && (!b.state || typeof b.state !== "object" || Array.isArray(b.state))) throw new BadRequest("state must be an object");
  return { q: b.q.trim(), state: (b.state as Record<string, unknown>) ?? {} };
}

const pick = <T extends string>(v: unknown, values: readonly T[]): T | undefined => (typeof v === "string" && values.includes(v as T) ? (v as T) : undefined);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** Only known fields with valid values reach the model; anything else in `state` is dropped. */
function compactState(s: Record<string, unknown>, hoods: Set<string>) {
  const f = (s.finance && typeof s.finance === "object" ? s.finance : {}) as Record<string, unknown>;
  return {
    neighborhoods: Array.isArray(s.neighborhoods) ? s.neighborhoods.filter((h): h is string => typeof h === "string" && hoods.has(h)).slice(0, 20) : [],
    homeType: pick(s.homeType, HOME_TYPES) ?? "any",
    status: pick(s.status, STATUSES) ?? "any",
    triage: pick(s.triage, TRIAGES) ?? "any",
    scenario: pick(s.scenario, [...PRESET_IDS, "custom"]) ?? "today",
    tab: pick(s.tab, TABS) ?? "lots",
    finance: { hardCostPerSf: num(f.hardCostPerSf), siteCostPerProject: num(f.siteCostPerProject), targetMarginPct: num(f.targetMarginPct), mode: pick(f.mode, ["sale", "rent"]) },
  };
}

let index: Promise<{ neighborhoods: string[]; entries: SearchEntry[]; ids: string[] }> | null = null;
function searchIndex() {
  index ??= loadData().then(({ lots }) => {
    const all = [...lots.values()];
    return {
      neighborhoods: [...new Set(all.map((l) => l.neighborhood).filter(Boolean))].sort(),
      entries: all.map((l) => ({ addr: normalizeAddress(l.address || ""), id: l.id.toLowerCase(), hood: normalizeAddress(l.neighborhood || "") })),
      ids: all.map((l) => l.id),
    };
  });
  index.catch(() => (index = null));
  return index;
}

function system(neighborhoods: string[]): string {
  const levers = PRESETS.map((p) => `${p.id}: ${p.label}`).join("\n");
  return `You operate the filters of ByRight PGH, a screening map of City of Pittsburgh vacant lots. Translate the user's request into tool calls. The app computes every count, verdict and dollar figure itself: never answer in text, never state numbers, and call no tools when the request is not about the lots, the zoning scenario, the finance assumptions, opening a lot or tab, or explaining the screen.
Call every tool the request needs in one reply: a place, a home type and a status in one request are three calls. Change only what the request asks; the current view is given with the request.
Phrases: "for sale" -> set_status for-sale; townhouse/townhouses/rowhouse/attached -> set_home_type townhome; ADU/backyard unit/granny flat -> single_adu; house/single-family -> single; two-family -> duplex.
Scenarios: the housing bill, the ADU bill, Bill 2025-1545 or "if the bill passes" -> set_scenario bill-2025-1545. Today's code / current rules -> set_scenario today. A rule change that a named lever below describes -> set_scenario with that lever id (for example "the L minimum drops to 1,800" -> min-lot-L-1800). Only for a rule change no lever describes, call set_rule_params with ONLY the parameters the request changes; never send parameters it does not mention.
"What changes under X for Y" -> set the scenario and the place. "Why isn't anything Green" or what Green means -> explain green-policy.
Examples:
"Show Central Northside townhouses for sale" -> set_neighborhoods {"names":["Central Northside"]}, set_home_type {"type":"townhome"}, set_status {"status":"for-sale"}.
"Hazelwood lots where a duplex passes if the L minimum drops to 1,800" -> set_scenario {"preset":"min-lot-L-1800"}, set_neighborhoods {"names":["Hazelwood"]}, set_home_type {"type":"duplex"}.
"What if the hillside minimum were 2,500?" -> set_rule_params {"hillsideMinLot":2500}.
Levers:
${levers}
Neighborhoods (use these names): ${neighborhoods.join("; ")}.
If you cannot call tools, reply with only JSON: {"actions":[{"tool":"<tool name>","args":{...}}]}.`;
}

export async function POST(request: Request) {
  const started = Date.now();
  if (!allow(clientIp(request))) return Response.json({ error: "rate-limited" }, { status: 429 });
  let req: Parsed;
  try {
    req = await parseBody(request);
  } catch (err) {
    const r = badRequest(err);
    if (r) return r;
    throw err;
  }
  const idx = await searchIndex();
  const view = compactState(req.state, new Set(idx.neighborhoods));
  const out = await completeTools(system(idx.neighborhoods), `Current view: ${JSON.stringify(view)}\nRequest: ${req.q}`, toolSchemas(PRESET_IDS), 400);
  if (!out.ok) return Response.json({ error: out.error }, { status: out.error === "no-llm-credentials" ? 503 : 502 });
  const raw = parseModelMessage(out.message);
  if (!raw) return Response.json({ error: "no tool calls" }, { status: 422 });
  const ctx: AskContext = {
    neighborhoods: idx.neighborhoods,
    question: req.q,
    findLot: (q) => {
      const [hit] = searchLots(idx.entries, q, 1);
      return hit === undefined ? null : idx.ids[hit];
    },
  };
  const v = validateCalls(raw, ctx);
  if (!v.ok) return Response.json({ error: v.error }, { status: 422 });
  return Response.json({ actions: v.actions, model: out.model, ms: Date.now() - started });
}
