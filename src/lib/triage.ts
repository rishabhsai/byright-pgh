import type { CompsFile, Comps, Finding, Lot, RuleSet, Triage, TriageResult, Typology, Verdict } from "./types";
import { TYPOLOGY_LABEL } from "./types";
import { evaluateLot } from "./rules";
import { compsForLot, DEFAULT_FINANCE, fmtUsd, runProforma, type FinanceAssumptions, type Proforma } from "./proforma";

/*
 * Green / Yellow / Red triage (organizer definition, AI Horizons 2026):
 *   red    = not developable for housing (zoning, or flood zone on steep or undermined ground)
 *   yellow = developable but needs review, a variance, a hazard review, or subsidy
 *   green  = buildable as is: a by-right typology, no hazard flags, and the numbers pencil
 *   gray   = district not encoded, so zoning was not evaluated
 */

const BUILDABLE: Verdict[] = ["by-right", "review", "variance"];
const VERDICT_RANK: Record<Verdict, number> = { "by-right": 0, review: 1, variance: 2, prohibited: 3, unknown: 4 };

const VERDICT_PHRASE: Record<Verdict, string> = {
  "by-right": "is allowed by right",
  review: "needs administrator or special exception review",
  variance: "needs a variance",
  prohibited: "is not permitted",
  unknown: "was not evaluated",
};

function hazardList(lot: Lot): string[] {
  const h: string[] = [];
  if (lot.hazards.steepSlope) h.push("steep slope (25%+)");
  if (lot.hazards.undermined) h.push("undermined area");
  if (lot.hazards.floodZone) h.push("FEMA flood zone");
  return h;
}

function result(triage: Triage, reasons: string[], best: Typology | null, pf: Proforma | null): TriageResult {
  return { triage, reasons, bestTypology: best, pencils: pf ? pf.pencils : null, gap: pf ? pf.gap : null };
}

export function triageLot(
  lot: Lot,
  findings: Finding[],
  comps: Comps | null,
  assumptions?: Partial<FinanceAssumptions>,
): TriageResult {
  if (findings.length === 0 || findings.every((f) => f.verdict === "unknown")) {
    return result("gray", [findings[0]?.summary ?? "Zoning was not evaluated for this lot."], null, null);
  }

  const buildable = findings.filter((f) => BUILDABLE.includes(f.verdict));
  if (buildable.length === 0) {
    return result("red", [`Zoning: no small home type is permitted in ${lot.zone}.`], null, null);
  }

  if (lot.hazards.floodZone && (lot.hazards.steepSlope || lot.hazards.undermined)) {
    const ground = lot.hazards.steepSlope ? "steep slope" : "undermined ground";
    return result("red", [`Topography: the lot is in a FEMA flood zone and on ${ground}.`], null, null);
  }

  const bestRank = Math.min(...buildable.map((f) => VERDICT_RANK[f.verdict]));
  const candidates = buildable.filter((f) => VERDICT_RANK[f.verdict] === bestRank);
  let best: Finding = candidates[0];
  let pf: Proforma | null = null;
  const mode = assumptions?.mode ?? DEFAULT_FINANCE.mode;
  const other = mode === "sale" ? "rent" : "sale";
  for (const f of candidates) {
    // If this lot lacks the comp the chosen mode needs, fall back to the other comp.
    const p = runProforma(lot, f.typology, comps, assumptions) ?? runProforma(lot, f.typology, comps, { ...assumptions, mode: other });
    if (p && (!pf || p.margin > pf.margin)) {
      pf = p;
      best = f;
    }
  }

  const reasons: string[] = [];
  const label = TYPOLOGY_LABEL[best.typology];
  reasons.push(`Zoning: ${label.toLowerCase()} ${VERDICT_PHRASE[best.verdict]} in ${lot.zone}.`);

  const hazards = hazardList(lot);
  if (hazards.length) reasons.push(`Site: flagged for ${hazards.join(" and ")}; needs a site review.`);

  if (!pf) {
    reasons.push("Finance: comps unavailable; finance not assessed.");
  } else {
    const basis = pf.mode === mode ? "" : ` (no ${mode} comp here, so ${pf.mode} comps were used)`;
    reasons.push(
      pf.pencils
        ? `Finance: pencils, ${pf.marginPct.toFixed(0)}% margin on ${fmtUsd(pf.totalCost)} cost${basis}.`
        : `Finance: needs about ${fmtUsd(pf.gap)} in subsidy to reach the target margin${basis}.`,
    );
  }

  const green = best.verdict === "by-right" && hazards.length === 0 && (pf === null || pf.pencils);
  return result(green ? "green" : "yellow", reasons, best.typology, pf);
}

export interface TriageCounts {
  green: number;
  yellow: number;
  red: number;
  gray: number;
}

export function triageCounts(
  lots: Lot[],
  ruleSet: RuleSet,
  compsFile: CompsFile | null,
  assumptions?: Partial<FinanceAssumptions>,
): TriageCounts {
  const counts: TriageCounts = { green: 0, yellow: 0, red: 0, gray: 0 };
  for (const lot of lots) {
    const t = triageLot(lot, evaluateLot(lot, ruleSet), compsForLot(lot, compsFile), assumptions).triage;
    counts[t] += 1;
  }
  return counts;
}
