import type { Finding, Lot, RuleSet } from "@/lib/types";
import { TYPOLOGY_LABEL, VERDICT_LABEL } from "@/lib/types";
import { RULESET_LABEL } from "@/lib/engine";

export function buildMemo(
  lot: Lot,
  ruleSet: RuleSet,
  findings: Finding[],
  other: { ruleSet: RuleSet; findings: Finding[] } | null,
  districtName: string | null,
): string {
  const lines: string[] = [];
  const today = new Date().toISOString().slice(0, 10);
  lines.push(`# Zoning screening memo: ${lot.address || lot.id}`);
  lines.push("");
  lines.push(`Prepared ${today} with ByRight PGH. Decision support, not zoning advice. The City's Zoning Administrator interprets the code.`);
  lines.push("");
  lines.push("## Parcel");
  lines.push(`- Parcel ID: ${lot.id}`);
  lines.push(`- Neighborhood: ${lot.neighborhood}${lot.councilDistrict ? ` (Council District ${lot.councilDistrict})` : ""}`);
  lines.push(`- Zone: ${lot.zone || "none"}${districtName ? ` (${districtName})` : ""}`);
  lines.push(`- Lot area: ${lot.lotAreaSqFt != null ? `${lot.lotAreaSqFt.toLocaleString()} sf` : "not in record"}`);
  lines.push(`- Frontage: ${lot.frontageFt != null ? `${lot.frontageFt} ft` : "not in record"}`);
  lines.push(`- Assessed land value: ${lot.landValue != null ? `$${lot.landValue.toLocaleString()}` : "not in record"} (county assessed, not market)`);
  lines.push(`- Inventory status: ${lot.status}`);
  const hz = [
    lot.hazards.steepSlope && "steep slope (25%+)",
    lot.hazards.undermined && "undermined area",
    lot.hazards.floodZone && "FEMA flood zone",
  ].filter(Boolean);
  lines.push(`- Hazard screening: ${hz.length ? hz.join(", ") : "none flagged"}${lot.hazards.floodZone == null ? "; flood zone not checked" : ""}`);
  lines.push("");
  lines.push(`## Findings under ${RULESET_LABEL[ruleSet]}`);
  for (const f of findings) {
    lines.push("");
    lines.push(`### ${TYPOLOGY_LABEL[f.typology]}: ${VERDICT_LABEL[f.verdict]}`);
    if (f.summary) lines.push(f.summary);
    for (const c of f.checks) {
      const status = c.passed === true ? "pass" : c.passed === false ? "fail" : "needs survey";
      const mr = [c.measured && `measured ${c.measured}`, c.required && `required ${c.required}`].filter(Boolean).join(", ");
      lines.push(`- ${c.label}: ${status}${mr ? ` (${mr})` : ""}. [${c.citation.section} ${c.citation.title}](${c.citation.url})${c.note ? ` ${c.note}` : ""}`);
    }
  }
  if (other) {
    const changes = findings
      .map((f, i) => ({ f, o: other.findings[i] }))
      .filter(({ f, o }) => o && o.verdict !== f.verdict);
    lines.push("");
    lines.push(`## Compared with ${RULESET_LABEL[other.ruleSet]}`);
    if (!changes.length) lines.push("No verdict changes on this lot.");
    for (const { f, o } of changes) {
      lines.push(`- ${TYPOLOGY_LABEL[f.typology]}: ${VERDICT_LABEL[f.verdict]} now, ${VERDICT_LABEL[o.verdict]} under ${RULESET_LABEL[other.ruleSet]}`);
    }
  }
  lines.push("");
  lines.push("## Human review before acting");
  for (const item of REVIEW_CHECKLIST) lines.push(`- [ ] ${item}`);
  lines.push("");
  return lines.join("\n");
}

export const REVIEW_CHECKLIST = [
  "Confirm the zoning determination with the City's Zoning Administrator.",
  "Order a survey to confirm lot width, depth, and area.",
  "Check overlay districts and any open zoning cases on the parcel.",
  "Verify utility connections and legal street access.",
];
