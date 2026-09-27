import { readFile } from "node:fs/promises";
import path from "node:path";
import type { CompsFile, Lot, LotsFile, RuleSet, Typology } from "@/lib/types";
import { TYPOLOGY_ORDER } from "@/lib/rules";

/*
 * Shared plumbing for the model-backed routes. The routes never trust facts from the client: they
 * take a parcel ID and rebuild findings, triage, and pro forma from the shipped data files.
 */

export const MAX_BODY_BYTES = 4096;
/** Provider timeout; the routes' maxDuration (20 s) leaves room to answer with the deterministic text after it. */
export const PROVIDER_TIMEOUT_MS = 12_000;

/** Shown with every model summary from /api/memo. */
export const MEMO_SUMMARY_LABEL = "Plain-language summary (model-generated, unverified)";

const RULE_SETS: readonly RuleSet[] = ["current", "bill-2025-1545"];

interface Data {
  lots: Map<string, Lot>;
  comps: CompsFile | null;
}

let cache: Promise<Data> | null = null;

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path.join(process.cwd(), "public", "data", file), "utf8")) as T;
  } catch {
    return null;
  }
}

/** lots.json and comps.json, read once per server instance. */
export function loadData(): Promise<Data> {
  cache ??= (async () => {
    const [lots, comps] = await Promise.all([readJson<LotsFile>("lots.json"), readJson<CompsFile>("comps.json")]);
    if (!lots) throw new Error("lots.json unavailable");
    return { lots: new Map(lots.lots.map((l) => [l.id, l])), comps };
  })();
  cache.catch(() => (cache = null));
  return cache;
}

export interface LotRequest {
  lotId: string;
  ruleSet: RuleSet;
  typology: Typology | null;
}

export class BadRequest extends Error {}

/**
 * Parses `{ lotId, ruleSet, typology? }`. Rejects bodies over 4 KB, non-JSON, unknown keys,
 * and values outside the enums. `requireTypology` makes typology mandatory.
 */
export async function parseLotRequest(request: Request, requireTypology: boolean): Promise<LotRequest> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) throw new BadRequest("body too large");
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
  const extra = Object.keys(b).filter((k) => k !== "lotId" && k !== "ruleSet" && k !== "typology");
  if (extra.length) throw new BadRequest(`unexpected keys: ${extra.join(", ")}`);
  if (typeof b.lotId !== "string" || !/^[0-9A-Za-z-]{1,32}$/.test(b.lotId)) throw new BadRequest("lotId must be a parcel ID string");
  if (typeof b.ruleSet !== "string" || !RULE_SETS.includes(b.ruleSet as RuleSet)) throw new BadRequest("ruleSet is invalid");
  let typology: Typology | null = null;
  if (b.typology !== undefined) {
    if (typeof b.typology !== "string" || !TYPOLOGY_ORDER.includes(b.typology as Typology)) throw new BadRequest("typology is invalid");
    typology = b.typology as Typology;
  } else if (requireTypology) {
    throw new BadRequest("typology is required");
  }
  return { lotId: b.lotId, ruleSet: b.ruleSet as RuleSet, typology };
}

interface Provider {
  url: string;
  model: string;
  token: string;
}

function provider(): Provider | null {
  if (process.env.OPENROUTER_API_KEY) {
    return {
      url: "https://openrouter.ai/api/v1/chat/completions",
      model: process.env.MEMO_MODEL || "openai/gpt-4.1-mini",
      token: process.env.OPENROUTER_API_KEY,
    };
  }
  if (process.env.OPENAI_API_KEY) {
    return {
      url: "https://api.openai.com/v1/chat/completions",
      model: process.env.MEMO_MODEL || "gpt-4.1-mini",
      token: process.env.OPENAI_API_KEY,
    };
  }
  const gatewayToken = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
  if (gatewayToken) {
    return {
      url: "https://ai-gateway.vercel.sh/v1/chat/completions",
      model: process.env.MEMO_MODEL || "anthropic/claude-sonnet-4.5",
      token: gatewayToken,
    };
  }
  return null;
}

export type Completion = { text: string; model: string } | { text: null; error: string };

/** One chat completion with a 12 s timeout. Never throws. */
export async function complete(system: string, user: string, maxTokens: number): Promise<Completion> {
  const p = provider();
  if (!p) return { text: null, error: "no-llm-credentials" };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROVIDER_TIMEOUT_MS);
  try {
    const res = await fetch(p.url, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${p.token}` },
      body: JSON.stringify({
        model: p.model,
        max_tokens: maxTokens,
        temperature: 0.2,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) return { text: null, error: `provider-${res.status}` };
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content?.trim();
    return text ? { text, model: p.model } : { text: null, error: "empty" };
  } catch (err) {
    return { text: null, error: ctrl.signal.aborted ? "timeout" : err instanceof Error ? err.name : "error" };
  } finally {
    clearTimeout(timer);
  }
}

export const badRequest = (err: unknown) =>
  err instanceof BadRequest ? Response.json({ error: err.message }, { status: 400 }) : null;
