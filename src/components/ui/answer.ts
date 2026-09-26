// Plain-language answer for one lot: the triage in words, the money line, the City status, and deltas.
import type { Finding, Lot, TriageResult, Typology } from "@/lib/types";
import { TYPOLOGY_LABEL, VERDICT_LABEL } from "@/lib/types";
import type { Proforma } from "@/lib/finance";

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
  if (t.triage === "green") return { text: "Ready: allowed and pays for itself", tone: "ready" };
  if (best?.verdict === "variance") return { text: "Needs a hearing", tone: "hearing" };
  if (best?.verdict === "review") return { text: "Needs staff approval", tone: "hearing" };
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

/** Deltas a planner thinks in: which single fact would flip the result. Up to two lines. */
export function whatWouldChange(lot: Lot, findings: Finding[], chosen: Finding | null, pf: Proforma | null): string[] {
  const out: string[] = [];
  // A use that is by right only below a width threshold, with frontage unknown.
  for (const f of findings) {
    if (f.verdict === "by-right") continue;
    const use = f.checks.find((c) => c.id === "use");
    const m = use?.note?.match(/by right only if lot width is ([\d.]+) ft or less/);
    if (m) {
      out.push(`Survey confirming width ≤ ${m[1]} ft → ${TYPOLOGY_LABEL[f.typology].toLowerCase()} allowed, no hearing`);
      break;
    }
  }
  if (chosen && chosen.verdict === "variance") {
    const failed = chosen.checks.filter((c) => c.passed === false && c.id !== "use");
    if (failed.length === 1) {
      const c = failed[0];
      const name = TYPOLOGY_LABEL[chosen.typology].toLowerCase();
      if (c.id === "lot-area" || c.id === "lot-area-per-unit")
        out.push(`Combining with a neighbor to reach ${c.required} → ${name} ${VERDICT_LABEL["by-right"].toLowerCase()}`);
      else if (c.id === "lot-width") out.push(`Frontage of ${c.required} (by survey or consolidation) → ${name} allowed, no hearing`);
      else if (c.id === "far") out.push(`A smaller building (${c.required}) → ${name} allowed, no hearing`);
    }
  }
  if (lot.lotAreaSqFt === null) out.push("A survey with the lot area → the lot-size checks resolve");
  if (pf && !pf.pencils && out.length < 2) out.push(`Subsidy of ${money(pf.gap)}, or a sale value of ${money(pf.breakEvenValue)} → passes finance`);
  return out.slice(0, 2);
}

export function typologyPhrase(t: Typology, f: Finding | null): string {
  return `${TYPOLOGY_LABEL[t]}${f ? `, ${VERDICT_LABEL[f.verdict].charAt(0).toLowerCase()}${VERDICT_LABEL[f.verdict].slice(1)}` : ""}`;
}
