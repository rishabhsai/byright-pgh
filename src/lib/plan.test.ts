import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Comps, CompsFile, Lot, LotsFile, RuleSet } from "./types";
import { evaluateLot } from "./rules";
import { triageLot } from "./triage";
import { compsFor, DEFAULT_FINANCE } from "./finance";
import { evidenceForLot } from "./evidence";
import { buildPlan, CSV_COLUMNS, toBrief, toCsv } from "./plan";

const LOTS = "public/data/lots.json";
const COMPS = "public/data/comps.json";
const haveData = existsSync(LOTS) && existsSync(COMPS);

/** The Hazelwood plan, wired the way ByRightApp wires it (current code, default assumptions). */
function hazelwood(homes = 10) {
  const file = JSON.parse(readFileSync(LOTS, "utf8")) as LotsFile;
  const compsFile = JSON.parse(readFileSync(COMPS, "utf8")) as CompsFile;
  const lots = file.lots.filter((l) => l.neighborhood === "Hazelwood");
  const evals = Object.fromEntries(
    (["current", "bill-2025-1545"] as RuleSet[]).map((rs) => [rs, { findings: lots.map((l) => evaluateLot(l, rs)) }]),
  ) as Record<RuleSet, { findings: ReturnType<typeof evaluateLot>[] }>;
  const comps = lots.map((l) => compsFor(l, compsFile));
  const triages = lots.map((l, i) => triageLot(l, evals.current.findings[i], comps[i], DEFAULT_FINANCE));
  const evidence = lots.map((l, i) => evidenceForLot(l, evals.current.findings[i], triages[i], comps[i], DEFAULT_FINANCE, null));
  const plan = buildPlan(lots, evals, triages, evidence, comps, DEFAULT_FINANCE, { neighborhoods: ["Hazelwood"] }, "current", homes, {
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
    expect(f.atLeast1000).toBeGreaterThan(0);
    expect(plan.ready.total).toBe(f.atLeast1000);
    expect(plan.notEvaluated).toBe(f.records - f.encoded);
  });

  it("splits the ready lots by channel and by type without losing any", () => {
    const { plan } = hazelwood();
    const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
    expect(sum(plan.ready.byChannel)).toBe(plan.ready.total);
    expect(sum(plan.ready.byType)).toBe(plan.ready.total);
  });

  it("sizes the gap for the N lowest-shortfall ready lots, cheaper at $150/sf than at $215/sf", () => {
    const { plan } = hazelwood(10);
    const g = plan.gap!;
    expect(g.lots).toBe(10);
    expect(plan.shortlist).toHaveLength(10);
    expect(g.perHome).toBeCloseTo(g.total / 10, 6);
    expect(g.at150.total).toBeLessThan(g.total);
    expect(g.at215.total).toBeGreaterThan(g.total);
    const gaps = plan.shortlist.map((r) => Number(r.shortfall_to_target));
    expect(gaps).toEqual([...gaps].sort((a, b) => a - b));
    expect(g.zhvi[0]).toMatchObject({ neighborhood: "Hazelwood", value: 83_082 });
  });

  it("states the bill as one line about ADU options on ready lots", () => {
    const { plan } = hazelwood();
    expect(plan.billLine).toMatch(/^If Bill 2025-1545 passes: \+[\d,]+ ADU options on ready lots; /);
  });
});

describe.runIf(haveData)("plan exports", () => {
  it("writes the CSV with exactly the section 4 columns, one row per lot in scope", () => {
    const { plan, lots } = hazelwood();
    const csv = toCsv(plan.rows);
    const lines = csv.trimEnd().split("\n");
    expect(lines[0]).toBe(
      "parcel_id,address,neighborhood,ward,council_district,status,inventory_type,channel,zone,zone_name,lot_area_sf,frontage_ft_approx,assessed_land_value,best_type,best_verdict,by_right_types,relief_sections,review_kind,check_use,check_lot_size,check_width,check_fit,check_site,check_finance,checks_passed_of_6,unresolved_notes,flag_slope_25,flag_undermined,flag_flood,hazard_test_method,est_total_cost,est_value,value_basis,value_basis_date,shortfall_to_target,break_even_value,shortfall_at_150psf,shortfall_at_215psf,adjacent_city_lots_150ft,triage,next_action,rule_set,hard_cost_psf,soft_pct,fee_pct,target_margin_pct,generated_at",
    );
    expect(CSV_COLUMNS).toHaveLength(47);
    expect(lines).toHaveLength(lots.length + 1);
    const first = plan.rows[0];
    expect(first.adjacent_city_lots_150ft).toBe("");
    expect(first.hazard_test_method).toBe("inventory point");
    expect(["pass", "fail", "unknown", "not_checked"]).toContain(first.check_fit);
  });

  it("writes a one-page brief with the funnel, the gap, sources and the disclaimer", () => {
    const { plan } = hazelwood();
    const md = toBrief(plan);
    expect(md).toMatch(/^# Disposition plan: Hazelwood/);
    const f = plan.funnel;
    expect(md).toContain(`${f.records.toLocaleString("en-US")} lots → ${f.encoded.toLocaleString("en-US")} in encoded districts → ${f.byRight} by right`);
    expect(md).toContain("Zillow Home Value Index");
    expect(md).toContain("Not a zoning determination or legal advice");
    expect(md).toMatch(/\$150\/sf/);
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
  it("counts lots that fail only lot size as needing relief (small Hillside lots included) and the rest of Hillside as exceptions", () => {
    const plan = wire(
      [testLot("r2-small", "R2-M", 1860), testLot("h-small", "H", 2000), testLot("h-big", "H", 5000), testLot("r2-ok", "R2-M", 3000)],
      [null, null, null, null],
    );
    expect(plan.needsRelief).toBe(2);
    expect(plan.hillsideReview).toBe(1);
    expect(plan.ready.total).toBe(1);
    expect(plan.gap).toBeNull();
  });
});
