import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CompsFile, Lot, LotsFile, RuleSet } from "./types";
import { evaluateLot } from "./rules";
import { triageLot } from "./triage";
import { compsFor, DEFAULT_FINANCE, proformaWithFallback } from "./finance";
import { evidenceForLot, firstOpenItem, pickFinding } from "./evidence";
import { buildPlan, toBrief, toCsv } from "./plan";
import { buildApplicationPlan, renderApplicationMarkdown } from "./application";

const LOTS = "public/data/lots.json";
const COMPS = "public/data/comps.json";
const haveData = existsSync(LOTS) && existsSync(COMPS);

/** One real record, assessed the way the app assesses it (current code, default assumptions, best type). */
function caseFor(id: string) {
  const lots = (JSON.parse(readFileSync(LOTS, "utf8")) as LotsFile).lots;
  const compsFile = JSON.parse(readFileSync(COMPS, "utf8")) as CompsFile;
  const lot = lots.find((l) => l.id === id)!;
  const comps = compsFor(lot, compsFile);
  const findings = evaluateLot(lot, "current");
  const triage = triageLot(lot, findings, comps, DEFAULT_FINANCE);
  const evidence = evidenceForLot(lot, findings, triage, comps, DEFAULT_FINANCE, null);
  const finding = pickFinding(findings, triage, null);
  return { lot, comps, findings, triage, evidence, finding };
}

function planFor(lot: Lot, comps: ReturnType<typeof compsFor>) {
  const evals = Object.fromEntries(
    (["current", "bill-2025-1545"] as RuleSet[]).map((rs) => [rs, { findings: [evaluateLot(lot, rs)] }]),
  ) as Record<RuleSet, { findings: ReturnType<typeof evaluateLot>[] }>;
  const triage = triageLot(lot, evals.current.findings[0], comps, DEFAULT_FINANCE);
  const evidence = evidenceForLot(lot, evals.current.findings[0], triage, comps, DEFAULT_FINANCE, null);
  return buildPlan([lot], evals, [triage], [evidence], [comps], DEFAULT_FINANCE, { neighborhoods: [] }, "current", 10, {
    generatedAt: "2026-09-26T20:00:00Z",
  });
}

describe.runIf(haveData)("district uncertainty is one shared decision", () => {
  const KIRKPATRICK = "0011F00200000000"; // 0 Old Kirkpatrick St: inventory R2-VH, map UPR-B, Public Sale
  const MURRAY_HILL = "0085K00296000000"; // 5724 Murray Hill Pl: inventory RM-M, map R1D-L, Hold for Study

  it("firstOpenItem names the district before the slope, status or finance", () => {
    const k = caseFor(KIRKPATRICK);
    expect(firstOpenItem(k.lot, k.finding, k.evidence)).toMatchObject({
      id: "district-conflict",
      label: "Resolve district: inventory R2-VH vs map UPR-B",
    });
    const m = caseFor(MURRAY_HILL);
    expect(firstOpenItem(m.lot, m.finding, m.evidence)).toMatchObject({
      id: "district-conflict",
      label: "Resolve district: inventory RM-M vs map R1D-L",
    });
  });

  it("triage leads with the district conflict", () => {
    for (const [id, re] of [[KIRKPATRICK, /R2-VH.*UPR-B/], [MURRAY_HILL, /RM-M.*R1D-L/]] as const) {
      const c = caseFor(id);
      expect(c.triage.triage).toBe("yellow");
      expect(c.triage.reasons[0]).toMatch(re);
    }
  });

  it("the plan row's next action resolves the district, never a finance or status action; the CSV carries it", () => {
    const k = caseFor(KIRKPATRICK);
    const plan = planFor(k.lot, k.comps);
    expect(plan.rows[0].next_action).toBe("Resolve district: inventory R2-VH vs map UPR-B");
    expect(toCsv(plan.rows)).toContain("Resolve district: inventory R2-VH vs map UPR-B");
    const m = caseFor(MURRAY_HILL);
    expect(planFor(m.lot, m.comps).rows[0].next_action).toBe("Resolve district: inventory RM-M vs map R1D-L");
  });

  it("a disputed candidate puts the district first in the brief's open items and never calls its use established", () => {
    // 0 Sloan St (Esplen): inventory R1D-H, map RIV-RM; recorded Available for Sale, 1,812 sf, no hazard flag.
    const s = caseFor("0042D00231000000");
    const plan = planFor(s.lot, s.comps);
    expect(plan.rows[0].candidate).toBe(true);
    expect(plan.rows[0].next_action).toBe("Resolve district: inventory R1D-H vs map RIV-RM");
    expect(plan.openItems[0]).toMatchObject({ label: "District", count: 1 });
    const md = toBrief(plan);
    expect(md).toMatch(/1 of them has an unresolved district/);
    expect(md).not.toMatch(/allowed by right under the checks we ran/);
  });

  it("the application routes a disputed district to confirmation first, not to a no-hearing review", () => {
    const k = caseFor(KIRKPATRICK);
    const pf = proformaWithFallback(k.lot, "townhome", k.comps, DEFAULT_FINANCE);
    const plan = buildApplicationPlan(k.lot, k.findings, "current", k.triage, pf, k.comps, "townhome");
    const zoning = plan.steps.find((s) => s.id === "zoning")!;
    expect(zoning.body[0]).toMatch(/^Resolve district: inventory R2-VH vs map UPR-B/);
    expect(zoning.body.join(" ")).not.toMatch(/no hearing expected/);
    const variance = plan.purchaseForm.find((f) => f.label.startsWith("Will you need to seek a variance"))!;
    expect(variance.value).toBe("Confirm district first (inventory vs map disagree)");
    expect(renderApplicationMarkdown(plan)).toContain("Resolve district: inventory R2-VH vs map UPR-B");

    // A prohibited type gets the ZBA worksheet: the district is the first thing to establish.
    const tri = buildApplicationPlan(k.lot, k.findings, "current", k.triage, null, k.comps, "triplex");
    expect(tri.zba!.findings[0].establish[0]).toMatch(/Which district governs this lot\? The inventory says R2-VH; the City zoning map says UPR-B/);
    expect(tri.purchaseForm.find((f) => f.label.startsWith("Will you need to seek a variance"))!.value).toBe(
      "Confirm district first (inventory vs map disagree)",
    );
  });
});
