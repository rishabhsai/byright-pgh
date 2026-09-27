import type { Comps, Finding, Lot, RuleSet, TriageResult } from "@/lib/types";
import { TRIAGE_LABEL, TYPOLOGY_LABEL, VERDICT_LABEL } from "@/lib/types";
import { evaluateLot } from "@/lib/rules";
import { compsFor, DEFAULT_FINANCE, fmtUsd, proformaWithFallback, triageLot } from "@/lib/finance";
import { buildSelectedCase } from "@/lib/selectedCase";
import { answerHeadline } from "@/components/ui/answer";
import { buildMemo } from "@/components/memo";
import { districtName } from "@/components/district";
import { badRequest, complete, loadData, parseLotRequest } from "../_lib/server";

export const maxDuration = 15;

/*
 * POST { lotId, ruleSet } -> { deterministic, memo, facts }.
 * `deterministic` is the rules-engine memo, always present. `memo` is an optional plain-language
 * summary from a model, unverified, or null when no model is configured or the call fails.
 */

function structuredFacts(
  lot: Lot,
  ruleSet: RuleSet,
  findings: Finding[],
  bill: Finding[] | null,
  triage: TriageResult,
  comps: Comps | null,
): string {
  const lines: string[] = [];
  lines.push(`Parcel ${lot.id}, ${lot.address}, ${lot.neighborhood}, zoning district ${lot.zone} (from the City inventory).`);
  lines.push(
    `Lot area: ${lot.lotAreaSqFt ?? "not in record"} sq ft. Frontage: ${lot.frontageFt ?? "not in record"} ft (parsed from the legal description, approximate). County assessed land value (not market value): ${lot.landValue ?? "not in record"}.`,
  );
  lines.push(`City inventory status: ${lot.status || "not recorded"}; inventory type: ${lot.inventoryType || "not recorded"}. Listing is not proof of current ownership or availability.`);
  lines.push(
    `Hazard screening at the inventory point (not the parcel polygon): steep slope ${lot.hazards.steepSlope ? "flagged" : "not found"}, undermined ${lot.hazards.undermined ? "flagged" : "not found"}, flood zone ${lot.hazards.floodZone === null ? "not checked" : lot.hazards.floodZone ? "flagged" : "not found"}.`,
  );
  lines.push(`Rule set applied: ${ruleSet}. Checks cover use, lot area, lot width, and parking; setbacks, height, and overlays are not checked.`);
  for (const f of findings) {
    lines.push(`\n${TYPOLOGY_LABEL[f.typology]}: ${VERDICT_LABEL[f.verdict]}. ${f.summary}`);
    for (const c of f.checks) {
      const status = c.passed === null ? "not verified" : c.passed ? "pass" : "FAIL";
      lines.push(
        `  - ${c.label}: ${status}; measured ${c.measured ?? "n/a"}, required ${c.required ?? "n/a"}; cite ${c.citation.section} (${c.citation.title})`,
      );
    }
  }
  if (bill) {
    const changes = bill.map((b, i) => ({ b, cur: findings[i] })).filter(({ b, cur }) => cur && b.verdict !== cur.verdict);
    if (changes.length) {
      lines.push("\nIf Council adopts Bill 2025-1545 (pending, not law):");
      for (const { b, cur } of changes) {
        lines.push(`  - ${TYPOLOGY_LABEL[b.typology]}: ${VERDICT_LABEL[cur.verdict]} -> ${VERDICT_LABEL[b.verdict]}`);
      }
    }
  }
  lines.push(`\nScreening triage: ${TRIAGE_LABEL[triage.triage]}. Reasons: ${triage.reasons.join(" ")}`);
  if (triage.bestTypology) {
    const pf = proformaWithFallback(lot, triage.bestTypology, comps);
    if (pf) {
      lines.push(
        `Screening pro forma (default assumptions, not underwriting) for ${TYPOLOGY_LABEL[pf.typology]}: total cost ${fmtUsd(pf.totalCost)}, revenue ${fmtUsd(pf.revenue)} (${pf.mode}), margin ${fmtUsd(pf.margin)}, ${pf.pencils ? "clears the screen" : `gap ${fmtUsd(pf.gap)}`}.`,
      );
    }
  }
  return lines.join("\n");
}

const SYSTEM = `You write a short plain-language summary of a zoning screening for the Pittsburgh Land Bank and City Planning staff.
You are given structured findings produced by a deterministic rules engine. Do not add, remove, or reinterpret any finding, number, or citation. Do not invent code sections. Do not state or imply that the City approved anything, that anyone may build, or that the parcel is owned or available. If a value is "not in record" or "not verified", say so plainly.
Format: Markdown, under 200 words: "Bottom line" (2 sentences), "What would need review" (cite sections inline), "Before acting" (confirm with the City's Zoning Administrator).
End with: "This summary is decision support generated from public records and is not a zoning determination or legal advice."`;

export async function POST(request: Request) {
  let req;
  try {
    req = await parseLotRequest(request, false);
  } catch (err) {
    const r = badRequest(err);
    if (r) return r;
    throw err;
  }
  const { lots, comps: compsFile } = await loadData();
  const lot = lots.get(req.lotId);
  if (!lot) return Response.json({ error: "unknown lotId" }, { status: 404 });

  const findings = evaluateLot(lot, req.ruleSet);
  const otherRs: RuleSet = req.ruleSet === "current" ? "bill-2025-1545" : "current";
  const other = evaluateLot(lot, otherRs);
  const comps = compsFor(lot, compsFile);
  const triage = triageLot(lot, findings, comps);
  const c = buildSelectedCase({
    lot,
    ruleSet: req.ruleSet,
    findings: { [req.ruleSet]: findings, [otherRs]: other } as Record<RuleSet, Finding[]>,
    comps,
    assumptions: DEFAULT_FINANCE,
    landOverride: null,
    filterTypology: null,
    pickedTypology: null,
  });
  const deterministic = buildMemo(c, { headline: answerHeadline(c.triage, c.finding, c.proforma, lot).text, districtName: districtName(lot.zone), changes: [] });
  const facts = structuredFacts(lot, req.ruleSet, findings, req.ruleSet === "current" ? other : null, triage, comps);

  const out = await complete(SYSTEM, `Findings:\n${facts}`, 500);
  if (out.text === null) return Response.json({ deterministic, memo: null, facts, error: out.error });
  return Response.json({ deterministic, memo: out.text, facts, model: out.model });
}
