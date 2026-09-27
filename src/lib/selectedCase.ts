// The selected lot as one case: every panel section and export reads the same proposal, rule set,
// assumptions (with this lot's land figure) and results. Nothing downstream recomputes a proposal.
import type { Comps, Finding, Lot, RuleSet, TriageResult, Typology } from "./types";
import { triageLot } from "./triage";
import { evidenceForLot, pickFinding, type Evidence } from "./evidence";
import { proformaWithFallback, type FinanceAssumptions, type Proforma } from "./finance";

/** Where the selected proposal came from. */
export type TypologySource = "filter" | "picked" | "best";

export interface SelectedCase {
  lot: Lot;
  ruleSet: RuleSet;
  /** The proposal every section shows: the Home type filter, else the user's pick, else the best type. */
  typology: Typology;
  typologySource: TypologySource;
  /** The type the map colors this lot by when the Home type filter is Any (triage's best type). */
  bestTypology: Typology | null;
  /** Full-text findings for both rule sets. */
  findings: Record<RuleSet, Finding[]>;
  /** The selected proposal's finding under `ruleSet`. */
  finding: Finding | null;
  /** Triage for the selected proposal (not the map's best-type triage). */
  triage: TriageResult;
  /** Triage across all types: what the map shows with the Home type filter on Any. */
  bestTriage: TriageResult;
  /** Shared assumptions with this lot's land figure applied. */
  assumptions: FinanceAssumptions;
  landOverride: number | null;
  proforma: Proforma | null;
  evidence: Evidence;
  comps: Comps | null;
}

export function buildSelectedCase(args: {
  lot: Lot;
  ruleSet: RuleSet;
  findings: Record<RuleSet, Finding[]>;
  comps: Comps | null;
  assumptions: FinanceAssumptions;
  landOverride: number | null;
  filterTypology: Typology | null;
  pickedTypology: Typology | null;
}): SelectedCase {
  const { lot, ruleSet, findings, comps, landOverride, filterTypology, pickedTypology } = args;
  const assumptions: FinanceAssumptions = { ...args.assumptions, landOverride };
  const fs = findings[ruleSet];
  const bestTriage = triageLot(lot, fs, comps, assumptions, null);
  const typology: Typology =
    filterTypology ?? pickedTypology ?? bestTriage.bestTypology ?? (fs.length ? pickFinding(fs, bestTriage, null).typology : "single");
  const typologySource: TypologySource = filterTypology ? "filter" : pickedTypology ? "picked" : "best";
  const triage = typology === bestTriage.bestTypology ? bestTriage : triageLot(lot, fs, comps, assumptions, typology);
  const finding = fs.find((f) => f.typology === typology) ?? null;
  const proforma = proformaWithFallback(lot, typology, comps, assumptions);
  const evidence = evidenceForLot(lot, fs, triage, comps, assumptions, typology);
  return {
    lot,
    ruleSet,
    typology,
    typologySource,
    bestTypology: bestTriage.bestTypology,
    findings,
    finding,
    triage,
    bestTriage,
    assumptions,
    landOverride,
    proforma,
    evidence,
    comps,
  };
}

/** True when the panel shows a different proposal than the map's best-type color. */
export function showsOtherThanBest(c: SelectedCase): boolean {
  return c.bestTypology !== null && c.typology !== c.bestTypology;
}
