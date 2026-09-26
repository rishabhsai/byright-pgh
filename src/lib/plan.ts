import type { Comps, Finding, Lot, RuleSet, TriageResult, Typology } from "./types";
import { lookupDistrict, normalizeZone, RULESET_LABEL, TYPOLOGY_ORDER, UNENCODED_DISTRICT_NAME } from "./rules";
import { fmtNum, fmtUsd, type FinanceAssumptions } from "./proforma";
import { MIN_PRACTICAL_LOT_SQFT } from "./triage";
import { hasHazardFlag, isAvailable } from "./ranking";
import { fmtUsdShort, pickFinding, proformaFor, type Evidence, type EvidenceId, type EvidenceState } from "./evidence";

/*
 * The Disposition plan: a scope-aware funnel, the ready-now split, the gap to make N homes, and the
 * exports (CSV, one-page brief). Pure: every number comes from the rules, triage and pro forma.
 * Spec: research/07-brainstorm-product-cycle1.md § 4.
 */

export type Channel = "Public Sale" | "URA Transfer" | "PLB Transfer" | "Other";
export const CHANNELS: Channel[] = ["Public Sale", "URA Transfer", "PLB Transfer", "Other"];

export function channelOf(lot: Lot): Channel {
  const t = lot.inventoryType;
  return t === "Public Sale" || t === "URA Transfer" || t === "PLB Transfer" ? t : "Other";
}

export const CSV_COLUMNS = [
  "parcel_id", "address", "neighborhood", "ward", "council_district",
  "status", "inventory_type", "channel",
  "zone", "zone_name", "lot_area_sf", "frontage_ft_approx", "assessed_land_value",
  "best_type", "best_verdict", "by_right_types", "relief_sections", "review_kind",
  "check_use", "check_lot_size", "check_width", "check_fit", "check_site", "check_finance",
  "checks_passed_of_6", "unresolved_notes",
  "flag_slope_25", "flag_undermined", "flag_flood", "hazard_test_method",
  "est_total_cost", "est_value", "value_basis", "value_basis_date",
  "shortfall_to_target", "break_even_value", "shortfall_at_150psf", "shortfall_at_215psf",
  "adjacent_city_lots_150ft",
  "triage", "next_action",
  "rule_set", "hard_cost_psf", "soft_pct", "fee_pct", "target_margin_pct", "generated_at",
] as const;

export type CsvColumn = (typeof CSV_COLUMNS)[number];
export type PlanRow = Record<CsvColumn, string | number> & { lotIndex: number; ready: boolean };

export interface PlanScope {
  /** Empty means citywide. */
  neighborhoods: string[];
  /** The Home type filter; null screens each lot's best type. */
  typology?: Typology | null;
}

export interface PlanOptions {
  sources?: { name: string; url: string; vintage: string }[];
  generatedAt?: string;
  landOverrides?: Record<string, number>;
}

export interface Funnel {
  records: number;
  encoded: number;
  byRight: number;
  availableNoFlag: number;
  atLeast1000: number;
  pencil: number;
}

export interface GapScenario {
  total: number;
  perHome: number;
}

export interface Gap extends GapScenario {
  /** Homes asked for. */
  n: number;
  /** Ready lots with a modeled shortfall that went into the total (≤ n). */
  lots: number;
  hardCostPerSf: number;
  at150: GapScenario;
  at215: GapScenario;
  /** Mean break-even value of those lots at the displayed assumptions. */
  breakEvenAvg: number;
  zhvi: { neighborhood: string; value: number; date: string | null }[];
}

export interface Plan {
  scopeLabel: string;
  ruleSet: RuleSet;
  generatedAt: string;
  assumptions: FinanceAssumptions;
  funnel: Funnel;
  ready: { total: number; byChannel: Record<Channel, number>; byType: Partial<Record<Typology, number>> };
  gap: Gap | null;
  needsRelief: number;
  hillsideReview: number;
  notEvaluated: number;
  billLine: string;
  shortlist: PlanRow[];
  rows: PlanRow[];
  /** Unknown and not-checked evidence on ready lots, verbatim, with how many ready lots carry it. */
  openItems: { label: string; state: EvidenceState; detail: string; count: number }[];
  sources: { name: string; url: string; vintage: string }[];
}

export const TYPE_NAME: Record<Typology, string> = {
  single: "Single-unit detached",
  single_adu: "Single-unit + ADU",
  duplex: "Two-unit",
  triplex: "Three-unit",
  townhome: "Single-unit attached",
};

export const DISCLAIMER =
  "Decision support generated from public records. Not a zoning determination or legal advice. The City's Zoning Administrator interprets the code. The pro forma is a screen, not underwriting.";

const STATE_CSV: Record<EvidenceState, string> = { pass: "pass", fail: "fail", unknown: "unknown", notChecked: "not_checked" };
const EVIDENCE_COL: Record<EvidenceId, CsvColumn> = {
  use: "check_use",
  lotSize: "check_lot_size",
  width: "check_width",
  fit: "check_fit",
  site: "check_site",
  finance: "check_finance",
};

const LOT_SIZE_IDS = new Set(["lot-area", "lot-area-per-unit"]);

const isEncoded = (fs: Finding[]) => fs.length > 0 && fs.some((f) => f.verdict !== "unknown");

function byRightFor(fs: Finding[], typology: Typology | null): boolean {
  return typology ? fs.find((f) => f.typology === typology)?.verdict === "by-right" : fs.some((f) => f.verdict === "by-right");
}

/** No by-right type, and the most permissive one fails only lot size: relief (variance or § 921.04), not a use change. */
function lotSizeReliefOnly(fs: Finding[], typology: Typology | null): boolean {
  const pool = typology ? fs.filter((f) => f.typology === typology) : fs;
  if (pool.some((f) => f.verdict === "by-right" || f.verdict === "review")) return false;
  return pool.some((f) => f.verdict === "variance" && f.checks.every((c) => c.passed !== false || LOT_SIZE_IDS.has(c.id)));
}

/** Hillside lots that meet the lot standards and need only the § 911.04.A.69 exception. */
function hillsideException(lot: Lot, fs: Finding[], rs: RuleSet, typology: Typology | null): boolean {
  if (!isHillside(lot, rs)) return false;
  const pool = typology ? fs.filter((f) => f.typology === typology) : fs;
  return pool.some((f) => f.verdict === "review");
}

function isHillside(lot: Lot, rs: RuleSet): boolean {
  return lookupDistrict(rs, lot.zone)?.family === "H";
}

function zoneName(zone: string, rs: RuleSet): string {
  const d = lookupDistrict(rs, zone);
  if (d) return d.name;
  return UNENCODED_DISTRICT_NAME[normalizeZone(zone).split("-")[0]] ?? "";
}

function readyStage(lot: Lot, fs: Finding[], typology: Typology | null): number {
  if (!isEncoded(fs)) return 1;
  if (!byRightFor(fs, typology)) return 2;
  if (!isAvailable(lot) || hasHazardFlag(lot)) return 3;
  if (lot.lotAreaSqFt === null || lot.lotAreaSqFt < MIN_PRACTICAL_LOT_SQFT) return 4;
  return 5;
}

/** By right (for the Home type filter, or any type), available for sale, no hazard flag, at least 1,000 sf. */
export function isReadyLot(lot: Lot, findings: Finding[], typology: Typology | null): boolean {
  return readyStage(lot, findings, typology) === 5;
}

function scopeLabel(scope: PlanScope): string {
  const n = scope.neighborhoods;
  if (n.length === 0) return "Citywide";
  if (n.length <= 3) return n.join(", ");
  return `${n.slice(0, 2).join(", ")} and ${n.length - 2} more`;
}

const round = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "" : Math.round(n));

function nextAction(lot: Lot, f: Finding, ev: Evidence, rs: RuleSet, triage: TriageResult | null): string {
  if (f.verdict === "unknown" || f.verdict === "prohibited" || triage?.triage === "red") return "";
  const state = (id: EvidenceId) => ev.checks.find((c) => c.id === id)?.state;
  if (isHillside(lot, rs)) return "Hillside site conditions (§ 911.04.A.69)";
  const sliver = lot.lotAreaSqFt !== null && lot.lotAreaSqFt < MIN_PRACTICAL_LOT_SQFT;
  if (f.verdict === "variance") return sliver ? "Consolidate with adjacent City lot" : "Staff determine relief path (§ 921.04 vs variance)";
  if (state("width") === "fail" || state("width") === "unknown" || state("lotSize") === "unknown") return "Survey width";
  if (sliver) return "Consolidate with adjacent City lot";
  if (f.verdict === "review") return "Staff determine relief path (§ 921.04 vs variance)";
  if (state("finance") === "unknown") return "Enter a comp";
  if (!isAvailable(lot)) return `Confirm status (${lot.status || "not recorded"}) before offering`;
  return `Offer through ${channelOf(lot)}`;
}

function reliefSections(f: Finding): string {
  const s = new Set<string>();
  for (const c of f.checks) {
    if (c.passed !== false) continue;
    s.add(c.citation.section);
    if (LOT_SIZE_IDS.has(c.id)) s.add("§ 921.04");
  }
  if (f.reviewKind === "administrator") s.add("§ 922.08");
  if (f.reviewKind === "special") s.add("§ 922.07");
  return [...s].join("; ");
}

export function buildPlan(
  lots: Lot[],
  evals: Record<RuleSet, { findings: Finding[][] }>,
  triages: TriageResult[],
  evidence: Evidence[],
  comps: (Comps | null)[],
  assumptions: FinanceAssumptions,
  scope: PlanScope,
  ruleSet: RuleSet,
  homesToPlan = 10,
  opts: PlanOptions = {},
): Plan {
  const typology = scope.typology ?? null;
  const hoods = scope.neighborhoods.length ? new Set(scope.neighborhoods) : null;
  const generatedAt = opts.generatedAt ?? new Date().toISOString();
  const findings = evals[ruleSet].findings;
  const other: RuleSet = ruleSet === "current" ? "bill-2025-1545" : "current";

  const funnel: Funnel = { records: 0, encoded: 0, byRight: 0, availableNoFlag: 0, atLeast1000: 0, pencil: 0 };
  const byChannel: Record<Channel, number> = { "Public Sale": 0, "URA Transfer": 0, "PLB Transfer": 0, Other: 0 };
  const byType: Partial<Record<Typology, number>> = {};
  let needsRelief = 0;
  let hillsideReview = 0;
  let aduOptions = 0;
  const readyByRuleSet: Record<RuleSet, number> = { current: 0, "bill-2025-1545": 0 };
  const rows: PlanRow[] = [];
  const open = new Map<string, { label: string; state: EvidenceState; detail: string; count: number }>();

  for (let i = 0; i < lots.length; i++) {
    const lot = lots[i];
    if (hoods && !hoods.has(lot.neighborhood)) continue;
    const fs = findings[i];
    const tr = triages[i] ?? null;
    const ev = evidence[i];
    const stage = readyStage(lot, fs, typology);
    const ready = stage === 5;

    funnel.records++;
    if (stage >= 2) funnel.encoded++;
    if (stage >= 3) funnel.byRight++;
    if (stage >= 4) funnel.availableNoFlag++;
    if (ready) {
      funnel.atLeast1000++;
      if (tr?.pencils) funnel.pencil++;
    }
    readyByRuleSet[ruleSet] += ready ? 1 : 0;
    const otherFs = evals[other]?.findings[i];
    if (otherFs && readyStage(lot, otherFs, typology) === 5) readyByRuleSet[other]++;
    if (ready) {
      const cur = ruleSet === "current" ? fs : otherFs;
      const bill = ruleSet === "current" ? otherFs : fs;
      const adu = (x: Finding[] | undefined) => x?.find((f) => f.typology === "single_adu")?.verdict === "by-right";
      if (adu(bill) && !adu(cur)) aduOptions++;
    }
    if (stage >= 2 && lotSizeReliefOnly(fs, typology)) needsRelief++;
    if (stage >= 2 && hillsideException(lot, fs, ruleSet, typology)) hillsideReview++;

    const f = pickFinding(fs, tr, typology);
    if (ready) {
      byChannel[channelOf(lot)]++;
      byType[f.typology] = (byType[f.typology] ?? 0) + 1;
      for (const c of ev.checks) {
        if (c.state !== "unknown" && c.state !== "notChecked") continue;
        const key = `${c.label}|${c.detail}`;
        const o = open.get(key);
        if (o) o.count++;
        else open.set(key, { label: c.label, state: c.state, detail: c.detail, count: 1 });
      }
    }

    const land = opts.landOverrides?.[lot.id];
    const a = land == null ? assumptions : { ...assumptions, landOverride: land };
    const priced = f.verdict !== "unknown" && f.verdict !== "prohibited";
    const pf = priced ? proformaFor(lot, f.typology, comps[i], a) : null;
    const pf150 = pf ? proformaFor(lot, f.typology, comps[i], { ...a, hardCostPerSf: 150 }) : null;
    const pf215 = pf ? proformaFor(lot, f.typology, comps[i], { ...a, hardCostPerSf: 215 }) : null;
    const c = comps[i];
    const sale = pf?.mode === "sale";

    const row = {
      lotIndex: i,
      ready,
      parcel_id: lot.id,
      address: lot.address,
      neighborhood: lot.neighborhood,
      ward: lot.ward,
      council_district: lot.councilDistrict,
      status: lot.status,
      inventory_type: lot.inventoryType,
      channel: channelOf(lot),
      zone: lot.zone,
      zone_name: zoneName(lot.zone, ruleSet),
      lot_area_sf: round(lot.lotAreaSqFt),
      frontage_ft_approx: round(lot.frontageFt),
      assessed_land_value: round(lot.landValue),
      best_type: f.verdict === "unknown" ? "" : f.typology,
      best_verdict: f.verdict,
      by_right_types: TYPOLOGY_ORDER.filter((t) => fs.find((x) => x.typology === t)?.verdict === "by-right").join("; "),
      relief_sections: reliefSections(f),
      review_kind: f.reviewKind ?? "",
      checks_passed_of_6: ev.passed,
      unresolved_notes: ev.checks
        .filter((x) => x.state === "unknown" || x.state === "notChecked")
        .map((x) => `${x.label}: ${x.detail}`)
        .join(" | "),
      flag_slope_25: String(lot.hazards.steepSlope),
      flag_undermined: String(lot.hazards.undermined),
      flag_flood: lot.hazards.floodZone === null ? "unknown" : String(lot.hazards.floodZone),
      hazard_test_method: "inventory point",
      est_total_cost: round(pf?.totalCost),
      est_value: round(pf?.revenue),
      value_basis: pf && c ? (sale ? `ZHVI ${c.neighborhood}` : `ZORI ${c.zip}`) : "",
      value_basis_date: pf && c ? ((sale ? c.zhviDate : c.zoriDate) ?? "") : "",
      shortfall_to_target: round(pf?.gap),
      break_even_value: round(pf?.breakEvenValue),
      shortfall_at_150psf: round(pf150?.gap),
      shortfall_at_215psf: round(pf215?.gap),
      adjacent_city_lots_150ft: "",
      triage: tr?.triage ?? "",
      next_action: nextAction(lot, f, ev, ruleSet, tr),
      rule_set: ruleSet,
      hard_cost_psf: assumptions.hardCostPerSf,
      soft_pct: assumptions.softCostPct,
      fee_pct: assumptions.devFeePct,
      target_margin_pct: assumptions.targetMarginPct,
      generated_at: generatedAt,
    } as PlanRow;
    for (const x of ev.checks) row[EVIDENCE_COL[x.id]] = STATE_CSV[x.state];
    rows.push(row);
  }

  // Ready lots first, lowest shortfall first (unassessed last), then larger lots.
  const gapOf = (r: PlanRow) => (r.shortfall_to_target === "" ? Infinity : Number(r.shortfall_to_target));
  rows.sort(
    (a, b) =>
      Number(b.ready) - Number(a.ready) ||
      gapOf(a) - gapOf(b) ||
      (Number(b.checks_passed_of_6) - Number(a.checks_passed_of_6)) ||
      Number(b.lot_area_sf || 0) - Number(a.lot_area_sf || 0),
  );
  const n = Math.max(1, Math.floor(homesToPlan));
  const shortlist = rows.filter((r) => r.ready).slice(0, n);
  const priced = shortlist.filter((r) => r.shortfall_to_target !== "");

  let gap: Gap | null = null;
  if (priced.length) {
    const sum = (k: CsvColumn) => priced.reduce((s, r) => s + Number(r[k] || 0), 0);
    const scen = (k: CsvColumn): GapScenario => ({ total: sum(k), perHome: sum(k) / priced.length });
    const zhvi = new Map<string, { neighborhood: string; value: number; date: string | null }>();
    for (const r of priced) {
      const c = comps[r.lotIndex];
      if (c?.zhvi != null && !zhvi.has(c.neighborhood)) zhvi.set(c.neighborhood, { neighborhood: c.neighborhood, value: c.zhvi, date: c.zhviDate });
    }
    gap = {
      n,
      lots: priced.length,
      hardCostPerSf: assumptions.hardCostPerSf,
      ...scen("shortfall_to_target"),
      at150: scen("shortfall_at_150psf"),
      at215: scen("shortfall_at_215psf"),
      breakEvenAvg: sum("break_even_value") / priced.length,
      zhvi: [...zhvi.values()],
    };
  }

  const cur = readyByRuleSet.current;
  const bill = readyByRuleSet["bill-2025-1545"];
  const readyChange = cur === bill ? "no change to the ready count" : `ready count ${fmtNum(cur)} → ${fmtNum(bill)}`;
  const billLine = `If Bill 2025-1545 passes: +${fmtNum(aduOptions)} ADU options on ready lots; ${readyChange}.`;

  return {
    scopeLabel: scopeLabel(scope),
    ruleSet,
    generatedAt,
    assumptions,
    funnel,
    ready: { total: funnel.atLeast1000, byChannel, byType },
    gap,
    needsRelief,
    hillsideReview,
    notEvaluated: funnel.records - funnel.encoded,
    billLine,
    shortlist,
    rows,
    openItems: [...open.values()].sort((a, b) => b.count - a.count),
    sources: opts.sources ?? [],
  };
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: PlanRow[]): string {
  const lines = [CSV_COLUMNS.join(",")];
  for (const r of rows) lines.push(CSV_COLUMNS.map((k) => csvCell(r[k])).join(","));
  return lines.join("\n") + "\n";
}

export function funnelLine(f: Funnel): string {
  return `${fmtNum(f.records)} lots → ${fmtNum(f.encoded)} in encoded districts → ${fmtNum(f.byRight)} by right → ${fmtNum(f.availableNoFlag)} no hazard flag and available → ${fmtNum(f.atLeast1000)} ≥ 1,000 sf → ${fmtNum(f.pencil)} pencil at market`;
}

export function gapSentence(plan: Plan): string {
  const g = plan.gap;
  if (!g) return "No ready lot in scope has comps, so the gap was not modeled.";
  const lots = g.lots === 1 ? "ready lot needs" : `${fmtNum(g.lots)} lowest-shortfall ready lots need`;
  const zhvi = g.zhvi.map((z) => `${z.neighborhood} ZHVI ${fmtUsdShort(z.value)}`).join(", ");
  return `The ${lots} about ${fmtUsdShort(g.total)} in gap funding at $${g.hardCostPerSf}/sf (${fmtUsdShort(g.perHome)} per home). Break-even sale value ${fmtUsdShort(g.breakEvenAvg)}${zhvi ? `; ${zhvi}` : ""}.`;
}

export function toBrief(plan: Plan): string {
  const L: string[] = [];
  const f = plan.funnel;
  const date = plan.generatedAt.slice(0, 10);
  const a = plan.assumptions;
  L.push(`# Disposition plan: ${plan.scopeLabel}`, "");
  L.push(`_${date} · ${RULESET_LABEL[plan.ruleSet]} · ByRight PGH screening at $${a.hardCostPerSf}/sf hard cost, ${a.softCostPct}% soft, ${a.devFeePct}% fee, ${a.targetMarginPct}% target return._`, "");

  L.push("## Funnel", "", funnelLine(f), "");
  L.push(`${fmtNum(plan.needsRelief)} need relief (lot size) · ${fmtNum(plan.hillsideReview)} Hillside exception · ${fmtNum(plan.notEvaluated)} not evaluated`, "");

  L.push("## Ready now", "");
  L.push(`${fmtNum(plan.ready.total)} lots can be offered for a small home without a hearing, under the checks we ran.`, "");
  L.push(`- By channel: ${CHANNELS.map((c) => `${c} ${fmtNum(plan.ready.byChannel[c])}`).join(" · ")}`);
  const types = TYPOLOGY_ORDER.filter((t) => plan.ready.byType[t]);
  L.push(`- By best type: ${types.length ? types.map((t) => `${TYPE_NAME[t]} ${fmtNum(plan.ready.byType[t]!)}`).join(" · ") : "none"}`, "");

  L.push(`## Gap to make ${plan.gap?.n ?? 0} homes`, "", gapSentence(plan), "");
  if (plan.gap) {
    const g = plan.gap;
    L.push("| Hard cost | Total shortfall | Per home |", "|---|---:|---:|");
    L.push(`| $${g.hardCostPerSf}/sf (displayed) | ${fmtUsd(g.total)} | ${fmtUsd(g.perHome)} |`);
    L.push(`| $150/sf | ${fmtUsd(g.at150.total)} | ${fmtUsd(g.at150.perHome)} |`);
    L.push(`| $215/sf | ${fmtUsd(g.at215.total)} | ${fmtUsd(g.at215.perHome)} |`, "");
    L.push("Modeled shortfall to the target return; not a subsidy award or eligibility finding.", "");
  }

  L.push("## Needs relief", "");
  L.push(
    `${fmtNum(plan.needsRelief)} lots fail only lot size. If the City consolidated pairs or granted § 921.04 exceptions, more become ready; how many (City lots within 150 ft) is not computed yet.`,
    "",
  );

  L.push("## Scenario", "", plan.billLine, "");

  if (plan.shortlist.length) {
    L.push(`## Shortlist (top ${plan.shortlist.length})`, "");
    L.push("| Address | Parcel | Channel | Type | Checks | Shortfall | Next action |", "|---|---|---|---|---:|---:|---|");
    for (const r of plan.shortlist) {
      const sf = r.shortfall_to_target === "" ? "n/a" : fmtUsd(Number(r.shortfall_to_target));
      const type = r.best_type ? TYPE_NAME[r.best_type as Typology] : "";
      L.push(`| ${r.address || "(no address)"} | ${r.parcel_id} | ${r.channel} | ${type} | ${r.checks_passed_of_6}/6 | ${sf} | ${r.next_action} |`);
    }
    L.push("");
  }

  if (plan.openItems.length) {
    L.push("## Unresolved and not checked (ready lots)", "");
    for (const o of plan.openItems) L.push(`- **${o.label}, ${o.state === "notChecked" ? "not checked" : "unknown"}** (${fmtNum(o.count)}): ${o.detail}`);
    L.push("");
  }

  if (plan.sources.length) {
    L.push("## Sources", "");
    for (const s of plan.sources) L.push(`- ${s.name}. ${s.vintage}. ${s.url}`);
    L.push("");
  }

  L.push("---", "", `_${DISCLAIMER}_`, "");
  return L.join("\n");
}
