import type { CompsFile, Comps, Finding, Lot, RuleSet, Triage, TriageResult, Typology, Verdict } from "./types";
import { TYPOLOGY_LABEL } from "./types";
import { evaluateLot } from "./rules";
import { compsForLot, DEFAULT_FINANCE, fmtNum, fmtUsd, runProforma, type FinanceAssumptions, type Proforma } from "./proforma";

/*
 * Green / Yellow / Red triage (organizer colors; the evidence behind them is narrower):
 *   red    = major screening obstacle: no small home type is permitted, or flood zone on steep or undermined ground
 *   yellow = needs more information, review, relief, or a different financial scenario
 *   green  = passes the preliminary screen under the displayed assumptions: a by-right type, lot area,
 *            frontage and flood screening known, no hazard flags, lot-size checks resolved, and the numbers pencil
 *   gray   = district not encoded, so zoning was not evaluated
 */

const BUILDABLE: Verdict[] = ["by-right", "review", "variance"];
const VERDICT_RANK: Record<Verdict, number> = { "by-right": 0, review: 1, variance: 2, prohibited: 3, unknown: 4 };

const VERDICT_PHRASE: Record<Verdict, string> = {
  "by-right": "is allowed by right",
  review: "needs administrator or special exception review",
  variance: "needs relief (a variance or a § 921.04 exception)",
  prohibited: "is not permitted",
  unknown: "was not evaluated",
};

/** Screening floor for a buildable footprint; the code sets no minimum in LNC or VH districts. */
export const MIN_PRACTICAL_LOT_SQFT = 1000;

function hazardList(lot: Lot): string[] {
  const h: string[] = [];
  if (lot.hazards.steepSlope) h.push("steep slope (25%+)");
  if (lot.hazards.undermined) h.push("undermined area");
  if (lot.hazards.floodZone) h.push("FEMA flood zone");
  return h;
}

/** Unresolved checks that keep a lot out of Green: the lot-size standards need a known area and width. */
const BLOCKING_UNRESOLVED = new Set(["lot-area", "lot-area-per-unit", "lot-width", "far"]);

export const PARKING_REASON = "Confirm on-site parking on the site plan (§ 914.02.A)";

function result(triage: Triage, reasons: string[], best: Typology | null, pf: Proforma | null): TriageResult {
  return { triage, reasons, bestTypology: best, pencils: pf ? pf.pencils : null, gap: pf ? pf.gap : null, margin: pf ? pf.margin : null };
}

export function triageLot(
  lot: Lot,
  findings: Finding[],
  comps: Comps | null,
  assumptions?: Partial<FinanceAssumptions>,
  typology?: Typology | null,
): TriageResult {
  if (findings.length === 0 || findings.every((f) => f.verdict === "unknown")) {
    return result("gray", [findings[0]?.summary ?? "Zoning was not evaluated for this lot."], null, null);
  }

  const chosen = typology ? findings.find((f) => f.typology === typology) : undefined;
  if (typology && (!chosen || chosen.verdict === "unknown")) {
    return result("gray", [`${TYPOLOGY_LABEL[typology]} was not evaluated in ${lot.zone}.`], null, null);
  }
  if (chosen && chosen.verdict === "prohibited") {
    const why =
      chosen.typology === "single_adu" && chosen.checks.find((c) => c.id === "adu-eligibility")?.passed === false
        ? `${TYPOLOGY_LABEL[chosen.typology]} is not permitted in ${lot.zone} outside an ADU Overlay District.`
        : `${TYPOLOGY_LABEL[chosen.typology]} is not listed in ${lot.zone}.`;
    return result("red", [`Zoning: ${why}`], null, null);
  }

  const buildable = chosen ? [chosen] : findings.filter((f) => BUILDABLE.includes(f.verdict));
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

  const unresolved = best.unresolved ?? [];
  const lotSizeOpen = unresolved.some((id) => BLOCKING_UNRESOLVED.has(id));
  const areaUnknown = lot.lotAreaSqFt === null;
  if (areaUnknown) {
    reasons.push("Site: lot area is not in the City inventory, so the minimum lot size and the screening floor cannot be checked (needs survey).");
  } else if (lotSizeOpen) {
    reasons.push("Site: a lot-size standard could not be verified from inventory data (needs survey).");
  }
  const widthUnknown = lot.frontageFt === null;
  if (widthUnknown && !lotSizeOpen) reasons.push("Site: frontage is not in the County legal description, so lot width is unknown (needs survey).");
  const floodUnknown = lot.hazards.floodZone === null;
  if (floodUnknown) reasons.push("Site: FEMA flood screening is missing for this lot; treated as unresolved, not clear.");

  const hazards = hazardList(lot);
  if (hazards.length) reasons.push(`Site: flagged for ${hazards.join(" and ")}; needs a site review.`);
  const sliver = lot.lotAreaSqFt !== null && lot.lotAreaSqFt < MIN_PRACTICAL_LOT_SQFT;
  if (sliver) {
    reasons.push(
      `Site: ${fmtNum(lot.lotAreaSqFt!)} sq ft is below the ${fmtNum(MIN_PRACTICAL_LOT_SQFT)} sq ft screening floor; likely needs consolidation with a neighboring lot (assumption, not code).`,
    );
  }

  if (!pf) {
    reasons.push("Finance: comps unavailable; finance not assessed.");
  } else {
    const basis = pf.mode === mode ? "" : ` (no ${mode} comp here, so ${pf.mode} comps were used)`;
    reasons.push(
      pf.pencils
        ? `Finance: pencils, ${pf.marginPct.toFixed(0)}% margin on ${fmtUsd(pf.totalCost)} cost${basis}.`
        : `Finance: modeled shortfall to target return about ${fmtUsd(pf.gap)}${basis}.`,
    );
  }
  if (unresolved.includes("parking")) reasons.push(PARKING_REASON);

  const green =
    best.verdict === "by-right" &&
    !areaUnknown &&
    !lotSizeOpen &&
    !widthUnknown &&
    !floodUnknown &&
    hazards.length === 0 &&
    !sliver &&
    pf !== null &&
    pf.pencils;
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
  typology?: Typology | null,
): TriageCounts {
  const counts: TriageCounts = { green: 0, yellow: 0, red: 0, gray: 0 };
  for (const lot of lots) {
    const t = triageLot(lot, evaluateLot(lot, ruleSet), compsForLot(lot, compsFile), assumptions, typology).triage;
    counts[t] += 1;
  }
  return counts;
}
