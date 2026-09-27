// Plain-language answer for one lot: the triage in words, the money line, the City status, and deltas.
import type { Finding, Lot, RuleSet, TriageResult, Typology } from "@/lib/types";
import { TYPOLOGY_LABEL, verdictLabel as libVerdictLabel, verdictShort, type LabelInput, type Verdict } from "@/lib/types";
import { evaluateLot } from "@/lib/rules";
import type { Proforma } from "@/lib/finance";
import type { Evidence } from "@/lib/evidence";
import { isParkOrGreenway } from "@/lib/ranking";

/** Every UI verdict label goes through these (they keep the approval route). */
export { verdictShort };

/** What a by-right verdict establishes: the use table and the lot-size standard, nothing about the building. */
export const ALLOWED_LABEL = "Allowed by use table";
export const ALLOWED_TIP = "Use permitted (§ 911.02) and lot-size standard met; setbacks, height, coverage not checked";

/** The lib's label, with by-right worded as what was actually checked (never "no hearing"). */
export function verdictLabel(f: LabelInput): string {
  return f.verdict === "by-right" ? ALLOWED_LABEL : libVerdictLabel(f);
}

/** Generic label per verdict, for places without a finding. */
export function verdictWord(v: Verdict): string {
  return verdictLabel({ verdict: v, reviewKind: null });
}

/** A lib reason phrase in the UI's vocabulary ("needs subsidy" reads as a modeled shortfall). */
export function reasonText(r: string | null): string | null {
  if (!r) return r;
  return r === "needs subsidy" ? "modeled shortfall" : r;
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** "$226k", "$1.4M", "$940" */
export function money(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e6) return `$${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e3) return `$${Math.round(a / 1e3)}k`;
  return `$${Math.round(a)}`;
}

export type AnswerTone = "ready" | "money" | "hearing" | "blocked" | "none";

export function answerHeadline(
  t: TriageResult | null,
  best: Finding | null,
  pf: Proforma | null,
  lot?: (Pick<Lot, "status" | "inventoryType"> & Partial<Pick<Lot, "zoneAgrees">>) | null,
): { text: string; tone: AnswerTone } {
  if (!t || t.triage === "gray") return { text: "Not checked", tone: "none" };
  if (t.triage === "red") return { text: "Blocked", tone: "blocked" };
  if (t.triage === "green") return { text: "Passes the screen: candidate for staff review", tone: "ready" };
  if (lot?.zoneAgrees === false && best?.verdict !== "prohibited") return { text: "District unconfirmed: confirm the zoning first", tone: "hearing" };
  if (best?.verdict === "variance" || best?.verdict === "review") return { text: verdictLabel(best), tone: "hearing" };
  if (lot && !cityStatus(lot).available) return { text: "Allowed by use table, but not for sale", tone: "money" };
  if (lot && isParkOrGreenway(lot.inventoryType)) return { text: "Allowed by use table, but not a disposition candidate", tone: "money" };
  if (pf && !pf.pencils) return { text: "Allowed by use table; modeled shortfall", tone: "money" };
  if (!pf) return { text: "Allowed by use table; finance not checked", tone: "money" };
  return { text: "Allowed by use table; needs a check on site", tone: "money" };
}

/** Margins above this read as an artifact of an index value, not a comp; flagged on the card. */
export const HIGH_MARGIN_PCT = 25;

/**
 * Why the selected proposal gets no money line: it fails Fit or Use, or the lot is not for sale.
 * "Triplex: not buildable as proposed (FAR)", "House: not for sale (Hold for Study)". Null when a finance line is fair.
 */
export interface Blocker {
  text: string;
  /** Panel section that explains it; null when the card itself does (City status). */
  why: "fits" | "allowed" | null;
}

export function blockerLine(
  lot: Pick<Lot, "status" | "inventoryType"> & Partial<Pick<Lot, "zone" | "zoneMap" | "zoneAgrees">>,
  typology: Typology,
  finding: Pick<Finding, "verdict" | "checks"> | null,
  evidence: Pick<Evidence, "checks"> | null,
): Blocker | null {
  const name = TYPOLOGY_LABEL[typology];
  const state = (id: string) => evidence?.checks.find((c) => c.id === id)?.state;
  const useFails = finding?.verdict === "prohibited" || state("use") === "fail";
  if (useFails) return { text: `${name}: not allowed here (use)`, why: "allowed" };
  if (lot.zoneAgrees === false)
    return { text: `${name}: district unconfirmed (inventory ${lot.zone || "none"}, map ${lot.zoneMap ?? "other"})`, why: "allowed" };
  if (state("fit") === "fail") {
    const far = finding?.checks.some((c) => c.id === "far" && c.passed === false);
    return { text: `${name}: not buildable as proposed (${far ? "FAR" : "building fit"})`, why: "fits" };
  }
  if (!cityStatus(lot).available) {
    const raw = (lot.status || "").trim();
    return { text: `${name}: not for sale${raw ? ` (${raw})` : ""}`, why: null };
  }
  if (isParkOrGreenway(lot.inventoryType)) return { text: `${name}: not a disposition candidate (${lot.inventoryType})`, why: null };
  return null;
}

export function financeLine(pf: Proforma | null): string | null {
  if (!pf) return null;
  return pf.pencils ? `~${money(pf.margin)} margin (${Math.round(pf.marginPct)}%)` : `~${money(pf.gap)} modeled shortfall${pf.mode === "rent" ? " (rent)" : ""}`;
}

const STATUS: Record<string, string> = {
  "available for sale": "Available for sale",
  "hold for study": "Held for study (not for sale)",
  "permanent city ownership": "Permanent City ownership (not for sale)",
  "sale pending": "Sale pending (not available)",
  "litigation pending": "Litigation pending (not for sale)",
  "acquisition pending": "Acquisition pending (not yet for sale)",
  unknown: "Unknown (confirm with the City)",
  cancelled: "Cancelled (confirm with the City)",
  "privately owned": "Privately owned (not City property)",
};

export function cityStatus(lot: Pick<Lot, "status">): { text: string; available: boolean } {
  const k = (lot.status || "unknown").trim().toLowerCase();
  return { text: STATUS[k] ?? `${lot.status} (confirm availability)`, available: k === "available for sale" };
}

/** "house allowed by use table" or "house would still need staff approval (administrator exception)". */
function outcome(f: Pick<Finding, "typology" | "verdict" | "reviewKind" | "checks">): string {
  const name = TYPOLOGY_LABEL[f.typology].toLowerCase();
  return f.verdict === "by-right" ? `${name} ${lowerFirst(ALLOWED_LABEL)}` : `${name} would still need ${lowerFirst(verdictLabel(f))}`;
}

/** Re-run the rules on the lot as it would be after one change, for the same home type. */
function reevaluate(lot: Lot, changed: Partial<Lot>, f: Finding): Finding | undefined {
  const rs: RuleSet = f.checks.find((c) => c.id === "use")?.citation.ruleSet ?? "current";
  return evaluateLot({ ...lot, ...changed }, rs).find((x) => x.typology === f.typology);
}

const amount = (s: string | null) => Number((s ?? "").replace(/[^\d.]/g, ""));

/** Homes per proposal, and the smallest floor area we would call a home, for the FAR delta. */
const UNITS: Record<Typology, number> = { single: 1, single_adu: 2, duplex: 2, triplex: 3, townhome: 1 };
const MIN_SF_PER_HOME = 400;
const fmtSf = (n: number) => `${Math.round(n).toLocaleString("en-US")} sq ft`;

/**
 * Deltas a planner thinks in: which single fact would change the result, and what the result would
 * then be (re-evaluated, so a Hillside use approval survives a lot-size fix). Up to two lines.
 */
export function whatWouldChange(lot: Lot, findings: Finding[], chosen: Finding | null, pf: Proforma | null): string[] {
  const out: string[] = [];
  // A use that is by right only below a width threshold, with frontage unknown.
  for (const f of findings) {
    if (f.verdict === "by-right") continue;
    const use = f.checks.find((c) => c.id === "use");
    const m = use?.note?.match(/by right only if lot width is ([\d.]+) ft or less/);
    if (m) {
      const after = reevaluate(lot, { frontageFt: Number(m[1]) }, f);
      if (after) out.push(`Survey confirming width ≤ ${m[1]} ft → ${outcome(after)}`);
      break;
    }
  }
  if (chosen && chosen.verdict === "variance") {
    const failed = chosen.checks.filter((c) => c.passed === false && c.id !== "use");
    if (failed.length === 1) {
      const c = failed[0];
      if (c.id === "lot-area" || c.id === "lot-area-per-unit") {
        const after = reevaluate(lot, { lotAreaSqFt: amount(c.required) }, chosen);
        if (after) out.push(`Combining with a neighbor to reach ${c.required} → ${outcome(after)}`);
      } else if (c.id === "lot-width") {
        const after = reevaluate(lot, { frontageFt: amount(c.required) }, chosen);
        if (after) out.push(`Frontage of ${c.required} (by survey or consolidation) → ${outcome(after)}`);
      } else if (c.id === "far") {
        const cap = amount(c.required?.match(/at most ([\d,]+)/)?.[1] ?? null);
        const units = UNITS[chosen.typology];
        if (cap && cap / units < MIN_SF_PER_HOME) {
          // A 518 sq ft triplex is not a proposal; the realistic path is more land.
          out.push(`Combining with a neighbor → more floor area under the FAR cap (${fmtSf(cap)} here, too small for ${units > 1 ? `${units} homes` : "a home"})`);
        } else {
          // The prototype building size is fixed, so drop the FAR failure and keep the rest of the finding.
          const after = { ...chosen, verdict: chosen.reviewKind ? ("review" as const) : ("by-right" as const), checks: chosen.checks.filter((x) => x.id !== "far") };
          out.push(`A smaller building (${c.required}) → ${outcome(after)}`);
        }
      }
    }
  }
  if (lot.lotAreaSqFt === null) out.push("A survey with the lot area → the lot-size checks resolve");
  if (pf && !pf.pencils && out.length < 2)
    out.push(`Closing the ${money(pf.gap)} modeled shortfall, or a ${pf.mode === "rent" ? "capitalized" : "sale"} value of ${money(pf.breakEvenValue)} → clears the cost-and-return screen`);
  return out.slice(0, 2);
}

export function typologyPhrase(t: Typology, f: Finding | null): string {
  return `${TYPOLOGY_LABEL[t]}${f ? `, ${lowerFirst(verdictLabel(f))}` : ""}`;
}

/**
 * The approval route an exception use needs, for the evidence row's Use pill (never "Unknown").
 * Null when the zoning map disagrees with the inventory district: then Use is genuinely unknown.
 */
export function approvalRoute(f: Pick<Finding, "reviewKind"> | null, lot?: Pick<Lot, "zoneAgrees"> | null): { short: string; full: string } | null {
  if (!f?.reviewKind || lot?.zoneAgrees === false) return null;
  const route = { verdict: "review" as const, reviewKind: f.reviewKind };
  return { short: verdictShort(route), full: verdictLabel(route) };
}
