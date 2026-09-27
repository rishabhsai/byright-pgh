// The shareable URL: every input that changes an answer on screen, and nothing else.
import type { Triage, Typology } from "@/lib/types";
import { STATUS_GROUPS, type StatusGroup } from "@/lib/ranking";
import { acceptedValue, DEFAULT_FINANCE, FINANCE_RANGES, type FinanceAssumptions } from "@/lib/proforma";
import { TYPOLOGIES } from "./verdict";
import type { RuleParams } from "@/lib/types";
import { decodeParams, encodeParams } from "./reform/engine";
import { EXPLAIN_TOPICS, type ExplainTopic } from "@/lib/ask/tools";

/**
 * ?lot=<id>&type=duplex&filterType=townhome&hoods=a,b&scenario=bill&tab=plan&n=12&hc=195
 *  &land=<id>:100000,<id>:0&status=Available+for+Sale&triage=yellow&minArea=1000&byRight=1&parks=1&read=1
 * `type` is the proposal picked for the selected lot; `filterType` is the Home type filter. Finance
 * assumptions, filters and land figures appear only where they differ from the defaults. `land` carries
 * every per-lot acquisition figure the user entered, because each one changes that lot's answer and the plan.
 */
export interface UrlState {
  lot: string | null;
  /** The proposal picked for the selected lot, when the user picked one. */
  type: Typology | null;
  /** The Home type filter. */
  filterType: Typology | null;
  hoods: string[];
  bill: boolean;
  tab: "lots" | "plan" | "reform";
  /** Reform tab: the preset id (`preset=`), or "custom" with the params in `rp` (base64 JSON). */
  reformPreset: string | null;
  reformParams: RuleParams | null;
  /** Projects to plan for. */
  projects: number;
  /** Shared finance assumptions (never a lot's land figure). */
  finance: FinanceAssumptions;
  /** Per-lot land figures the user entered, by parcel ID. */
  land: Record<string, number>;
  status: StatusGroup | "";
  triage: Triage | "";
  minArea: number;
  onlyByRight: boolean;
  includeParks: boolean;
  /** The plan's wide reading view is open. */
  reading: boolean;
  /** The Ask ByRight question on screen (`ask=`); the answer is recomputed from the rest of the state. */
  ask: string | null;
  /** Explanations that question showed (`explain=`), shown again from the app's fixed text. */
  askTopics: ExplainTopic[];
}

/** Longest question a link may carry (the /api/ask limit). */
export const MAX_ASK = 300;

type RangedKey = keyof typeof FINANCE_RANGES;
/** Short URL keys for the ranged finance inputs. */
export const FIN_KEYS: [string, RangedKey][] = [
  ["hc", "hardCostPerSf"],
  ["site", "siteCostPerProject"],
  ["soft", "softCostPct"],
  ["dev", "devFeePct"],
  ["ret", "targetMarginPct"],
  ["sf", "typicalHomeSf"],
  ["cap", "capRate"],
  ["opex", "opexPct"],
];

export const DEFAULT_PROJECTS = 10;

const TRIAGES: Triage[] = ["green", "yellow", "red", "gray"];
/** Parcel IDs are alphanumeric; anything else in `land` is dropped. */
const PARCEL_ID = /^[0-9A-Za-z]{6,24}$/;
/** Land figures accepted from a link: whole dollars, zero up to $100M. */
const MAX_LAND = 100_000_000;

const asTypology = (v: string | null): Typology | null => ((TYPOLOGIES as string[]).includes(v ?? "") ? (v as Typology) : null);

export function financeDiffers(a: FinanceAssumptions): boolean {
  return FIN_KEYS.some(([, k]) => a[k] !== DEFAULT_FINANCE[k]) || a.mode !== DEFAULT_FINANCE.mode;
}

function parseLand(raw: string | null): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of (raw ?? "").split(",")) {
    const [id, v] = part.split(":");
    const n = Number(v);
    if (!id || !PARCEL_ID.test(id.trim()) || v == null || v.trim() === "" || !Number.isFinite(n) || n < 0 || n > MAX_LAND) continue;
    out[id.trim()] = Math.round(n);
  }
  return out;
}

export function parseUrlState(search: string): UrlState {
  const p = new URLSearchParams(search);
  const finance: FinanceAssumptions = { ...DEFAULT_FINANCE };
  for (const [q, k] of FIN_KEYS) {
    const raw = p.get(q);
    if (raw != null && raw.trim() !== "") finance[k] = acceptedValue(k, Number(raw));
  }
  if (p.get("mode") === "rent") finance.mode = "rent";
  const n = Number(p.get("n"));
  const status = p.get("status") ?? "";
  const triage = p.get("triage") ?? "";
  const minArea = Number(p.get("minArea"));
  return {
    lot: p.get("lot"),
    type: asTypology(p.get("type")),
    filterType: asTypology(p.get("filterType")),
    hoods: (p.get("hoods") ?? "").split(",").map((h) => h.trim()).filter(Boolean),
    bill: p.get("scenario") === "bill",
    tab: p.get("tab") === "plan" ? "plan" : p.get("tab") === "reform" ? "reform" : "lots",
    reformPreset: /^[A-Za-z0-9-]{1,40}$/.test(p.get("preset") ?? "") ? p.get("preset") : null,
    reformParams: p.get("preset") === "custom" ? decodeParams(p.get("rp")) : null,
    projects: Number.isInteger(n) && n >= 1 && n <= 9999 ? n : DEFAULT_PROJECTS,
    finance,
    land: parseLand(p.get("land")),
    status: (STATUS_GROUPS as readonly string[]).includes(status) ? (status as StatusGroup) : "",
    triage: (TRIAGES as string[]).includes(triage) ? (triage as Triage) : "",
    minArea: Number.isFinite(minArea) && minArea > 0 && minArea <= 1_000_000 ? Math.round(minArea) : 0,
    onlyByRight: p.get("byRight") === "1",
    includeParks: p.get("parks") === "1",
    reading: p.get("read") === "1",
    ask: (() => {
      const q = (p.get("ask") ?? "").trim();
      return q && q.length <= MAX_ASK ? q : null;
    })(),
    askTopics: (p.get("explain") ?? "").split(",").filter((t): t is ExplainTopic => (EXPLAIN_TOPICS as readonly string[]).includes(t)),
  };
}

/** The query string (no leading "?"), empty when everything is at its default. */
export function serializeUrlState(s: UrlState): string {
  const p = new URLSearchParams();
  if (s.lot) p.set("lot", s.lot);
  if (s.lot && s.type) p.set("type", s.type);
  if (s.filterType) p.set("filterType", s.filterType);
  if (s.hoods.length) p.set("hoods", s.hoods.join(","));
  if (s.bill) p.set("scenario", "bill");
  if (s.tab !== "lots") p.set("tab", s.tab);
  if (s.tab === "reform" && s.reformPreset && s.reformPreset !== "today") {
    p.set("preset", s.reformPreset);
    if (s.reformPreset === "custom" && s.reformParams) p.set("rp", encodeParams(s.reformParams));
  }
  if (s.projects !== DEFAULT_PROJECTS) p.set("n", String(s.projects));
  for (const [q, k] of FIN_KEYS) if (s.finance[k] !== DEFAULT_FINANCE[k]) p.set(q, String(s.finance[k]));
  if (s.finance.mode !== DEFAULT_FINANCE.mode) p.set("mode", s.finance.mode);
  const land = Object.entries(s.land)
    .filter(([id, v]) => PARCEL_ID.test(id) && Number.isFinite(v) && v >= 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, v]) => `${id}:${Math.round(v)}`);
  if (land.length) p.set("land", land.join(","));
  if (s.status) p.set("status", s.status);
  if (s.triage) p.set("triage", s.triage);
  if (s.minArea > 0) p.set("minArea", String(s.minArea));
  if (s.onlyByRight) p.set("byRight", "1");
  if (s.includeParks) p.set("parks", "1");
  if (s.reading) p.set("read", "1");
  if (s.ask) p.set("ask", s.ask);
  if (s.ask && s.askTopics.length) p.set("explain", s.askTopics.join(","));
  return p.toString().replace(/%2C/g, ",").replace(/%3A/g, ":");
}
