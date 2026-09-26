// The city-wide pass: every lot through the rules engine, triage and the evidence row, for both rule sets.
// Pure, so it runs the same in the Web Worker (eval.worker.ts) and in the synchronous fallback.
import type { Comps, Finding, Lot, RuleSet, TriageResult, Typology, Verdict } from "./types";
import { bestVerdict, evaluateLot } from "./rules";
import { triageLot } from "./triage";
import { evidenceForLot, type Evidence } from "./evidence";
import type { FinanceAssumptions } from "./proforma";

export const RULE_SETS: RuleSet[] = ["current", "bill-2025-1545"];

export type Evaluations = Record<RuleSet, { findings: Finding[][]; best: Verdict[] }>;
export type Triages = Record<RuleSet, { results: TriageResult[]; margin: (number | null)[] }>;
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
    triages[rs] = { results, margin: results.map((t) => t.margin) };
  }
  return triages;
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
 * Findings trimmed for the trip back from the worker: verdicts, unresolved ids, review kind, and the
 * failing checks' ids and (shared) citations; passing and unverified checks are dropped. Measured/required values, notes and summaries are
 * dropped; they are most of the payload (≈150 MB serialized for the city). City-wide consumers
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
          checks: f.checks
            .filter((c) => c.passed === false)
            .map((c) => ({ id: c.id, label: "", passed: false, measured: null, required: null, citation: c.citation })),
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
      checks: e.checks.map((c) => (c.state === "pass" || c.state === "fail" ? { id: c.id, state: c.state, label: c.label, detail: "" } : c)),
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
 * The worker answers in up to three parts so the header stats paint before the evidence pass:
 * "evals" (first request only), then "triages", then "evidence" (the last part for a request).
 */
export type EvalResponse =
  | { seq: number; part: "evals"; evals: Evaluations; ms: number }
  | { seq: number; part: "triages"; triages: Triages; ms: number }
  | { seq: number; part: "evidence"; evidence: EvidenceByRuleSet; ms: number };
