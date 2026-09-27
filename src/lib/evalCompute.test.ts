import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CompsFile, Lot, LotsFile } from "./types";
import { compsFor, DEFAULT_FINANCE } from "./finance";
import {
  evaluateAll,
  evidenceAll,
  handleEvalRequest,
  RULE_SETS,
  triageAll,
  type EvalResponse,
  type Evaluations,
  type EvidenceByRuleSet,
  type TriageInput,
  type Triages,
} from "./evalCompute";
import { buildPlan, toBrief, toCsv } from "./plan";

const LOTS = "public/data/lots.json";
const COMPS = "public/data/comps.json";
const haveData = existsSync(LOTS) && existsSync(COMPS);

/** The worker's answer for one request, collected the way useCityEval publishes it. */
function viaWorker(lots: Lot[], input: TriageInput) {
  const state = { lots: [] as Lot[], evals: null as Evaluations | null };
  const parts: EvalResponse[] = [];
  handleEvalRequest(state, { ...input, seq: 1, lots }, (r) => parts.push(structuredClone(r)));
  const get = <P extends EvalResponse["part"]>(p: P) => parts.find((r) => r.part === p) as Extract<EvalResponse, { part: P }>;
  expect(parts.find((r) => r.part === "error")).toBeUndefined();
  return { evals: get("evals").evals, triages: get("triages").triages, evidence: get("evidence").evidence };
}

function viaSync(lots: Lot[], input: TriageInput) {
  const evals = evaluateAll(lots);
  const triages = triageAll(lots, evals, input);
  return { evals, triages, evidence: evidenceAll(lots, evals, triages, input) };
}

function plans(lots: Lot[], compsFile: CompsFile, r: { evals: Evaluations; triages: Triages; evidence: EvidenceByRuleSet }, neighborhoods: string[]) {
  const comps = lots.map((l) => compsFor(l, compsFile));
  return RULE_SETS.map((rs) => {
    const plan = buildPlan(lots, r.evals, r.triages[rs].results, r.evidence[rs], comps, DEFAULT_FINANCE, { neighborhoods }, rs, 10, {
      generatedAt: "2026-09-26T20:00:00Z",
    });
    return { plan, brief: toBrief(plan), csv: toCsv(plan.rows) };
  });
}

describe.runIf(haveData)("worker parity: the slimmed worker payload builds the same plan as the synchronous path", () => {
  const file = haveData ? (JSON.parse(readFileSync(LOTS, "utf8")) as LotsFile) : null;
  const compsFile = haveData ? (JSON.parse(readFileSync(COMPS, "utf8")) as CompsFile) : null;
  const input = (lots: Lot[]): TriageInput => ({
    comps: lots.map((l) => compsFor(l, compsFile)),
    assumptions: DEFAULT_FINANCE,
    landOverrides: {},
    typology: null,
  });

  it("keeps the screening-floor flag on a slimmed lot-size check (0 Forbes Av, 259 sf LNC)", () => {
    const lots = file!.lots.filter((l) => l.id === "0086L00500000000");
    const lotSize = viaWorker(lots, input(lots)).evidence.current[0].checks.find((c) => c.id === "lotSize");
    expect(lotSize).toMatchObject({ state: "fail", label: "Below floor", belowFloor: true });
  });

  it("Hazelwood in full: same plan, brief and CSV, and the bill line keeps today's parking requirement", () => {
    const lots = file!.lots.filter((l) => l.neighborhood === "Hazelwood");
    const w = plans(lots, compsFile!, viaWorker(lots, input(lots)), ["Hazelwood"]);
    const s = plans(lots, compsFile!, viaSync(lots, input(lots)), ["Hazelwood"]);
    for (let i = 0; i < s.length; i++) {
      expect(w[i].plan).toEqual(s[i].plan);
      expect(w[i].brief).toBe(s[i].brief);
      expect(w[i].csv).toBe(s[i].csv);
    }
    expect(w[0].plan.billLine).toMatch(/required parking 1 → 0 on \d+/);
  }, 60_000);

  it("a 500-lot citywide sample: same plan, brief and CSV under both rule sets", () => {
    const lots = file!.lots.filter((_, i) => i % 22 === 0).slice(0, 500);
    expect(lots).toHaveLength(500);
    const w = plans(lots, compsFile!, viaWorker(lots, input(lots)), []);
    const s = plans(lots, compsFile!, viaSync(lots, input(lots)), []);
    for (let i = 0; i < s.length; i++) {
      expect(w[i].plan).toEqual(s[i].plan);
      expect(w[i].brief).toBe(s[i].brief);
      expect(w[i].csv).toBe(s[i].csv);
    }
  }, 60_000);

  it("counts the lots that turn Green at the 1.3x premium, citywide and for the selected home type", () => {
    const lots = file!.lots;
    const evals = evaluateAll(lots);
    const any = triageAll(lots, evals, input(lots));
    expect(any.current.results.filter((r) => r.triage === "green")).toHaveLength(0);
    expect(any.current.greenAtPremium).toBe(7);
    expect(any["bill-2025-1545"].greenAtPremium).toBe(9);
    const town = triageAll(lots, evals, { ...input(lots), typology: "townhome" });
    expect(town.current.greenAtPremium).toBe(7);
    const duplex = triageAll(lots, evals, { ...input(lots), typology: "duplex" });
    expect(duplex.current.greenAtPremium).toBe(0);
  }, 120_000);
});
