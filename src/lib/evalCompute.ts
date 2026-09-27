// The city-wide pass: every lot through the rules engine, triage and the evidence row, for both rule sets.
// Pure, so it runs the same in the Web Worker (eval.worker.ts) and in the synchronous fallback.
import type { Comps, Finding, Lot, RuleSet, TriageResult, Typology, Verdict } from "./types";
import { bestVerdict, evaluateLot } from "./rules";
import { dispositionBlocker, triageLot } from "./triage";
import { evidenceForLot, type Evidence } from "./evidence";
import { NEW_CONSTRUCTION_PREMIUM, type FinanceAssumptions } from "./proforma";

export const RULE_SETS: RuleSet[] = ["current", "bill-2025-1545"];

export type Evaluations = Record<RuleSet, { findings: Finding[][]; best: Verdict[] }>;
export type Triages = Record<
  RuleSet,
  {
    results: TriageResult[];
    margin: (number | null)[];
    /** Lots that would be Green if new homes were valued at NEW_CONSTRUCTION_PREMIUM × the comp index. */
    greenAtPremium: number;
  }
>;
export type EvidenceByRuleSet = Record<RuleSet, Evidence[]>;

/** One city-wide triage request: the finance inputs every lot is screened with. */
export interface TriageInput {
  comps: (Comps | null)[];
  assumptions: FinanceAssumptions;
  /** Acquisition cost entered for individual lots, keyed by parcel ID. */
  landOverrides: Record<string, number>;
  /** The Home type filter; null screens each lot for its best type. */
  typology: Typology | null;
}

export function evaluateAll(lots: Lot[]): Evaluations {
  const out = {} as Evaluations;
  for (const rs of RULE_SETS) {
    const findings = lots.map((l) => evaluateLot(l, rs));
    out[rs] = { findings, best: findings.map((f) => bestVerdict(f)) };
  }
  return out;
}

export function triageAll(lots: Lot[], evals: Evaluations, input: TriageInput): Triages {
  const triages = {} as Triages;
  const { comps, assumptions, landOverrides, typology } = input;
  for (const rs of RULE_SETS) {
    const results: TriageResult[] = new Array(lots.length);
    for (let i = 0; i < lots.length; i++) {
      results[i] = triageLot(lots[i], evals[rs].findings[i], comps[i], withLand(assumptions, landOverrides, lots[i]), typology);
    }
    triages[rs] = { results, margin: results.map((t) => t.margin), greenAtPremium: greenAtPremium(lots, evals[rs].findings, results, input) };
  }
  return triages;
}

/**
 * Lots that turn Green with value at the premium. Only a Yellow lot whose finance was screened and fell short,
 * whose proposal is allowed by right and which is recorded for sale can turn Green, so only those are re-triaged.
 */
function greenAtPremium(lots: Lot[], findings: Finding[][], results: TriageResult[], input: TriageInput): number {
  const { comps, assumptions, landOverrides, typology } = input;
  const premium = { ...assumptions, valuePremium: NEW_CONSTRUCTION_PREMIUM };
  let n = 0;
  for (let i = 0; i < lots.length; i++) {
    const r = results[i];
    if (r.triage !== "yellow" || r.pencils !== false || dispositionBlocker(lots[i]) !== null) continue;
    if (findings[i].find((f) => f.typology === r.bestTypology)?.verdict !== "by-right") continue;
    if (triageLot(lots[i], findings[i], comps[i], withLand(premium, landOverrides, lots[i]), typology).triage === "green") n++;
  }
  return n;
}

export function evidenceAll(lots: Lot[], evals: Evaluations, triages: Triages, input: TriageInput): EvidenceByRuleSet {
  const evidence = {} as EvidenceByRuleSet;
  const { comps, assumptions, landOverrides, typology } = input;
  for (const rs of RULE_SETS) {
    evidence[rs] = lots.map((l, i) =>
      evidenceForLot(l, evals[rs].findings[i], triages[rs].results[i], comps[i], withLand(assumptions, landOverrides, l), typology),
    );
  }
  return evidence;
}

function withLand(a: FinanceAssumptions, overrides: Record<string, number>, lot: Lot): FinanceAssumptions {
  const land = overrides[lot.id];
  return land == null ? a : { ...a, landOverride: land };
}

/**
 * Findings trimmed for the trip back from the worker: verdicts, unresolved ids, review kind, the open permission question, the
 * failing checks' ids and (shared) citations, and the parking check with its requirement (the plan's bill
 * line compares spaces under each rule set). Other passing and unverified checks, measured values, notes
 * and summaries are dropped; they are most of the payload (≈150 MB serialized for the city). City-wide consumers
 * (stats, ranking, readiness, the plan) read only the kept fields; the detail panel re-evaluates
 * its one lot with evaluateLot for the full text.
 */
export function slimEvaluations(evals: Evaluations): Evaluations {
  const out = {} as Evaluations;
  for (const rs of RULE_SETS) {
    out[rs] = {
      best: evals[rs].best,
      findings: evals[rs].findings.map((fs) =>
        fs.map((f) => ({
          typology: f.typology,
          verdict: f.verdict,
          summary: "",
          unresolved: f.unresolved,
          reviewKind: f.reviewKind,
          permissionQuestion: f.permissionQuestion ?? null,
          checks: f.checks
            .filter((c) => c.passed === false || c.id === "parking")
            .map((c) => ({
              id: c.id,
              label: "",
              passed: c.passed,
              measured: null,
              // The parking requirement feeds the plan's bill comparison (spaces today → under the bill).
              required: c.id === "parking" ? c.required : null,
              citation: c.citation,
            })),
        })),
      ),
    };
  }
  return out;
}

/**
 * Evidence trimmed the same way: pass and fail details are dropped (the list pill reads states;
 * the plan export reads only unknown and not-checked details). The detail panel derives its own.
 */
export function slimEvidence(evidence: EvidenceByRuleSet): EvidenceByRuleSet {
  const out = {} as EvidenceByRuleSet;
  for (const rs of RULE_SETS) {
    out[rs] = evidence[rs].map((e) => ({
      ...e,
      checks: e.checks.map((c) =>
        c.state === "pass" || c.state === "fail" ? { id: c.id, state: c.state, label: c.label, detail: "", ...(c.belowFloor ? { belowFloor: true } : {}) } : c,
      ),
    }));
  }
  return out;
}

/** Worker protocol. `lots` is sent once; later requests reuse the worker's cached evaluations. */
export interface EvalRequest extends TriageInput {
  seq: number;
  lots?: Lot[];
}

/**
 * The worker answers in up to three parts: "evals" (when lots were sent), then "triages", then
 * "evidence" (the last part for a request), or "error" if the request threw. `seq` is the request's
 * revision; the hook publishes one revision's parts together and drops parts from older revisions.
 */
export type EvalResponse =
  | { seq: number; part: "evals"; evals: Evaluations; ms: number }
  | { seq: number; part: "triages"; triages: Triages; ms: number }
  | { seq: number; part: "evidence"; evidence: EvidenceByRuleSet; ms: number }
  | { seq: number; part: "error"; message: string };

/** What the worker keeps between requests: the lots it was sent and their full evaluations. */
export interface EvalWorkerState {
  lots: Lot[];
  evals: Evaluations | null;
}

/**
 * The worker's whole message handler, pure apart from `post` so tests run it without a Worker.
 * Payloads are slimmed: a structured clone of the full findings costs the main thread ~1 s to read.
 */
export function handleEvalRequest(state: EvalWorkerState, req: EvalRequest, post: (res: EvalResponse) => void): void {
  try {
    let t = performance.now();
    if (req.lots) {
      state.lots = req.lots;
      state.evals = evaluateAll(state.lots);
      post({ seq: req.seq, part: "evals", evals: slimEvaluations(state.evals), ms: Math.round(performance.now() - t) });
      t = performance.now();
    }
    if (!state.evals) throw new Error("no lots evaluated yet");
    const triages = triageAll(state.lots, state.evals, req);
    post({ seq: req.seq, part: "triages", triages, ms: Math.round(performance.now() - t) });
    t = performance.now();
    const evidence = evidenceAll(state.lots, state.evals, triages, req);
    post({ seq: req.seq, part: "evidence", evidence: slimEvidence(evidence), ms: Math.round(performance.now() - t) });
  } catch (err) {
    post({ seq: req.seq, part: "error", message: err instanceof Error ? err.message : String(err) });
  }
}
