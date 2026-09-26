import { evaluateLot } from "@/lib/rules";
import { compsFor, proformaWithFallback, triageLot } from "@/lib/finance";
import { buildApplicationPlan, SUGGESTION_LABEL } from "@/lib/application";
import { badRequest, complete, loadData, parseLotRequest } from "../_lib/server";

export const maxDuration = 15;

/*
 * POST { lotId, ruleSet, typology } -> { source, suggestion, label }.
 * The model may reword only the purchase form's "Detailed description of your proposed end use".
 * It never sees or rewrites the § 922.09.E worksheet. `source` is the deterministic description
 * the suggestion was made from, so the client can drop a suggestion that no longer matches.
 */

const SYSTEM = `You reword one paragraph for a City of Pittsburgh property purchase form: the applicant's description of the proposed end use.
Rewrite it as clear first-person-plural ("we") prose. Do not add facts, numbers, dates, dollar amounts, code sections, approvals, ownership, or claims. Keep every number exactly as given. Keep caveats such as "needs survey" or "at our screening assumptions".
Return only the paragraph, under 90 words.`;

export async function POST(request: Request) {
  let req;
  try {
    req = await parseLotRequest(request, true);
  } catch (err) {
    const r = badRequest(err);
    if (r) return r;
    throw err;
  }
  const typology = req.typology!;
  const { lots, comps: compsFile } = await loadData();
  const lot = lots.get(req.lotId);
  if (!lot) return Response.json({ error: "unknown lotId" }, { status: 404 });

  const findings = evaluateLot(lot, req.ruleSet);
  const comps = compsFor(lot, compsFile);
  const triage = triageLot(lot, findings, comps);
  const pf = proformaWithFallback(lot, typology, comps);
  const plan = buildApplicationPlan(lot, findings, req.ruleSet, triage, pf, comps, typology);
  const source = plan.description;

  const out = await complete(SYSTEM, source, 250);
  if (out.text === null) return Response.json({ source, suggestion: null, label: SUGGESTION_LABEL, error: out.error });
  // A cheap reject filter, not a guarantee: drop text with numbers the source does not contain.
  if (!numbersSubset(source, out.text)) return Response.json({ source, suggestion: null, label: SUGGESTION_LABEL, error: "numbers-changed" });
  return Response.json({ source, suggestion: out.text, label: SUGGESTION_LABEL, model: out.model });
}

function numbersSubset(source: string, text: string): boolean {
  const nums = (t: string) => new Set((t.match(/\d[\d,.]*/g) ?? []).map((n) => n.replace(/[.,]$/, "")));
  const allowed = nums(source);
  return [...nums(text)].every((n) => allowed.has(n));
}
