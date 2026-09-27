// Plain-language answer for one lot: the triage in words, the money line, the City status, and deltas.
import type { Finding, Lot, RuleSet, TriageResult, Typology } from "@/lib/types";
import { TYPOLOGY_LABEL, verdictLabel, verdictShort } from "@/lib/types";
import { evaluateLot } from "@/lib/rules";
import type { Proforma } from "@/lib/finance";

/** Every UI verdict label goes through these (they keep the approval route). */
export { verdictLabel, verdictShort };

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** "$226k", "$1.4M", "$940" */
export function money(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e6) return `$${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e3) return `$${Math.round(a / 1e3)}k`;
  return `$${Math.round(a)}`;
}

export type AnswerTone = "ready" | "money" | "hearing" | "blocked" | "none";

export function answerHeadline(t: TriageResult | null, best: Finding | null, pf: Proforma | null): { text: string; tone: AnswerTone } {
  if (!t || t.triage === "gray") return { text: "Not checked", tone: "none" };
  if (t.triage === "red") return { text: "Blocked", tone: "blocked" };
  if (t.triage === "green") return { text: "Passes the screen: candidate for staff review", tone: "ready" };
  if (best?.verdict === "variance" || best?.verdict === "review") return { text: verdictLabel(best), tone: "hearing" };
  if (pf && !pf.pencils) return { text: "Allowed, needs subsidy", tone: "money" };
  if (!pf) return { text: "Allowed; finance not checked", tone: "money" };
  return { text: "Allowed, needs a check on site", tone: "money" };
}

export function financeLine(pf: Proforma | null): string | null {
  if (!pf) return null;
  const basis = pf.mode === "rent" ? "at market rent" : "at market";
  return pf.pencils ? `~${money(pf.margin)} margin (${Math.round(pf.marginPct)}%)` : `~${money(pf.gap)} short ${basis}`;
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

export function cityStatus(lot: Lot): { text: string; available: boolean } {
  const k = (lot.status || "unknown").trim().toLowerCase();
  return { text: STATUS[k] ?? `${lot.status} (confirm availability)`, available: k === "available for sale" };
}

/** "house allowed, no hearing" or "house would still need staff approval (administrator exception)". */
function outcome(f: Pick<Finding, "typology" | "verdict" | "reviewKind" | "checks">): string {
  const name = TYPOLOGY_LABEL[f.typology].toLowerCase();
  return f.verdict === "by-right" ? `${name} allowed, no hearing` : `${name} would still need ${lowerFirst(verdictLabel(f))}`;
}

/** Re-run the rules on the lot as it would be after one change, for the same home type. */
function reevaluate(lot: Lot, changed: Partial<Lot>, f: Finding): Finding | undefined {
  const rs: RuleSet = f.checks.find((c) => c.id === "use")?.citation.ruleSet ?? "current";
  return evaluateLot({ ...lot, ...changed }, rs).find((x) => x.typology === f.typology);
}

const amount = (s: string | null) => Number((s ?? "").replace(/[^\d.]/g, ""));

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
        // The prototype building size is fixed, so drop the FAR failure and keep the rest of the finding.
        const after = { ...chosen, verdict: chosen.reviewKind ? ("review" as const) : ("by-right" as const), checks: chosen.checks.filter((x) => x.id !== "far") };
        out.push(`A smaller building (${c.required}) → ${outcome(after)}`);
      }
    }
  }
  if (lot.lotAreaSqFt === null) out.push("A survey with the lot area → the lot-size checks resolve");
  if (pf && !pf.pencils && out.length < 2)
    out.push(`Subsidy of ${money(pf.gap)}, or a ${pf.mode === "rent" ? "capitalized" : "sale"} value of ${money(pf.breakEvenValue)} → clears the cost-and-return screen`);
  return out.slice(0, 2);
}

export function typologyPhrase(t: Typology, f: Finding | null): string {
  return `${TYPOLOGY_LABEL[t]}${f ? `, ${lowerFirst(verdictLabel(f))}` : ""}`;
}
