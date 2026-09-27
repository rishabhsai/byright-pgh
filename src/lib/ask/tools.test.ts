import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { LotsFile } from "@/lib/types";
import { parseModelMessage, resolveNeighborhood, validateCalls, type AskContext } from "./tools";

const file = JSON.parse(readFileSync("public/data/lots.json", "utf8")) as LotsFile;
const HOODS = [...new Set(file.lots.map((l) => l.neighborhood).filter(Boolean))].sort();

describe("resolveNeighborhood", () => {
  it("expands a shared name to every neighborhood that carries it", () => {
    expect(resolveNeighborhood("homewood", HOODS)).toEqual(["Homewood North", "Homewood South", "Homewood West"]);
  });

  it("returns the canonical spelling for case, punctuation and spacing variants", () => {
    expect(resolveNeighborhood("hazelwood", HOODS)).toEqual(["Hazelwood"]);
    expect(resolveNeighborhood("Central North Side", HOODS)).toEqual(["Central Northside"]);
    expect(resolveNeighborhood("Mount Oliver", HOODS)).toEqual(["Mt. Oliver"]);
    expect(resolveNeighborhood("lincoln lemington belmar", HOODS)).toEqual(["Lincoln-Lemington-Belmar"]);
  });

  it("tolerates a small typo in a full name", () => {
    expect(resolveNeighborhood("Larimar", HOODS)).toEqual(["Larimer"]);
    expect(resolveNeighborhood("Hazlewood", HOODS)).toEqual(["Hazelwood"]);
  });

  it("knows the Hill District", () => {
    expect(resolveNeighborhood("the Hill District", HOODS)).toEqual(["Bedford Dwellings", "Crawford-Roberts", "Middle Hill", "Terrace Village", "Upper Hill"]);
  });

  it("returns nothing for a place that is not a Pittsburgh neighborhood, or a word too common to pick", () => {
    expect(resolveNeighborhood("Cranberry Township", HOODS)).toEqual([]);
    expect(resolveNeighborhood("hill", HOODS)).toEqual([]);
    expect(resolveNeighborhood("", HOODS)).toEqual([]);
  });
});

const CTX: AskContext = {
  neighborhoods: HOODS,
  findLot: (q) => (q.toLowerCase().includes("ladora") ? "0000A00001000000" : null),
};
const call = (name: string, args: unknown) => ({ name, args });

describe("validateCalls", () => {
  it("accepts a valid set and returns canonical actions in the app's apply order", () => {
    const r = validateCalls(
      [
        call("set_scenario", { preset: "min-lot-L-1800" }),
        call("set_home_type", '{"type":"duplex"}'),
        call("set_neighborhoods", { names: ["hazelwood"] }),
      ],
      CTX,
    );
    expect(r).toEqual({
      ok: true,
      actions: [
        { tool: "set_scenario", preset: "min-lot-L-1800" },
        { tool: "set_neighborhoods", names: ["Hazelwood"] },
        { tool: "set_home_type", type: "duplex" },
      ],
    });
  });

  it("expands and de-duplicates neighborhood names server-side", () => {
    const r = validateCalls([call("set_neighborhoods", { names: ["Homewood", "homewood south"] })], CTX);
    expect(r).toEqual({ ok: true, actions: [{ tool: "set_neighborhoods", names: ["Homewood North", "Homewood South", "Homewood West"] }] });
  });

  it("rejects the whole set when any call is unknown or malformed", () => {
    const ok = call("set_home_type", { type: "duplex" });
    const bad = [
      call("delete_lots", {}),
      call("set_home_type", { type: "mansion" }),
      call("set_home_type", { type: "duplex", note: "x" }),
      call("set_home_type", "{not json"),
      call("set_neighborhoods", { names: ["Cranberry Township"] }),
      call("set_status", { status: "sold" }),
      call("set_triage", { triage: "blue" }),
      call("open_tab", { tab: "admin" }),
      call("explain", { topic: "everything" }),
      call("select_lot", { query: "" }),
    ];
    for (const b of bad) expect(validateCalls([ok, b], CTX).ok, JSON.stringify(b)).toBe(false);
  });

  it("accepts only lever ids from PRESETS", () => {
    for (const preset of ["today", "bill-2025-1545", "two-unit-r1", "min-lot-H-900"])
      expect(validateCalls([call("set_scenario", { preset })], CTX).ok, preset).toBe(true);
    for (const preset of ["min-lot-L-1000", "custom", "BILL", ""]) expect(validateCalls([call("set_scenario", { preset })], CTX).ok, preset).toBe(false);
  });

  it("keeps rule parameters inside the lever ranges", () => {
    expect(validateCalls([call("set_rule_params", { minLotArea: { L: 1800 }, twoUnitInR1: true })], CTX)).toEqual({
      ok: true,
      actions: [{ tool: "set_rule_params", params: { minLotArea: { L: 1800 }, twoUnitInR1: true } }],
    });
    for (const params of [
      {},
      { minLotArea: { L: 25_000 } },
      { minLotArea: { L: -1 } },
      { minLotArea: { XL: 100 } },
      { hillsideMinLot: 20_001 },
      { r1dAttachedWidthCap: 5 },
      { r1dAttachedWidthCap: 101 },
      { aduByRight: "yes" },
      { frontYard: 10 },
    ])
      expect(validateCalls([call("set_rule_params", params)], CTX).ok, JSON.stringify(params)).toBe(false);
  });

  it("keeps finance inputs inside the pro forma's accepted ranges", () => {
    expect(validateCalls([call("set_finance", { hardCostPerSf: 250, mode: "rent" })], CTX)).toEqual({
      ok: true,
      actions: [{ tool: "set_finance", finance: { hardCostPerSf: 250, mode: "rent" } }],
    });
    for (const f of [{}, { hardCostPerSf: 10 }, { siteCostPerProject: 200_000 }, { targetMarginPct: 80 }, { mode: "lease" }, { softCostPct: 20 }])
      expect(validateCalls([call("set_finance", f)], CTX).ok, JSON.stringify(f)).toBe(false);
  });

  it("resolves a lot query through the search index, or null when nothing matches", () => {
    expect(validateCalls([call("select_lot", { query: "5118 Ladora Way" })], CTX)).toEqual({
      ok: true,
      actions: [{ tool: "select_lot", query: "5118 Ladora Way", lotId: "0000A00001000000" }],
    });
    expect(validateCalls([call("select_lot", { query: "1 Nowhere St" })], CTX)).toEqual({
      ok: true,
      actions: [{ tool: "select_lot", query: "1 Nowhere St", lotId: null }],
    });
  });

  it("keeps only rule and finance values the user named, so a model cannot fill in values of its own", () => {
    const q = { ...CTX, question: "what if the M minimum were 2,000 and hard cost $250/sf" };
    const filled = { minLotArea: { VL: 0, L: 0, M: 2000, H: 0, VH: 0 }, hillsideMinLot: 0, r1dAttachedWidthCap: 100, twoUnitInR1: false };
    expect(validateCalls([call("set_rule_params", filled), call("set_finance", { hardCostPerSf: 250, targetMarginPct: 12 })], q)).toEqual({
      ok: true,
      actions: [
        { tool: "set_rule_params", params: { minLotArea: { M: 2000 } } },
        { tool: "set_finance", finance: { hardCostPerSf: 250 } },
      ],
    });
    expect(validateCalls([call("set_rule_params", { hillsideMinLot: 2500 })], q).ok).toBe(false);
    expect(validateCalls([call("set_rule_params", { twoUnitInR1: true })], { ...CTX, question: "allow two-unit homes in R1" })).toEqual({
      ok: true,
      actions: [{ tool: "set_rule_params", params: { twoUnitInR1: true } }],
    });
    expect(validateCalls([call("set_rule_params", { minLotArea: { H: 0 } })], { ...CTX, question: "no minimum lot size in H subdistricts" }).ok).toBe(true);
    expect(validateCalls([call("set_finance", { siteCostPerProject: 1800 })], { ...CTX, question: "site work 1.8k" }).ok).toBe(true);
  });

  it("rejects an empty set and more than eight calls", () => {
    expect(validateCalls([], CTX).ok).toBe(false);
    expect(validateCalls(Array.from({ length: 9 }, () => call("open_tab", { tab: "lots" })), CTX).ok).toBe(false);
  });
});

describe("parseModelMessage", () => {
  it("reads OpenAI-style tool calls", () => {
    expect(
      parseModelMessage({ tool_calls: [{ type: "function", function: { name: "set_triage", arguments: '{"triage":"green"}' } }], content: null }),
    ).toEqual([{ name: "set_triage", args: '{"triage":"green"}' }]);
  });

  it("falls back to a JSON-only reply, fenced or not", () => {
    const content = '```json\n{"actions":[{"tool":"explain","args":{"topic":"green-policy"}}]}\n```';
    expect(parseModelMessage({ content })).toEqual([{ name: "explain", args: { topic: "green-policy" } }]);
  });

  it("returns null for prose", () => {
    expect(parseModelMessage({ content: "Hazelwood has 41 lots." })).toBeNull();
    expect(parseModelMessage(undefined)).toBeNull();
  });
});
