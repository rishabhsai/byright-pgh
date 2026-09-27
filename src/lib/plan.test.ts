import { existsSync, readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Comps, CompsFile, Lot, LotsFile, RuleSet } from "./types";
import { evaluateLot } from "./rules";
import { triageLot } from "./triage";
import { compsFor, DEFAULT_FINANCE } from "./finance";
import { evidenceForLot } from "./evidence";
import { buildPlan, CSV_COLUMNS, gapSentence, hardCostRows, reliefSentence, toBrief, toCsv } from "./plan";
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

  it("sizes the modeled shortfall for N single-home projects from unrounded values, cheaper at $185/sf than at $250/sf", () => {
    const { plan } = hazelwood(10);
    const g = plan.gap!;
    expect(g.projects).toBe(10);
    expect(g.dwellings).toBe(10);
    expect(plan.shortlist).toHaveLength(10);
    expect(g.perProject).toBeCloseTo(g.total / 10, 6);
    expect(g.perDwelling).toBeCloseTo(g.total / 10, 6);
    expect(gapSentence(plan)).toMatch(/^The 10 lowest-shortfall candidates are 10 projects\. Modeled shortfall about \$3\.69M at \$225\/sf \(\$369k per project\)\./);
    // The rounded shortlist rows sum to $3,691,500; the unrounded total is about $1.43 less.
    const rounded = plan.shortlist.reduce((sum, r) => sum + Number(r.shortfall_to_target), 0);
    expect(rounded).toBe(3_691_500);
    expect(rounded - g.total).toBeGreaterThan(1);
    expect(rounded - g.total).toBeLessThan(2);
    const at = (psf: number) => g.atRates.find((r) => r.psf === psf)!.total;
    expect(at(185)).toBeLessThan(g.total);
    expect(at(225)).toBeCloseTo(g.total, 6);
    expect(at(250)).toBeGreaterThan(g.total);
    expect(at(350)).toBeGreaterThan(at(250));
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
    // 5118 Ladora Wy is 19.5 ft wide, so it is screened as the attached prototype (1,400 sf), not a detached house.
    const ladora = plan.rows.find((r) => r.parcel_id === "0056N00203000000")!;
    expect(ladora.best_type).toBe("townhome");
    expect(ladora.next_action).toBe("Staff review: financing review (modeled shortfall $423,523); channel URA Transfer");
  });

  it("exports every unresolved requirement, including parking, with literal pass counts", () => {
    const { plan } = hazelwood();
    // 4623 Chatsworth St: a detached house on a wider lot, one required space.
    const house = plan.rows.find((r) => r.parcel_id === "0055P00008000000")!;
    expect(house.best_type).toBe("single");
    expect(house.checks_passed_of_6).toBe(4);
    expect(house.checks_unknown).toBe(0);
    expect(house.checks_not_checked).toBe(1);
    expect(String(house.unresolved_notes)).toMatch(/Fit: Setbacks, height, lot coverage not modeled/);
    expect(String(house.unresolved_notes)).toMatch(/Parking: 1 space required · § 914\.02\.A/);
    expect(String(house.rule_citations)).toMatch(/§ 911\.02/);
    expect(String(house.rule_citations)).toMatch(/§ 914\.02\.A/);
    expect(String(house.cost_basis)).toMatch(/Hard cost per sf \$225/);
    expect(String(house.cost_basis)).toMatch(/Site work \(taps, grading, sidewalks\) \$35,000 per project/);
    expect(house.revenue_mode).toBe("sale");
    expect(house.staff_review_candidate).toBe("true");
    // 5118 Ladora Wy: the attached prototype needs no parking, so none is left unresolved.
    const ladora = plan.rows.find((r) => r.parcel_id === "0056N00203000000")!;
    expect(ladora.effective_land_cost).toBe(300);
    expect(String(ladora.unresolved_notes)).not.toMatch(/Parking/);
  });

  it("states the bill for the candidate set: ADU by right on N of M, and the parking change", () => {
    const { plan } = hazelwood();
    // Hazelwood: 106 candidates, 41 screened as a detached house (1 space today), 65 as the attached form (0 today).
    expect(plan.billLine).toBe("If Bill 2025-1545 passes: an ADU by right on 106 of 106 candidates; required parking 1 → 0 on 41 (the other 65 need none today).");
    expect(plan.candidates.byType).toEqual({ single: 41, townhome: 65 });
    expect(plan.billLine).not.toMatch(/\+0 ADU|ready count/);
  });

  it("adds a new-construction premium row: value at 1.3x the index, a smaller shortfall than at today's index", () => {
    const { plan } = hazelwood(10);
    const g = plan.gap!;
    expect(g.atPremium.total).toBeLessThan(g.total);
    // At 1.3x a $83,082 index the 1,200 sf house is valued at $92,577 against a ~$440k target: the gap narrows, it does not close.
    expect(Math.round(g.atPremium.total)).toBe(3_477_859);
    // The premium narrows every Hazelwood gap but closes none.
    expect(plan.candidates.clearAtPremium).toBe(0);
    expect(toBrief(plan)).toMatch(/\| 1\.3× index, \$225\/sf \| \$[\d,]+ \|/);
  });
});

describe.runIf(haveData)("buildPlan: citywide eligibility", () => {
  it("drops the two recorded-available Greenways from the candidate cohort and the shortfall pool", () => {
    const file = JSON.parse(readFileSync(LOTS, "utf8")) as LotsFile;
    const compsFile = JSON.parse(readFileSync(COMPS, "utf8")) as CompsFile;
    const lots = file.lots;
    const comps = lots.map((l) => compsFor(l, compsFile));
    const plan = wire(lots, comps);
    for (const id of ["0116J00315000000", "0047N00323000000"]) expect(plan.rows.find((r) => r.parcel_id === id)!.candidate).toBe(false);
    expect(plan.candidates.total).toBe(1_038);
    expect(plan.candidates.byChannel).toEqual({ "Public Sale": 772, "URA Transfer": 257, "PLB Transfer": 9, Other: 0 });
  }, 60_000);

  it("counts the candidates that clear the screen only at the 1.3x premium, from screened rows", () => {
    const file = JSON.parse(readFileSync(LOTS, "utf8")) as LotsFile;
    const compsFile = JSON.parse(readFileSync(COMPS, "utf8")) as CompsFile;
    const plan = wire(file.lots, file.lots.map((l) => compsFor(l, compsFile)));
    expect(plan.funnel.pencil).toBe(0);
    expect(plan.candidates.clearAtPremium).toBe(plan.rows.filter((r) => r.candidate && r.finance?.gapPremium === 0).length);
    expect(plan.candidates.clearAtPremium).toBe(7);
  }, 60_000);
});

const MONEY_COLUMNS = [
  "est_total_cost", "est_value", "value_basis", "value_basis_date", "shortfall_to_target", "break_even_value",
  "shortfall_at_185psf", "shortfall_at_225psf", "shortfall_at_250psf", "shortfall_at_350psf", "shortfall_at_1_3x_value", "effective_land_cost", "revenue_mode", "land_source", "cost_basis",
] as const;

describe.runIf(haveData)("plan exports: one financial result", () => {
  it("citywide, no row publishes money its Finance check did not screen, and every blank says why", () => {
    const file = JSON.parse(readFileSync(LOTS, "utf8")) as LotsFile;
    const compsFile = JSON.parse(readFileSync(COMPS, "utf8")) as CompsFile;
    const plan = wire(file.lots, file.lots.map((l) => compsFor(l, compsFile)));
    for (const r of plan.rows) {
      if (r.finance_screened === "true") {
        expect(["pass", "fail"]).toContain(r.check_finance);
        expect(r.finance_reason).toBe("");
        expect(r.est_total_cost).not.toBe("");
      } else {
        expect(r.finance_screened, String(r.parcel_id)).toBe("false");
        expect(r.finance_reason, String(r.parcel_id)).not.toBe("");
        expect(r.finance).toBeNull();
        for (const k of MONEY_COLUMNS) expect(r[k], `${r.parcel_id} ${k}`).toBe("");
      }
    }
    const forbes = plan.rows.find((r) => r.parcel_id === "0086L00500000000")!;
    expect(forbes).toMatchObject({ finance_screened: "false", finance_reason: "building does not fit (FAR)", est_value: "", shortfall_to_target: "" });
    const murray = plan.rows.find((r) => r.parcel_id === "0085K00296000000")!;
    expect(murray).toMatchObject({ finance_reason: "district unconfirmed", est_value: "" });
  }, 120_000);

  it("Esplen: candidates with an unresolved district stay in the queue but out of the shortfall total", () => {
    const file = JSON.parse(readFileSync(LOTS, "utf8")) as LotsFile;
    const compsFile = JSON.parse(readFileSync(COMPS, "utf8")) as CompsFile;
    const lots = file.lots.filter((l) => l.neighborhood === "Esplen");
    const plan = wire(lots, lots.map((l) => compsFor(l, compsFile)));
    expect(plan.candidates.total).toBe(11);
    expect(plan.candidates.districtUnconfirmed).toBe(9);
    expect(plan.shortlist).toHaveLength(10);
    expect(plan.gap!.projects).toBe(2);
    expect(plan.gap!.notScreened).toBe(8);
    expect(gapSentence(plan)).toMatch(/8 more shortlisted candidates have no screened financial result/);
  });
});

describe.runIf(haveData)("plan exports", () => {
  it("writes the CSV with the section 4 columns first (one shortfall column per hard-cost scenario), then the appended evidence, assumption and citation columns", () => {
    const { plan, lots } = hazelwood();
    const csv = toCsv(plan.rows);
    const lines = csv.trimEnd().split("\n");
    expect(lines[0]).toBe(
      "parcel_id,address,neighborhood,ward,council_district,status,inventory_type,channel,zone,zone_name,lot_area_sf,frontage_ft_approx,assessed_land_value,best_type,best_verdict,by_right_types,relief_sections,review_kind,check_use,check_lot_size,check_width,check_fit,check_site,check_finance,checks_passed_of_6,unresolved_notes,flag_slope_25,flag_undermined,flag_flood,hazard_test_method,est_total_cost,est_value,value_basis,value_basis_date,shortfall_to_target,break_even_value,shortfall_at_185psf,shortfall_at_225psf,shortfall_at_250psf,shortfall_at_350psf,adjacent_city_lots_150ft,triage,next_action,rule_set,hard_cost_psf,soft_pct,fee_pct,target_margin_pct,generated_at" +
        ",staff_review_candidate,checks_unknown,checks_not_checked,units,revenue_mode,effective_land_cost,land_source,typical_home_sf,cap_rate_pct,opex_pct,default_land_cost,rule_citations,cost_basis" +
        ",zone_map,zone_agrees,shortfall_at_1_3x_value" +
        ",finance_screened,finance_reason,site_cost_per_project",
    );
    expect(CSV_COLUMNS).toHaveLength(68);
    expect(lines).toHaveLength(lots.length + 1);
    const first = plan.rows[0];
    expect(first.adjacent_city_lots_150ft).toBe("");
    expect(first.hazard_test_method).toBe("inventory point");
    // Every screened row carries the default-rate scenario, and it equals the displayed shortfall at the default.
    const screened = plan.rows.filter((r) => r.finance_screened === "true");
    expect(screened.length).toBeGreaterThan(0);
    for (const r of screened) {
      expect(r.shortfall_at_225psf).toBe(r.shortfall_to_target);
      expect(Number(r.shortfall_at_185psf)).toBeLessThanOrEqual(Number(r.shortfall_at_225psf));
      expect(Number(r.shortfall_at_350psf)).toBeGreaterThanOrEqual(Number(r.shortfall_at_250psf));
      expect(r.site_cost_per_project).toBe(35_000);
    }
    expect(["pass", "fail", "unknown", "not_checked"]).toContain(first.check_fit);
  });

  it("writes a short brief: scope, funnel, channels, the financial hurdle, grouped open items, sources and the disclaimer", () => {
    const { plan } = hazelwood();
    const md = toBrief(plan);
    expect(md).toMatch(/^# Disposition review: Hazelwood/);
    expect(md).toMatch(/Home type: any \(lowest-shortfall allowed type per lot\)/);
    // The assumptions line carries the site allowance: it is in every project's cost and target.
    expect(md).toContain("$225/sf, $35,000 site allowance per project, ");
    expect(md).toContain("797 lots → 754 encoded → 285 use table → 123 for sale, no flag → 106 ≥ 1,000 sf → 0 clear cost screen");
    expect(md).toContain("Public Sale 8 · URA Transfer 98 · PLB Transfer 0");
    // The hurdle: the value each project needs against the index it is compared with.
    expect(md).toMatch(/needs about \$440k of value \(cost plus the 10% target return\) against Hazelwood ZHVI \$83k/);
    // One row per mentor scenario, in rate order, then the premium row at the assumed rate.
    const rows = md.split("\n").filter((l) => /^\| (\$|1\.3)/.test(l)).map((l) => l.split(" | ")[0].slice(2));
    expect(rows).toEqual([
      "$185/sf (prior hard-cost rate, with today's site allowance)",
      "$225/sf (assumed; default, Steigerwalt mid)",
      "$250/sf (Steigerwalt high)",
      "$350/sf (Tom Hardy mid, vertical construction)",
      "1.3× index, $225/sf",
    ]);
    expect(md).toContain("| $185/sf (prior hard-cost rate, with today's site allowance) | $2,978,699 | $297,870 |");
    expect(md).toContain("| $225/sf (assumed; default, Steigerwalt mid) | $3,691,499 | $369,150 |");
    expect(md).toContain("| $250/sf (Steigerwalt high) | $4,136,999 | $413,700 |");
    expect(md).toContain("| $350/sf (Tom Hardy mid, vertical construction) | $5,918,999 | $591,900 |");
    expect(md).toContain("| 1.3× index, $225/sf | $3,477,859 | $347,786 |");
    expect(md).toContain("Mentors' guidance: developers check whether a project pencils before pursuing a variance (T. Hardy, Sept 26, 2026).");
    expect(md).toContain("- Fit not checked (setbacks, height, coverage): 106");
    expect(md).toContain("- Site access, water/sewer, soils not checked: 106");
    expect(md).toContain("- Parking to verify on the site plan: 41");
    expect(md).toMatch(/Per-lot detail .* CSV/);
    expect(md).toContain("Zillow Home Value Index");
    expect(md).toContain("Not a zoning determination or legal advice");
  });

  it("the brief is about 350–450 words with the shipped sources, for a neighborhood and for the city", () => {
    const words = (md: string) => md.split(/\s+/).filter(Boolean).length;
    const { plan } = hazelwood();
    const hz = words(toBrief(plan));
    const file = JSON.parse(readFileSync(LOTS, "utf8")) as LotsFile;
    const compsFile = JSON.parse(readFileSync(COMPS, "utf8")) as CompsFile;
    const city = wire(file.lots, file.lots.map((l) => compsFor(l, compsFile)), [...file.sources, ...compsFile.sources]);
    const cw = words(toBrief(city));
    for (const n of [hz, cw]) {
      expect(n).toBeGreaterThanOrEqual(350);
      expect(n).toBeLessThanOrEqual(450);
    }
    expect(toBrief(city)).toMatch(/- District unconfirmed \(inventory vs zoning map\): 14/);
  }, 120_000);

  it("brief and CSV never use readiness, release, no-hearing, subsidy-need or pays-for-itself wording", () => {
    const { plan } = hazelwood();
    const text = `${toBrief(plan)}\n${toCsv(plan.rows)}`;
    expect(text).not.toMatch(/\bready\b|releas|no hearing|needs subsidy|pays? for (it|them)sel/i);
    // "by right" overstates a use-table and lot-size screen. Only the legacy column name and the bill's
    // own wording (the bill permits ADUs by right) keep it.
    expect(text.replace(/by_right_types/g, "").replace(plan.billLine, "")).not.toMatch(/by right/i);
  });

  it("the brief calls the list candidates for staff review and never promises readiness", () => {
    const { plan } = hazelwood();
    const md = toBrief(plan);
    expect(md).toContain("**Candidates for staff review: 106.**");
    expect(md).toContain("## Financial hurdle for 10 projects");
    expect(md).not.toMatch(/ready|can be offered|Offer through/i);
    expect(md).toMatch(/Parking/);
  });
});

function wire(lots: Lot[], comps: (Comps | null)[], sources: { name: string; url: string; vintage: string }[] = []) {
  const evals = Object.fromEntries(
    (["current", "bill-2025-1545"] as RuleSet[]).map((rs) => [rs, { findings: lots.map((l) => evaluateLot(l, rs)) }]),
  ) as Record<RuleSet, { findings: ReturnType<typeof evaluateLot>[] }>;
  const triages = lots.map((l, i) => triageLot(l, evals.current.findings[i], comps[i], DEFAULT_FINANCE));
  const evidence = lots.map((l, i) => evidenceForLot(l, evals.current.findings[i], triages[i], comps[i], DEFAULT_FINANCE, null));
  return buildPlan(lots, evals, triages, evidence, comps, DEFAULT_FINANCE, { neighborhoods: [] }, "current", 10, { sources });
}

const comps60k: Comps = { neighborhood: "Test", zip: "15217", zhvi: 60_000, zhviDate: "2026-08-31", zori: 900, zoriDate: "2026-08-31" };

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
    expect(reliefSentence(plan)).toBe("2 lots fail only lot size; 1 of them also needs a use approval (Hillside) that relief does not remove.");
  });

  it("a protected-purpose record (Greenway) stays searchable and exportable but never enters the candidate cohort", () => {
    const green = { ...testLot("0116J00315000000", "R1D-M", 6000), inventoryType: "Greenway" };
    const plan = wire([green], [null]);
    expect(plan.rows).toHaveLength(1);
    expect(plan.rows[0].candidate).toBe(false);
    expect(plan.candidates.total).toBe(0);
    expect(plan.funnel.byRight).toBe(1);
    expect(plan.funnel.availableNoFlag).toBe(0);
    expect(plan.rows[0].next_action).toBe("Staff review: confirm disposition channel (inventory type Greenway); channel Other");
  });
});

describe("buildPlan: zoning map cross-check and the bill line", () => {
  it("exports the map district and agreement, and a disagreeing lot's use check is unknown", () => {
    const off = { ...testLot("off", "R1D-H", 3000), zoneMap: "RM-M", zoneAgrees: false };
    const on = { ...testLot("on", "R2-M", 3000), zoneMap: "R2-M", zoneAgrees: true };
    const plan = wire([off, on], [null, null]);
    const row = (id: string) => plan.rows.find((r) => r.parcel_id === id)!;
    expect(row("off")).toMatchObject({ zone: "R1D-H", zone_map: "RM-M", zone_agrees: "false", check_use: "unknown" });
    expect(row("on")).toMatchObject({ zone_map: "R2-M", zone_agrees: "true", check_use: "pass" });
    const csv = toCsv(plan.rows).split("\n");
    expect(csv[0].endsWith(",zone_map,zone_agrees,shortfall_at_1_3x_value,finance_screened,finance_reason,site_cost_per_project")).toBe(true);
    expect(row("off")).toMatchObject({ finance_screened: "false", finance_reason: "district unconfirmed", est_total_cost: "", shortfall_to_target: "" });
  });

  it("leaves the zone columns blank when the lot was not compared", () => {
    const plan = wire([testLot("none", "R2-M", 3000)], [null]);
    expect(plan.rows[0]).toMatchObject({ zone_map: "", zone_agrees: "" });
  });

  it("computes the bill line on the candidates: ADUs under the bill, and parking only where today's proposal needs a space", () => {
    // Two 40 ft R1D-H lots screen as a detached house (1 space today); a 20 ft R1A-VH lot screens as a townhouse (0 today).
    const lots = [
      { ...testLot("a", "R1D-H", 3000), frontageFt: 40 },
      { ...testLot("b", "R1D-H", 3000), frontageFt: 40 },
      { ...testLot("c", "R1A-VH", 3000), frontageFt: 20 },
    ];
    const plan = wire(lots, [null, null, null]);
    expect(plan.candidates.total).toBe(3);
    expect(plan.billLine).toBe(
      "If Bill 2025-1545 passes: an ADU by right on 3 of 3 candidates; required parking 1 → 0 on 2 (the other 1 needs none today).",
    );
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

describe("hardCostRows: the shortfall table's rate rows", () => {
  const plan = (hardCostPerSf: number) =>
    buildPlan(
      [testLot("a", "R2-M", 3000)],
      { current: { findings: [evaluateLot(testLot("a", "R2-M", 3000), "current")] }, "bill-2025-1545": { findings: [evaluateLot(testLot("a", "R2-M", 3000), "bill-2025-1545")] } },
      [triageLot(testLot("a", "R2-M", 3000), evaluateLot(testLot("a", "R2-M", 3000), "current"), comps60k, { ...DEFAULT_FINANCE, hardCostPerSf })],
      [evidenceForLot(testLot("a", "R2-M", 3000), evaluateLot(testLot("a", "R2-M", 3000), "current"), triageLot(testLot("a", "R2-M", 3000), evaluateLot(testLot("a", "R2-M", 3000), "current"), comps60k, { ...DEFAULT_FINANCE, hardCostPerSf }), comps60k, { ...DEFAULT_FINANCE, hardCostPerSf }, null)],
      [comps60k],
      { ...DEFAULT_FINANCE, hardCostPerSf },
      { neighborhoods: [] },
      "current",
      10,
    );
  it("marks the displayed default and lists the other mentor scenarios", () => {
    const g = plan(225).gap!;
    expect(hardCostRows(g).map((r) => [r.label, r.strong])).toEqual([
      ["$185/sf (prior hard-cost rate, with today's site allowance)", false],
      ["$225/sf (displayed; default, Steigerwalt mid)", true],
      ["$250/sf (Steigerwalt high)", false],
      ["$350/sf (Tom Hardy mid, vertical construction)", false],
    ]);
    expect(hardCostRows(g)[1].s.total).toBe(g.total);
  });
  it("inserts a user's own rate in rate order", () => {
    const labels = hardCostRows(plan(300).gap!).map((r) => r.label);
    expect(labels).toEqual([
      "$185/sf (prior hard-cost rate, with today's site allowance)",
      "$225/sf (default, Steigerwalt mid)",
      "$250/sf (Steigerwalt high)",
      "$300/sf (displayed)",
      "$350/sf (Tom Hardy mid, vertical construction)",
    ]);
  });
});

describe("buildPlan: export date", () => {
  afterEach(() => vi.useRealTimers());
  it("dates the plan, its CSV rows and the brief heading by the Pittsburgh calendar day", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-27T01:12:00Z")); // 21:12 EDT, Sept 26
    const plan = wire([testLot("a", "R2-M", 3000)], [null]);
    expect(plan.generatedAt).toBe("2026-09-26");
    expect(plan.rows[0].generated_at).toBe("2026-09-26");
    expect(toBrief(plan)).toMatch(/^_2026-09-26 · /m);
  });
});
