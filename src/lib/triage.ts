import type { CompsFile, Comps, Finding, Lot, RuleSet, Triage, TriageResult, Typology, Verdict } from "./types";
import { TYPOLOGY_LABEL } from "./types";
import { evaluateLot } from "./rules";
import { deriveEvidence, financeResult, firstOpenItem, MIN_PRACTICAL_LOT_SQFT, zoneConflict, type Evidence, type EvidenceId } from "./evidence";
import { isAvailable, isDispositionEligible } from "./ranking";
import { compsForLot, DEFAULT_FINANCE, fmtNum, fmtUsd, isNarrowLot, runProforma, UNIT_PLAN, type FinanceAssumptions, type Proforma } from "./proforma";

/*
 * Green / Yellow / Red triage (organizer colors; the evidence behind them is narrower):
 *   red    = major screening obstacle: no small home type is permitted, or flood zone on steep or undermined ground
 *   yellow = needs more information, review, relief, or a different financial scenario
 *   green  = GREEN_POLICY, read off the same evidence row the UI shows
 *   gray   = district not encoded, so zoning was not evaluated
 */

/** How triage picks a lot's default proposal among the types with its best verdict. */
export const DEFAULT_PROPOSAL_RULE =
  "the allowed home type with the lowest modeled shortfall to the target return (the highest margin when more than one clears the screen), ties to fewer dwellings; on a lot under 25 ft the attached form replaces the detached house";

/** The one statement of what Green means. Shown in the UI and About; meetsGreenPolicy implements it. */
export const GREEN_POLICY =
  "Green means the lot passes this preliminary screen under the displayed assumptions: its best home type is allowed by the use table and lot-size standards; " +
  "the Use, Lot size, Width and Site checks all pass (Use is Unknown when the City zoning map names a different district than the inventory at the lot's point, or none); " +
  "Fit is not failing (setbacks, height and coverage are not modeled, so Fit is usually Not checked); " +
  "Finance passes the cost-and-return screen; and the City records the lot as Available for Sale, not as a park, greenway or infrastructure-protection parcel and not as privately owned. " +
  "Two open items do not block Green: Fit not checked, and required on-site parking not verified; both stay listed on the lot. " +
  "Green is a candidate for staff review, not a determination that the lot can be built or offered for sale. " +
  `The proposal screened on each lot is ${DEFAULT_PROPOSAL_RULE}.`;

/**
 * Is modeled result `p` a better default proposal than `q`? Lowest shortfall first (every type that clears
 * the screen has shortfall 0, so the higher margin decides among them), then fewer dwellings.
 */
function betterProposal(p: Proforma, q: Proforma | null): boolean {
  if (!q) return true;
  if (p.gap !== q.gap) return p.gap < q.gap;
  if (p.margin !== q.margin) return p.margin > q.margin;
  return p.units < q.units;
}

const GREEN_MUST_PASS: EvidenceId[] = ["use", "lotSize", "width", "site", "finance"];

/** Why the City's own record keeps a lot off the Green list, or null when it is recorded for sale and not a park type. */
export function dispositionBlocker(lot: Pick<Lot, "status" | "inventoryType">): string | null {
  if (!isAvailable(lot)) return `Not for sale (City status: ${lot.status || "not recorded"})`;
  if (!isDispositionEligible(lot)) return `Not a disposition candidate (City inventory type: ${lot.inventoryType})`;
  return null;
}

/** GREEN_POLICY as code: the best finding, its evidence row, and the lot's recorded disposition status. */
export function meetsGreenPolicy(
  best: Pick<Finding, "verdict">,
  evidence: Pick<Evidence, "checks">,
  lot: Pick<Lot, "status" | "inventoryType">,
): boolean {
  const state = (id: EvidenceId) => evidence.checks.find((c) => c.id === id)?.state;
  return (
    best.verdict === "by-right" &&
    GREEN_MUST_PASS.every((id) => state(id) === "pass") &&
    state("fit") !== "fail" &&
    dispositionBlocker(lot) === null
  );
}

const BUILDABLE: Verdict[] = ["by-right", "review", "variance"];
const VERDICT_RANK: Record<Verdict, number> = { "by-right": 0, review: 1, variance: 2, prohibited: 3, unknown: 4 };

const VERDICT_PHRASE: Record<Verdict, string> = {
  "by-right": "is allowed by right",
  review: "needs administrator or special exception review",
  variance: "needs relief (a variance or a § 921.04 exception)",
  prohibited: "is not permitted",
  unknown: "was not evaluated",
};

export { MIN_PRACTICAL_LOT_SQFT };

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
  // A selected type whose permission turns on a missing fact (width, ADU overlay) is screened as unresolved, not skipped.
  if (typology && (!chosen || (chosen.verdict === "unknown" && !chosen.permissionQuestion))) {
    return result("gray", [`${TYPOLOGY_LABEL[typology]} was not evaluated in ${lot.zone}.`], null, null);
  }
  if (chosen && chosen.verdict === "prohibited") {
    return result("red", [`Zoning: ${TYPOLOGY_LABEL[chosen.typology]} is not listed in ${lot.zone}.`], null, null);
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
  // Fewer dwellings first, so an unassessed tie falls to the smaller proposal.
  let candidates = buildable
    .filter((f) => VERDICT_RANK[f.verdict] === bestRank)
    .sort((a, b) => UNIT_PLAN[a.typology].units - UNIT_PLAN[b.typology].units);
  // Prototype follows the lot: under 25 ft a detached house loses its side yards, so the attached form is the proposal.
  const byRightTownhome = candidates.some((f) => f.typology === "townhome" && f.verdict === "by-right");
  if (isNarrowLot(lot) && byRightTownhome) candidates = candidates.filter((f) => f.typology !== "single");
  let best: Finding = candidates[0];
  let pf: Proforma | null = null;
  const mode = assumptions?.mode ?? DEFAULT_FINANCE.mode;
  const other = mode === "sale" ? "rent" : "sale";
  for (const f of candidates) {
    // If this lot lacks the comp the chosen mode needs, fall back to the other comp.
    const p = runProforma(lot, f.typology, comps, assumptions) ?? runProforma(lot, f.typology, comps, { ...assumptions, mode: other });
    if (p && betterProposal(p, pf)) {
      pf = p;
      best = f;
    }
  }

  const reasons: string[] = [];
  const label = TYPOLOGY_LABEL[best.typology];
  const evidence = deriveEvidence(lot, best, null, pf, comps);
  // The shared first open item decides what leads: an unconfirmed district comes before every other reason.
  const conflict = firstOpenItem(lot, best, evidence)?.id === "district-conflict" ? zoneConflict(lot) : null;
  if (conflict) reasons.push(`Zoning: ${conflict}`);
  const q = best.permissionQuestion;
  reasons.push(
    q && best.verdict === "unknown"
      ? `Zoning: ${label.toLowerCase()} permission unresolved in ${lot.zone}: ${q.question}.`
      : `Zoning: ${label.toLowerCase()} ${VERDICT_PHRASE[best.verdict]} in ${lot.zone}${conflict ? " (the inventory district, unconfirmed)" : ""}.`,
  );
  const blocker = dispositionBlocker(lot);
  if (blocker) reasons.push(blocker);

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

  // One financial result: an unscreened proposal publishes no margin, gap or pencil flag.
  const finance = financeResult(lot, best, evidence, pf);
  if (!pf) {
    reasons.push("Finance: comps unavailable; finance not assessed.");
  } else if (!finance.screened) {
    reasons.push(`Finance: not screened (${finance.reason}).`);
  } else {
    const basis = pf.mode === mode ? "" : ` (no ${mode} comp here, so ${pf.mode} comps were used)`;
    reasons.push(
      pf.pencils
        ? `Finance: clears the cost-and-return screen, ${pf.marginPct.toFixed(0)}% modeled margin on ${fmtUsd(pf.totalCost)} cost${basis}.`
        : `Finance: modeled shortfall to target return about ${fmtUsd(pf.gap)}${basis}.`,
    );
  }
  if (unresolved.includes("parking")) reasons.push(PARKING_REASON);

  const green = best.verdict === "by-right" && meetsGreenPolicy(best, evidence, lot);
  return result(green ? "green" : "yellow", reasons, best.typology, finance.screened ? pf : null);
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
