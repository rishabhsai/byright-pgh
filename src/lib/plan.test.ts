import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Comps, CompsFile, Lot, LotsFile, RuleSet } from "./types";
import { evaluateLot } from "./rules";
import { triageLot } from "./triage";
import { compsFor, DEFAULT_FINANCE } from "./finance";
import { evidenceForLot } from "./evidence";
import { buildPlan, CSV_COLUMNS, gapSentence, toBrief, toCsv } from "./plan";
import type { FinanceAssumptions } from "./proforma";

const LOTS = "public/data/lots.json";
const COMPS = "public/data/comps.json";
const haveData = existsSync(LOTS) && existsSync(COMPS);

/** The Hazelwood plan, wired the way ByRightApp wires it (current code, default assumptions). */
function hazelwood(homes = 10, assumptions: FinanceAssumptions = DEFAULT_FINANCE) {
  const file = JSON.parse(readFileSync(LOTS, "utf8")) as LotsFile;
  const compsFile = JSON.parse(readFileSync(COMPS, "utf8")) as CompsFile;
  const lots = file.lots.filter((l) => l.neighborhood === "Hazelwood");
  const evals = Object.fromEntries(
    (["current", "bill-2025-1545"] as RuleSet[]).map((rs) => [rs, { findings: lots.map((l) => evaluateLot(l, rs)) }]),
  ) as Record<RuleSet, { findings: ReturnType<typeof evaluateLot>[] }>;
  const comps = lots.map((l) => compsFor(l, compsFile));
  const triages = lots.map((l, i) => triageLot(l, evals.current.findings[i], comps[i], assumptions));
  const evidence = lots.map((l, i) => evidenceForLot(l, evals.current.findings[i], triages[i], comps[i], assumptions, null));
  const plan = buildPlan(lots, evals, triages, evidence, comps, assumptions, { neighborhoods: ["Hazelwood"] }, "current", homes, {
    sources: [...file.sources, ...compsFile.sources],
    generatedAt: "2026-09-26T20:00:00Z",
  });
  return { plan, lots };
}

describe.runIf(haveData)("buildPlan: Hazelwood", () => {
  it("narrows the funnel at every stage", () => {
    const { plan, lots } = hazelwood();
    const f = plan.funnel;
    expect(f.records).toBe(lots.length);
    const stages = [f.records, f.encoded, f.byRight, f.availableNoFlag, f.atLeast1000, f.pencil];
    for (let i = 1; i < stages.length; i++) expect(stages[i]).toBeLessThanOrEqual(stages[i - 1]);
    expect(stages).toEqual([797, 754, 285, 123, 106, 0]);
    expect(plan.candidates.total).toBe(f.atLeast1000);
    expect(plan.notEvaluated).toBe(f.records - f.encoded);
  });

  it("splits the candidates by channel and by type without losing any", () => {
    const { plan } = hazelwood();
    const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
    expect(sum(plan.candidates.byChannel)).toBe(plan.candidates.total);
    expect(sum(plan.candidates.byType)).toBe(plan.candidates.total);
    expect(plan.candidates.byChannel).toMatchObject({ "Public Sale": 8, "URA Transfer": 98 });
  });

  it("sizes the modeled shortfall for N single-home projects from unrounded values, cheaper at $150/sf than at $215/sf", () => {
    const { plan } = hazelwood(10);
    const g = plan.gap!;
    expect(g.projects).toBe(10);
    expect(g.dwellings).toBe(10);
    expect(plan.shortlist).toHaveLength(10);
    expect(g.perProject).toBeCloseTo(g.total / 10, 6);
    expect(g.perDwelling).toBeCloseTo(g.total / 10, 6);
    // Audit 2: the rounded rows sum to $2,587,870; the unrounded total differs by about $1.43.
    expect(Math.abs(g.total - 2_587_870)).toBeGreaterThan(1);
    expect(Math.abs(g.total - 2_587_870)).toBeLessThan(2);
    expect(g.at150.total).toBeLessThan(g.total);
    expect(g.at215.total).toBeGreaterThan(g.total);
    const gaps = plan.shortlist.map((r) => Number(r.shortfall_to_target));
    expect(gaps).toEqual([...gaps].sort((a, b) => a - b));
    expect(g.valueBasis[0]).toMatchObject({ label: "Hazelwood ZHVI", value: 83_082 });
    expect(gapSentence(plan)).toMatch(/Target sale value/);
    expect(gapSentence(plan)).not.toMatch(/per home|break-even/i);
  });

  it("rental mode says capitalized value and cites ZORI, not sale value and ZHVI", () => {
    const { plan } = hazelwood(10, { ...DEFAULT_FINANCE, mode: "rent" });
    const s = gapSentence(plan);
    expect(s).toMatch(/Target capitalized value/);
    expect(s).toMatch(/ZORI/);
    expect(s).not.toMatch(/sale value|ZHVI/);
  });

  it("never tells staff to offer a lot: next actions name the next review item and the recorded channel", () => {
    const { plan } = hazelwood();
    for (const r of plan.rows) expect(r.next_action).not.toMatch(/^Offer|Consolidate with adjacent|Enter a comp/);
    for (const r of plan.rows.filter((x) => x.candidate)) expect(r.next_action).toMatch(/^Staff review: .+; channel (Public Sale|URA Transfer|PLB Transfer|Other)$/);
    const ladora = plan.rows.find((r) => r.parcel_id === "0056N00203000000")!;
    expect(ladora.next_action).toBe("Staff review: financing review (modeled shortfall $258,787); channel URA Transfer");
  });

  it("exports every unresolved requirement, including parking, with literal pass counts", () => {
    const { plan } = hazelwood();
    const ladora = plan.rows.find((r) => r.parcel_id === "0056N00203000000")!;
    expect(ladora.checks_passed_of_6).toBe(4);
    expect(ladora.checks_unknown).toBe(0);
    expect(ladora.checks_not_checked).toBe(1);
    expect(String(ladora.unresolved_notes)).toMatch(/Fit: Setbacks, height, lot coverage not modeled/);
    expect(String(ladora.unresolved_notes)).toMatch(/Parking: 1 space required · § 914\.02\.A/);
    expect(String(ladora.rule_citations)).toMatch(/§ 911\.02/);
    expect(String(ladora.rule_citations)).toMatch(/§ 914\.02\.A/);
    expect(String(ladora.cost_basis)).toMatch(/Hard cost per sf \$185/);
    expect(ladora.effective_land_cost).toBe(300);
    expect(ladora.revenue_mode).toBe("sale");
    expect(ladora.staff_review_candidate).toBe("true");
  });

  it("states the bill as one line about ADU options on candidates", () => {
    const { plan } = hazelwood();
    expect(plan.billLine).toMatch(/^If Bill 2025-1545 passes: \+[\d,]+ ADU options on candidates; /);
  });
});

describe.runIf(haveData)("plan exports", () => {
  it("writes the CSV with the 47 section 4 columns first, then the appended evidence, assumption and citation columns", () => {
    const { plan, lots } = hazelwood();
    const csv = toCsv(plan.rows);
    const lines = csv.trimEnd().split("\n");
    expect(lines[0]).toBe(
      "parcel_id,address,neighborhood,ward,council_district,status,inventory_type,channel,zone,zone_name,lot_area_sf,frontage_ft_approx,assessed_land_value,best_type,best_verdict,by_right_types,relief_sections,review_kind,check_use,check_lot_size,check_width,check_fit,check_site,check_finance,checks_passed_of_6,unresolved_notes,flag_slope_25,flag_undermined,flag_flood,hazard_test_method,est_total_cost,est_value,value_basis,value_basis_date,shortfall_to_target,break_even_value,shortfall_at_150psf,shortfall_at_215psf,adjacent_city_lots_150ft,triage,next_action,rule_set,hard_cost_psf,soft_pct,fee_pct,target_margin_pct,generated_at" +
        ",staff_review_candidate,checks_unknown,checks_not_checked,units,revenue_mode,effective_land_cost,land_source,typical_home_sf,cap_rate_pct,opex_pct,default_land_cost,rule_citations,cost_basis",
    );
    expect(CSV_COLUMNS).toHaveLength(60);
    expect(lines).toHaveLength(lots.length + 1);
    const first = plan.rows[0];
    expect(first.adjacent_city_lots_150ft).toBe("");
    expect(first.hazard_test_method).toBe("inventory point");
    expect(["pass", "fail", "unknown", "not_checked"]).toContain(first.check_fit);
  });

  it("writes a one-page brief with the funnel, the gap, sources and the disclaimer", () => {
    const { plan } = hazelwood();
    const md = toBrief(plan);
    expect(md).toMatch(/^# Disposition review: Hazelwood/);
    const f = plan.funnel;
    expect(md).toContain(`${f.records.toLocaleString("en-US")} lots → ${f.encoded.toLocaleString("en-US")} in encoded districts → ${f.byRight} by right`);
    expect(md).toContain("Zillow Home Value Index");
    expect(md).toContain("Not a zoning determination or legal advice");
    expect(md).toMatch(/\$150\/sf/);
  });

  it("the brief calls the list candidates for staff review and never promises readiness", () => {
    const { plan } = hazelwood();
    const md = toBrief(plan);
    expect(md).toContain("## Candidates for staff review");
    expect(md).toContain("## Modeled shortfall for 10 projects");
    expect(md).not.toMatch(/ready|can be offered|Offer through/i);
    expect(md).toMatch(/Parking/);
    expect(md).toMatch(/\| 4 pass · 1 fail · 1 not checked \|/);
  });
});

function wire(lots: Lot[], comps: (Comps | null)[]) {
  const evals = Object.fromEntries(
    (["current", "bill-2025-1545"] as RuleSet[]).map((rs) => [rs, { findings: lots.map((l) => evaluateLot(l, rs)) }]),
  ) as Record<RuleSet, { findings: ReturnType<typeof evaluateLot>[] }>;
  const triages = lots.map((l, i) => triageLot(l, evals.current.findings[i], comps[i], DEFAULT_FINANCE));
  const evidence = lots.map((l, i) => evidenceForLot(l, evals.current.findings[i], triages[i], comps[i], DEFAULT_FINANCE, null));
  return buildPlan(lots, evals, triages, evidence, comps, DEFAULT_FINANCE, { neighborhoods: [] }, "current", 10);
}

const testLot = (id: string, zone: string, area: number): Lot => ({
  id,
  address: id,
  neighborhood: "Test",
  councilDistrict: "1",
  ward: "1",
  lat: 40.44,
  lon: -79.99,
  zone,
  lotAreaSqFt: area,
  frontageFt: 25,
  landValue: 1000,
  status: "Available for Sale",
  inventoryType: "Public Sale",
  hazards: { steepSlope: false, undermined: false, floodZone: false },
});

describe("buildPlan: relief and Hillside counts", () => {
  it("counts lots that fail only lot size, and says how many of them still need a use approval after relief", () => {
    const plan = wire(
      [testLot("r2-small", "R2-M", 1860), testLot("h-small", "H", 2000), testLot("h-big", "H", 5000), testLot("r2-ok", "R2-M", 3000)],
      [null, null, null, null],
    );
    expect(plan.needsRelief).toBe(2);
    expect(plan.needsReliefWithApproval).toBe(1);
    expect(plan.hillsideReview).toBe(1);
    expect(plan.candidates.total).toBe(1);
    expect(plan.gap).toBeNull();
    const md = toBrief(plan);
    expect(md).toMatch(/1 of them also need a use approval \(Hillside\) that relief does not remove/);
  });

  it("an Other-channel record (Greenway) is a candidate only for review of its channel", () => {
    const green = { ...testLot("0116J00315000000", "R1D-M", 6000), inventoryType: "Greenway" };
    const plan = wire([green], [null]);
    expect(plan.rows[0].candidate).toBe(true);
    expect(plan.rows[0].next_action).toBe("Staff review: confirm disposition channel (inventory type Greenway); channel Other");
  });
});

describe("buildPlan: projects and dwellings", () => {
  const comps: Comps = { neighborhood: "Test", zip: "15217", zhvi: 60_000, zhviDate: "2026-08-31", zori: 900, zoriDate: "2026-08-31" };
  it("a duplex is one project and two dwellings; per-project and per-dwelling figures differ", () => {
    const lots = [testLot("a", "R2-M", 3000), testLot("b", "R2-M", 3100), testLot("c", "R2-M", 3200)];
    const evals = Object.fromEntries(
      (["current", "bill-2025-1545"] as RuleSet[]).map((rs) => [rs, { findings: lots.map((l) => evaluateLot(l, rs)) }]),
    ) as Record<RuleSet, { findings: ReturnType<typeof evaluateLot>[] }>;
    const cs = lots.map(() => comps);
    const triages = lots.map((l, i) => triageLot(l, evals.current.findings[i], cs[i], DEFAULT_FINANCE, "duplex"));
    const evidence = lots.map((l, i) => evidenceForLot(l, evals.current.findings[i], triages[i], cs[i], DEFAULT_FINANCE, "duplex"));
    const plan = buildPlan(lots, evals, triages, evidence, cs, DEFAULT_FINANCE, { neighborhoods: [], typology: "duplex" }, "current", 10);
    const g = plan.gap!;
    expect(g.projects).toBe(3);
    expect(g.dwellings).toBe(6);
    expect(g.perDwelling).toBeCloseTo(g.total / 6, 6);
    expect(g.perProject).toBeCloseTo(g.total / 3, 6);
    expect(gapSentence(plan)).toMatch(/3 projects \(6 dwellings\)/);
  });
});
