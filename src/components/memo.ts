import type { Lot, RuleSet } from "@/lib/types";
import { TYPOLOGY_LABEL } from "@/lib/types";
import { verdictLabel } from "./ui/answer";
import { RULESET_LABEL } from "@/lib/engine";
import { fmtUsd } from "@/lib/finance";
import { EVIDENCE_STATE_LABEL } from "@/lib/evidence";
import type { SelectedCase } from "@/lib/selectedCase";
import { evidenceSummary } from "./ui/evidenceText";
import { approvalRoute } from "./ui/answer";

/**
 * The lot brief: the selected case as shown in the panel (proposal, rule set, this lot's land
 * figure and the finance assumptions), then every check with its citation.
 */
export function buildMemo(c: SelectedCase, shown: { headline: string; districtName: string | null; changes: string[] }): string {
  const { lot, ruleSet, typology, finding, proforma: pf, evidence } = c;
  const findings = c.findings[ruleSet];
  const otherRs: RuleSet = ruleSet === "current" ? "bill-2025-1545" : "current";
  const other = c.findings[otherRs];
  const L: string[] = [];
  const today = new Date().toISOString().slice(0, 10);
  const name = TYPOLOGY_LABEL[typology];
  L.push(`# Lot brief: ${lot.address || lot.id}`, "");
  L.push(`Prepared ${today} with ByRight PGH under ${RULESET_LABEL[ruleSet]}. A screen, not a zoning decision. The City's Zoning Administrator decides.`, "");

  L.push("## Selected proposal");
  const source = c.typologySource === "filter" ? "Home type filter" : c.typologySource === "picked" ? "selected in the panel" : "best type for this lot";
  L.push(`- Proposal: ${name} (${source})${c.bestTypology && c.bestTypology !== typology ? `. Best type here: ${TYPOLOGY_LABEL[c.bestTypology]}` : ""}`);
  L.push(`- Answer: ${shown.headline}`);
  if (finding) L.push(`- Zoning: ${verdictLabel(finding)}${finding.summary ? `. ${finding.summary}` : ""}`);
  L.push(`- Evidence: ${evidenceSummary(evidence, approvalRoute(finding, lot)?.full)}`);
  for (const ch of shown.changes) L.push(`- What would change this: ${ch}`);
  L.push("");

  L.push("## Parcel");
  L.push(`- Parcel ID: ${lot.id}`);
  L.push(`- Neighborhood: ${lot.neighborhood}${lot.councilDistrict ? ` (Council District ${lot.councilDistrict})` : ""}`);
  L.push(`- Zone: ${lot.zone || "none"}${shown.districtName ? ` (${shown.districtName})` : ""}`);
  L.push(`- Lot area: ${lot.lotAreaSqFt != null ? `${lot.lotAreaSqFt.toLocaleString()} sf` : "not in record"}`);
  L.push(`- Street frontage (approx.): ${lot.frontageFt != null ? `${lot.frontageFt} ft, parsed from the legal description; a survey governs` : "not in record"}`);
  L.push(`- County land value: ${lot.landValue != null ? `$${lot.landValue.toLocaleString()}` : "not in record"} (2012-base assessment, not a market price)`);
  L.push(`- City status: ${lot.status} (City inventory; not proof of current ownership or availability)`);
  L.push("");

  L.push(`## Six screening checks for the ${name.toLowerCase()}`);
  for (const e of evidence.checks) {
    const cite = e.citation ? ` [${e.citation.section}](${e.citation.url})` : "";
    const word = (e.id === "use" && e.state === "unknown" && approvalRoute(finding, lot)?.full) || EVIDENCE_STATE_LABEL[e.state];
    L.push(`- ${e.label}: ${word}. ${e.detail}${cite}`);
  }
  const open = (finding?.checks ?? []).filter((k) => k.passed === null);
  if (open.length) {
    L.push("", "Unresolved requirements (confirm before relying on this screen):");
    for (const k of open) L.push(`- ${k.label}${k.required ? `: ${k.required}` : ""}.${k.note ? ` ${k.note}` : ""} [${k.citation.section}](${k.citation.url})`);
  }
  L.push("");

  L.push(`## Finance scenario for the ${name.toLowerCase()}`);
  if (!pf) {
    L.push("Not screened: no comparable value series for this lot.");
  } else {
    L.push(pf.pencils ? `Modeled margin ${fmtUsd(pf.margin)} (${Math.round(pf.marginPct)}%).` : `Modeled shortfall ${fmtUsd(pf.gap)} to the target return.`);
    L.push("");
    L.push("| Line | Amount |", "|---|---:|");
    L.push(`| Land (${pf.landSource === "override" ? "your figure for this lot" : pf.landSource === "assessed" ? "County land value" : "assumed; no assessment"}) | ${fmtUsd(pf.land)} |`);
    L.push(`| Construction, ${pf.buildingSf.toLocaleString()} sf | ${fmtUsd(pf.hard)} |`);
    L.push(`| Soft costs and developer fee | ${fmtUsd(pf.soft + pf.devFee)} |`);
    L.push(`| Total cost | ${fmtUsd(pf.totalCost)} |`);
    L.push(`| ${pf.mode === "rent" ? "Value as a rental" : "Modeled sale value"} | ${fmtUsd(pf.revenue)} |`);
    L.push(`| Value needed for the target return | ${fmtUsd(pf.breakEvenValue)} |`);
    L.push("", "Assumptions used:");
    for (const i of pf.inputsUsed) L.push(`- ${i.label}: ${i.display}${i.assumed ? " (assumption)" : ""}. ${i.source}${i.url ? ` (${i.url})` : ""}`);
    L.push("", "Aggregate neighborhood and ZIP indices, not a parcel appraisal or a subsidy determination.");
  }
  L.push("");

  L.push(`## Every home type under ${RULESET_LABEL[ruleSet]}`);
  for (const f of findings) {
    L.push("", `### ${TYPOLOGY_LABEL[f.typology]}: ${verdictLabel(f)}${f.typology === typology ? " (selected)" : ""}`);
    if (f.summary) L.push(f.summary);
    for (const k of f.checks) {
      const status = k.passed === true ? "pass" : k.passed === false ? "fail" : "not verified";
      const mr = [k.measured && `measured ${k.measured}`, k.required && `required ${k.required}`].filter(Boolean).join(", ");
      L.push(`- ${k.label}: ${status}${mr ? ` (${mr})` : ""}. [${k.citation.section} ${k.citation.title}](${k.citation.url})${k.note ? ` ${k.note}` : ""}`);
    }
  }
  const changes = findings.map((f, i) => ({ f, o: other[i] })).filter(({ f, o }) => o && o.verdict !== f.verdict);
  L.push("", `## Compared with ${RULESET_LABEL[otherRs]}`);
  if (!changes.length) L.push("No verdict changes on this lot.");
  for (const { f, o } of changes) L.push(`- ${TYPOLOGY_LABEL[f.typology]}: ${verdictLabel(f)} now, ${verdictLabel(o)} under ${RULESET_LABEL[otherRs]}`);
  L.push("", "## Before you rely on this");
  for (const item of REVIEW_CHECKLIST) L.push(`- [ ] ${item}`);
  L.push("");
  return L.join("\n");
}

export const REVIEW_CHECKLIST = [
  "Confirm the zoning determination with the City's Zoning Administrator.",
  "Order a survey to confirm lot width, depth, and area.",
  "Check overlay districts and any open zoning cases on the parcel.",
  "Verify utility connections and legal street access.",
];

/** A few plain lines for pasting into an email or chat. */
export function buildSummary(
  lot: Lot,
  ruleSet: RuleSet,
  answer: { headline: string; typeLine: string; financeLine: string | null; status: string; evidence: string | null },
): string {
  return [
    `${lot.address || "Unaddressed lot"}, ${lot.neighborhood} (${lot.zone || "no zone"}), parcel ${lot.id}`,
    `${answer.headline}${ruleSet === "bill-2025-1545" ? " (if the housing bill passes)" : " (today's code)"}`,
    `${answer.typeLine}${answer.financeLine ? `; ${answer.financeLine}` : ""}`,
    answer.evidence,
    `City status: ${answer.status}`,
    "A screen from ByRight PGH, not a zoning decision. The Zoning Administrator decides.",
  ]
    .filter(Boolean)
    .join("\n");
}
