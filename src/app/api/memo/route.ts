import type { Finding, RuleSet } from "@/lib/types";
import { TRIAGE_LABEL, TYPOLOGY_LABEL, VERDICT_LABEL, verdictLabel } from "@/lib/types";
import { evaluateLot } from "@/lib/rules";
import { compsFor, DEFAULT_FINANCE, fmtUsd } from "@/lib/finance";
import { buildSelectedCase, type SelectedCase } from "@/lib/selectedCase";
import { answerHeadline } from "@/components/ui/answer";
import { buildMemo } from "@/components/memo";
import { districtName } from "@/components/district";
import { badRequest, complete, loadData, MEMO_SUMMARY_LABEL, parseLotRequest } from "../_lib/server";

export const maxDuration = 20;

/*
 * POST { lotId, ruleSet, typology? } -> { deterministic, memo, label, facts }.
 * `deterministic` is the rules-engine memo for the requested proposal (or the default proposal), always present.
 * `memo` is an optional plain-language summary from a model, labeled `label` (unverified), or null when no model
 * is configured or the call fails. The app does not call this route; the lot brief never includes `memo`.
 */

/**
 * What the model is told, rebuilt from the selected case. Money follows the one financial result: when finance is
 * not screened the facts carry no dollar figure at all (no pro forma, no assessed value), only the reason.
 */
function structuredFacts(c: SelectedCase, bill: Finding[] | null): string {
  const { lot, ruleSet, finding, triage, finance } = c;
  const screened = finance.screened && finance.proforma !== null;
  const lines: string[] = [];
  lines.push(`Parcel ${lot.id}, ${lot.address}, ${lot.neighborhood}, zoning district ${lot.zone} (from the City inventory).`);
  lines.push(
    `Lot area: ${lot.lotAreaSqFt ?? "not in record"} sq ft. Frontage: ${lot.frontageFt ?? "not in record"} ft (parsed from the legal description, approximate).` +
      (screened ? ` County assessed land value (not market value): ${lot.landValue == null ? "not in record" : fmtUsd(lot.landValue)}.` : ""),
  );
  lines.push(`City inventory status: ${lot.status || "not recorded"}; inventory type: ${lot.inventoryType || "not recorded"}. Listing is not proof of current ownership or availability.`);
  lines.push(
    `Hazard screening at the inventory point (not the parcel polygon): steep slope ${lot.hazards.steepSlope ? "flagged" : "not found"}, undermined ${lot.hazards.undermined ? "flagged" : "not found"}, flood zone ${lot.hazards.floodZone === null ? "not checked" : lot.hazards.floodZone ? "flagged" : "not found"}.`,
  );
  lines.push(`Rule set applied: ${ruleSet}. Checks cover use, lot area, lot width, and parking; setbacks, height, and overlays are not checked.`);
  const source = c.typologySource === "best" ? "default proposal" : "requested";
  lines.push(`\nProposal: ${TYPOLOGY_LABEL[c.typology]} (${source}). ${finding ? `${verdictLabel(finding)}. ${finding.summary}` : "Not evaluated."}`);
  for (const ch of finding?.checks ?? []) {
    const status = ch.passed === null ? "not verified" : ch.passed ? "pass" : "FAIL";
    lines.push(`  - ${ch.label}: ${status}; measured ${ch.measured ?? "n/a"}, required ${ch.required ?? "n/a"}; cite ${ch.citation.section} (${ch.citation.title})`);
  }
  const others = c.findings[ruleSet].filter((f) => f.typology !== c.typology);
  if (others.length) lines.push(`Other home types: ${others.map((f) => `${TYPOLOGY_LABEL[f.typology]} ${verdictLabel(f)}`).join("; ")}.`);
  if (bill) {
    const cur = c.findings[ruleSet];
    const changes = bill.map((b, i) => ({ b, cur: cur[i] })).filter(({ b, cur }) => cur && b.verdict !== cur.verdict);
    if (changes.length) {
      lines.push("\nIf Council adopts Bill 2025-1545 (pending, not law):");
      for (const { b, cur } of changes) lines.push(`  - ${TYPOLOGY_LABEL[b.typology]}: ${VERDICT_LABEL[cur.verdict]} -> ${VERDICT_LABEL[b.verdict]}`);
    }
  }
  lines.push(`\nScreening triage for this proposal: ${TRIAGE_LABEL[triage.triage]}. Reasons: ${triage.reasons.join(" ")}`);
  if (screened) {
    const pf = finance.proforma!;
    lines.push(
      `Financial result: screened. Pro forma (default assumptions, not underwriting) for ${TYPOLOGY_LABEL[pf.typology]}: total cost ${fmtUsd(pf.totalCost)}, revenue ${fmtUsd(pf.revenue)} (${pf.mode}), margin ${fmtUsd(pf.margin)}, ${pf.pencils ? "clears the cost-and-return screen" : `modeled shortfall to the target return ${fmtUsd(pf.gap)}`}.`,
    );
  } else {
    lines.push(`Financial result: not screened (${finance.reason ?? "no comps"}). Give no cost, value, margin or shortfall figure.`);
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
  const c = buildSelectedCase({
    lot,
    ruleSet: req.ruleSet,
    findings: { [req.ruleSet]: findings, [otherRs]: other } as Record<RuleSet, Finding[]>,
    comps: compsFor(lot, compsFile),
    assumptions: DEFAULT_FINANCE,
    landOverride: null,
    filterTypology: null,
    pickedTypology: req.typology,
  });
  const deterministic = buildMemo(c, { headline: answerHeadline(c.triage, c.finding, c.proforma, lot).text, districtName: districtName(lot.zone), changes: [] });
  const facts = structuredFacts(c, req.ruleSet === "current" ? other : null);
  const label = MEMO_SUMMARY_LABEL;

  const out = await complete(SYSTEM, `Findings:\n${facts}`, 500);
  if (out.text === null) return Response.json({ deterministic, memo: null, label, facts, error: out.error });
  return Response.json({ deterministic, memo: out.text, label, facts, model: out.model });
}
