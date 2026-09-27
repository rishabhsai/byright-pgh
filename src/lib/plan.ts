import type { Citation, Comps, Finding, Lot, RuleSet, TriageResult, Typology } from "./types";
import { lookupDistrict, normalizeZone, RULESET_LABEL, TYPOLOGY_ORDER, TYPOLOGY_USE_ROW, UNENCODED_DISTRICT_NAME } from "./rules";
import {
  fmtNum,
  fmtUsd,
  HARD_COST_SCENARIOS,
  NEW_CONSTRUCTION_PREMIUM,
  UNIT_PLAN,
  ZILLOW_DATA_URL,
  type FinanceAssumptions,
  type Proforma,
  type RevenueMode,
  type ScenarioPsf,
} from "./proforma";
import { todayET } from "./dates";
import { hasHazardFlag, isAvailable, isDispositionEligible } from "./ranking";
import {
  districtUnconfirmed,
  financeResult,
  firstOpenItem,
  fmtUsdShort,
  MIN_PRACTICAL_LOT_SQFT,
  pickFinding,
  proformaFor,
  summary,
  type Evidence,
  type EvidenceId,
  type EvidenceState,
} from "./evidence";

/*
 * The Disposition plan: a scope-aware funnel, the candidates for staff review, the modeled shortfall
 * for N projects, and the exports (CSV, brief). Pure: every number comes from the rules, triage and
 * pro forma. A candidate is a review-queue entry, never a release decision: its next action is the
 * first open review item from the same assessment, plus the recorded channel.
 * Spec: research/07-brainstorm-product-cycle1.md § 4, corrected by research/08-audit2-gpt6-astra.md § 1 and § 3.
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
  "shortfall_to_target", "break_even_value",
  // One shortfall per hard-cost scenario (HARD_COST_SCENARIOS); these replaced shortfall_at_150psf and shortfall_at_215psf.
  "shortfall_at_185psf", "shortfall_at_225psf", "shortfall_at_250psf", "shortfall_at_350psf",
  "adjacent_city_lots_150ft",
  "triage", "next_action",
  "rule_set", "hard_cost_psf", "soft_pct", "fee_pct", "target_margin_pct", "generated_at",
  // Appended in cycle 2; the columns above keep their names and order.
  "staff_review_candidate", "checks_unknown", "checks_not_checked", "units",
  "revenue_mode", "effective_land_cost", "land_source", "typical_home_sf", "cap_rate_pct", "opex_pct", "default_land_cost",
  "rule_citations", "cost_basis",
  // Appended in cycle 3: the City zoning map district at the inventory point, and the new-construction premium case.
  "zone_map", "zone_agrees", "shortfall_at_1_3x_value",
  // Appended in cycle 4: whether the row's money is a screen result (financeResult); when false every money column is blank.
  "finance_screened", "finance_reason",
  // Appended with the mentor calibration (Sept 26, 2026): site work, once per project.
  "site_cost_per_project",
] as const;

export type CsvColumn = (typeof CSV_COLUMNS)[number];

/** Unrounded finance for one row, so totals sum exact values rather than rounded cells. */
export interface RowFinance {
  gap: number;
  /** Shortfall at each hard-cost scenario rate. */
  gapAt: Record<ScenarioPsf, number | null>;
  /** Shortfall with value at 1.3× the comp index (new-construction premium), at the displayed hard cost. */
  gapPremium: number | null;
  /** Total cost × (1 + target return): the value the project must reach, not zero-profit break-even. */
  targetValue: number;
  mode: RevenueMode;
  dwellings: number;
}

export type PlanRow = Record<CsvColumn, string | number> & {
  lotIndex: number;
  /** Candidate for staff review (use table and lot size pass, recorded available, no hazard flag, ≥ 1,000 sf). */
  candidate: boolean;
  /** @deprecated Same as `candidate`. */
  ready: boolean;
  finance: RowFinance | null;
};

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
  /** Recorded available, disposition-eligible (isDispositionEligible), no hazard flag. */
  availableNoFlag: number;
  atLeast1000: number;
  pencil: number;
}

export interface GapScenario {
  total: number;
  perProject: number;
  perDwelling: number;
}

export interface Gap extends GapScenario {
  /** Projects asked for (one project per parcel). */
  n: number;
  /** Candidate projects with a screened financial result that went into the total (≤ n). */
  projects: number;
  /** Shortlisted candidates with no screened financial result (district or permission unresolved, no comps): listed, never totaled. */
  notScreened: number;
  /** Dwellings those projects deliver (a duplex is one project, two dwellings). */
  dwellings: number;
  hardCostPerSf: number;
  /** The shortfall at each hard-cost scenario rate (HARD_COST_SCENARIOS), in rate order. */
  atRates: (GapScenario & { psf: number; note: string })[];
  /** Value at 1.3× the comp index, at the displayed hard cost: the new-construction premium case. */
  atPremium: GapScenario;
  /** Mean target value per project: total cost plus the target return, at the displayed assumptions. */
  targetValueAvg: number;
  /** Revenue mode the projects were valued in; "mixed" when some fell back to the other comp. */
  valueMode: RevenueMode | "mixed";
  /** The aggregate reference values used: neighborhood ZHVI (sale) or ZIP ZORI (rent). */
  valueBasis: { label: string; value: number; date: string | null; mode: RevenueMode }[];
}

/** Open-item groups the brief counts on candidates, in the order staff clear them. */
export type OpenGroupId = "district" | "permission" | "width" | "fit" | "site" | "finance-short" | "finance-unscreened" | "parking";

export const OPEN_GROUP_LABEL: Record<OpenGroupId, string> = {
  district: "District unconfirmed (inventory vs zoning map)",
  permission: "Permission unresolved (width or ADU overlay)",
  width: "Width not in the record (survey)",
  fit: "Fit not checked (setbacks, height, coverage)",
  site: "Site access, water/sewer, soils not checked",
  "finance-short": "Finance: modeled shortfall to target return",
  "finance-unscreened": "Finance not screened",
  parking: "Parking to verify on the site plan",
};

export interface Plan {
  scopeLabel: string;
  /** The Home type filter the plan screened; null screens each lot's default proposal (DEFAULT_PROPOSAL_RULE). */
  typology: Typology | null;
  ruleSet: RuleSet;
  /** YYYY-MM-DD, the Pittsburgh calendar date (todayET) unless PlanOptions supplies one. */
  generatedAt: string;
  assumptions: FinanceAssumptions;
  funnel: Funnel;
  /** Candidates for staff review, split by recorded channel and by screened type. */
  candidates: {
    total: number;
    byChannel: Record<Channel, number>;
    byType: Partial<Record<Typology, number>>;
    /** Candidates whose inventory district the zoning map does not confirm; their next action resolves the district. */
    districtUnconfirmed: number;
  };
  gap: Gap | null;
  /** Lots whose most permissive option fails only a lot-size standard. */
  needsRelief: number;
  /** Of needsRelief, lots where every such option also needs a use approval (Hillside) that relief does not remove. */
  needsReliefWithApproval: number;
  hillsideReview: number;
  notEvaluated: number;
  billLine: string;
  shortlist: PlanRow[];
  rows: PlanRow[];
  /** Unknown and not-checked evidence and unverified requirements (parking) on candidates, verbatim, with counts. */
  openItems: { label: string; state: EvidenceState; detail: string; count: number }[];
  /** Candidates carrying each open-item group (zero groups omitted), for the brief. */
  openGroups: { id: OpenGroupId; label: string; count: number }[];
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

/** Relief-only lots where every lot-size-only option also carries a use approval (Hillside). */
function lotSizeReliefKeepsApproval(fs: Finding[], typology: Typology | null): boolean {
  const pool = typology ? fs.filter((f) => f.typology === typology) : fs;
  // An option whose permission is itself unresolved (width, ADU overlay) says nothing about which approval remains.
  const reliefOnly = pool.filter(
    (f) => f.verdict === "variance" && !f.permissionQuestion && f.checks.every((c) => c.passed !== false || LOT_SIZE_IDS.has(c.id)),
  );
  return reliefOnly.length > 0 && reliefOnly.every((f) => f.reviewKind !== null);
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

function candidateStage(lot: Lot, fs: Finding[], typology: Typology | null): number {
  if (!isEncoded(fs)) return 1;
  if (!byRightFor(fs, typology)) return 2;
  if (!isAvailable(lot) || !isDispositionEligible(lot) || hasHazardFlag(lot)) return 3;
  if (lot.lotAreaSqFt === null || lot.lotAreaSqFt < MIN_PRACTICAL_LOT_SQFT) return 4;
  return 5;
}

/**
 * Candidate for staff review: passes the use table and lot-size standards (for the Home type filter, or any type), recorded Available for Sale,
 * disposition-eligible (not a protected-purpose or privately owned record: isDispositionEligible), no hazard flag at the inventory point, at least 1,000 sf. Open items (fit, parking, finance, unknowns,
 * channel) stay on the row as its next action; this is a review queue, not a release list.
 */
export function isCandidateLot(lot: Lot, findings: Finding[], typology: Typology | null): boolean {
  return candidateStage(lot, findings, typology) === 5;
}

/** @deprecated Use isCandidateLot. */
export const isReadyLot = isCandidateLot;

function scopeLabel(scope: PlanScope): string {
  const n = scope.neighborhoods;
  if (n.length === 0) return "Citywide";
  if (n.length <= 3) return n.join(", ");
  return `${n.slice(0, 2).join(", ")} and ${n.length - 2} more`;
}

const round = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "" : Math.round(n));

const lowerFirst = (x: string) => x.charAt(0).toLowerCase() + x.slice(1);

/**
 * The row's next action, from the shared first open item (evidence.ts firstOpenItem): "Resolve district:
 * inventory R2-VH vs map UPR-B" when the district is unconfirmed, else "Staff review: <first open item>;
 * channel <recorded channel>". Never an instruction to offer the lot.
 */
function nextAction(lot: Lot, f: Finding, ev: Evidence, pf: Proforma | null, triage: TriageResult | null): string {
  if ((f.verdict === "unknown" && !f.permissionQuestion) || f.verdict === "prohibited" || triage?.triage === "red") return "";
  const first = firstOpenItem(lot, f, ev, pf);
  // An unconfirmed district or an unresolved permission is the whole next action: nothing else can be routed first.
  if (first?.id === "district-conflict" || first?.id === "permission") return first.label;
  return `Staff review${first ? `: ${lowerFirst(first.label)}` : ""}; channel ${channelOf(lot)}`;
}

/** Every requirement this row leaves open: unknown and not-checked checks, unverified requirements, site limits. */
function unresolvedNotes(ev: Evidence): string {
  const notes = ev.checks.filter((x) => x.state === "unknown" || x.state === "notChecked").map((x) => `${x.label}: ${x.detail}`);
  for (const u of ev.unresolved ?? []) notes.push(`${u.label}: ${u.detail}`);
  const site = ev.checks.find((x) => x.id === "site");
  if (site && site.state !== "unknown") notes.push(`Site: ${SITE_NOT_CHECKED}`);
  return notes.join(" | ");
}

const SITE_NOT_CHECKED = "Access, water/sewer, soils not checked; hazards tested at the inventory point only";

const citeText = (c: Pick<Citation, "section" | "title" | "url">) => `${c.section} <${c.url}>`;

/** The rule text every standard applied to this proposal comes from, plus the relief routes it points to. */
function ruleCitations(lot: Lot, f: Finding, rs: RuleSet): string {
  const d = lookupDistrict(rs, lot.zone);
  if (!d || f.verdict === "unknown") return "";
  const row = TYPOLOGY_USE_ROW[f.typology];
  const cites: Pick<Citation, "section" | "title" | "url">[] = [
    d.uses[row].citation,
    d.minLotAreaSqFt.citation,
    d.minLotWidthFt.citation,
    d.minLotAreaPerUnitSqFt.citation,
    ...(d.maxFar.value !== null ? [d.maxFar.citation] : []),
    d.parkingPerUnit[row].citation,
    ...(f.typology === "single_adu" ? [d.adu.citation] : []),
  ];
  if (f.checks.some((c) => c.passed === false && LOT_SIZE_IDS.has(c.id))) cites.push({ section: "§ 921.04", title: "Nonconforming Lots", url: "https://ecode360.com/45478977" });
  if (f.reviewKind === "administrator") cites.push({ section: "§ 922.08", title: "Administrator Exceptions", url: "https://ecode360.com/45479314" });
  if (f.reviewKind === "special") cites.push({ section: "§ 922.07", title: "Special Exceptions", url: "https://ecode360.com/45479287" });
  const seen = new Set<string>();
  return cites
    .map(citeText)
    .filter((t) => (seen.has(t) ? false : (seen.add(t), true)))
    .join(" | ");
}

/** Every number behind the row's cost and value. Sources and method: COST_BASIS_NOTE (in the brief). */
function costBasis(pf: Proforma | null): string {
  return pf ? pf.inputsUsed.map((i) => `${i.label} ${i.display}`).join("; ") : "";
}

/** Where the cost_basis numbers come from; printed once in the brief rather than on every CSV row. */
export const COST_BASIS_NOTE = `Cost and value basis: hard cost, soft cost, fee, target return, cap rate and expenses are editable assumptions (method: docs/comps-and-proforma.md); land is the County assessed land value unless overridden (land_source); values are Zillow ZHVI/ZORI aggregate indices (${ZILLOW_DATA_URL}), not parcel appraisals.`;

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

/** Minimum off-street spaces the finding's parking check requires (0 when none, or no finding). */
function requiredSpaces(f: Finding | undefined): number {
  const c = f?.checks.find((x) => x.id === "parking");
  return c ? Number.parseInt(c.required ?? "0", 10) || 0 : 0;
}

interface BillTally {
  candidates: number;
  adu: number;
  aduToday: number;
  parkingDropped: number;
  spacesToday: Set<number>;
}

/** "If Bill 2025-1545 passes: an ADU by right on N of M candidates; required parking 1 → 0 on K." */
function billSentence(t: BillTally, ready: Record<RuleSet, number>): string {
  if (t.candidates === 0) return "If Bill 2025-1545 passes: no candidates in scope to compare.";
  const m = fmtNum(t.candidates);
  const adu = `an ADU by right on ${fmtNum(t.adu)} of ${m} candidate${t.candidates === 1 ? "" : "s"}${t.aduToday ? ` (${fmtNum(t.aduToday)} today)` : ""}`;
  const spaces = [...t.spacesToday].sort((a, b) => a - b);
  const from = spaces.length <= 1 ? String(spaces[0] ?? 1) : `${spaces[0]}–${spaces[spaces.length - 1]}`;
  const rest = t.candidates - t.parkingDropped;
  const parking =
    t.parkingDropped === 0
      ? "no change to required parking (no candidate's screened type needs a space today)"
      : `required parking ${from} → 0 on ${fmtNum(t.parkingDropped)}${rest > 0 ? ` (the other ${fmtNum(rest)} need${rest === 1 ? "s" : ""} none today)` : ""}`;
  const cur = ready.current;
  const bill = ready["bill-2025-1545"];
  const count = cur === bill ? "" : ` Candidate count ${fmtNum(cur)} → ${fmtNum(bill)}.`;
  return `If Bill 2025-1545 passes: ${adu}; ${parking}.${count}`;
}

/** One grouped open item for candidates whose inventory district the zoning map does not confirm. */
export const DISTRICT_OPEN_ITEM = {
  label: "District",
  detail:
    "The inventory district and the City zoning map disagree at the inventory point (or no map district contains it). Resolve the district before relying on the use result; the next action on each row names both districts.",
} as const;

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
  const generatedAt = opts.generatedAt ?? todayET();
  const findings = evals[ruleSet].findings;
  const other: RuleSet = ruleSet === "current" ? "bill-2025-1545" : "current";

  const funnel: Funnel = { records: 0, encoded: 0, byRight: 0, availableNoFlag: 0, atLeast1000: 0, pencil: 0 };
  const byChannel: Record<Channel, number> = { "Public Sale": 0, "URA Transfer": 0, "PLB Transfer": 0, Other: 0 };
  const byType: Partial<Record<Typology, number>> = {};
  let districtOpen = 0;
  let needsRelief = 0;
  let needsReliefWithApproval = 0;
  let hillsideReview = 0;
  const bill = { candidates: 0, adu: 0, aduToday: 0, parkingDropped: 0, spacesToday: new Set<number>() };
  const readyByRuleSet: Record<RuleSet, number> = { current: 0, "bill-2025-1545": 0 };
  const rows: PlanRow[] = [];
  const open = new Map<string, { label: string; state: EvidenceState; detail: string; count: number }>();
  const groups: Record<OpenGroupId, number> = { district: 0, permission: 0, width: 0, fit: 0, site: 0, "finance-short": 0, "finance-unscreened": 0, parking: 0 };

  for (let i = 0; i < lots.length; i++) {
    const lot = lots[i];
    if (hoods && !hoods.has(lot.neighborhood)) continue;
    const fs = findings[i];
    const tr = triages[i] ?? null;
    const ev = evidence[i];
    const stage = candidateStage(lot, fs, typology);
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
    const otherReady = otherFs ? candidateStage(lot, otherFs, typology) === 5 : false;
    if (otherReady) readyByRuleSet[other]++;
    if (stage >= 2 && lotSizeReliefOnly(fs, typology)) {
      needsRelief++;
      if (lotSizeReliefKeepsApproval(fs, typology)) needsReliefWithApproval++;
    }
    if (stage >= 2 && hillsideException(lot, fs, ruleSet, typology)) hillsideReview++;

    const f = pickFinding(fs, tr, typology);
    if (ready) {
      // The bill line is computed on the active plan's candidates: their ADU verdict and their proposal's parking under each code.
      const curFs = ruleSet === "current" ? fs : otherFs;
      const billFs = ruleSet === "current" ? otherFs : fs;
      const aduByRight = (x: Finding[] | undefined) => x?.find((g) => g.typology === "single_adu")?.verdict === "by-right";
      bill.candidates++;
      if (aduByRight(billFs)) bill.adu++;
      if (aduByRight(curFs)) bill.aduToday++;
      const today = requiredSpaces(curFs?.find((g) => g.typology === f.typology));
      const after = requiredSpaces(billFs?.find((g) => g.typology === f.typology));
      if (today > 0 && after === 0) {
        bill.parkingDropped++;
        bill.spacesToday.add(today);
      }
      byChannel[channelOf(lot)]++;
      byType[f.typology] = (byType[f.typology] ?? 0) + 1;
      const disputed = districtUnconfirmed(lot);
      if (disputed) districtOpen++;
      const items = [
        ...(disputed ? [{ label: DISTRICT_OPEN_ITEM.label, state: "unknown" as EvidenceState, detail: DISTRICT_OPEN_ITEM.detail }] : []),
        ...ev.checks
          .filter((c) => (c.state === "unknown" || c.state === "notChecked") && !(disputed && c.id === "use"))
          .map((c) => ({ label: c.label, state: c.state, detail: c.detail })),
        ...(ev.unresolved ?? []).map((u) => ({ label: u.label, state: "unknown" as EvidenceState, detail: u.detail })),
      ];
      const st = (id: EvidenceId) => ev.checks.find((c) => c.id === id)?.state;
      if (disputed) groups.district++;
      if (f.permissionQuestion) groups.permission++;
      if (st("width") === "unknown") groups.width++;
      if (st("fit") !== "fail") groups.fit++;
      groups.site++; // a passing Site check still leaves access, utilities and soils unchecked
      if (st("finance") === "fail") groups["finance-short"]++;
      else if (st("finance") !== "pass") groups["finance-unscreened"]++;
      if ((ev.unresolved ?? []).some((u) => u.id === "parking")) groups.parking++;
      for (const c of items) {
        const key = `${c.label}|${c.detail}`;
        const o = open.get(key);
        if (o) o.count++;
        else open.set(key, { ...c, count: 1 });
      }
    }

    const land = opts.landOverrides?.[lot.id];
    const a = land == null ? assumptions : { ...assumptions, landOverride: land };
    const priced = f.verdict !== "unknown" && f.verdict !== "prohibited";
    // One financial result: money is published only when financeResult screens it.
    const fin = financeResult(lot, f, ev, priced ? proformaFor(lot, f.typology, comps[i], a) : null);
    const pf = fin.screened ? fin.proforma : null;
    const pfAt = Object.fromEntries(
      HARD_COST_SCENARIOS.map(({ psf }) => [psf, pf ? proformaFor(lot, f.typology, comps[i], { ...a, hardCostPerSf: psf }) : null]),
    ) as Record<ScenarioPsf, Proforma | null>;
    const pfPremium = pf ? proformaFor(lot, f.typology, comps[i], { ...a, valuePremium: NEW_CONSTRUCTION_PREMIUM }) : null;
    const c = comps[i];
    const sale = pf?.mode === "sale";
    const dwellings = pf?.units ?? UNIT_PLAN[f.typology].units;

    const row = {
      lotIndex: i,
      candidate: ready,
      ready,
      finance: pf
        ? {
            gap: pf.gap,
            gapAt: Object.fromEntries(HARD_COST_SCENARIOS.map(({ psf }) => [psf, pfAt[psf]?.gap ?? null])) as Record<ScenarioPsf, number | null>,
            gapPremium: pfPremium?.gap ?? null,
            targetValue: pf.breakEvenValue,
            mode: pf.mode,
            dwellings,
          }
        : null,
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
      checks_passed_of_6: ev.counts.pass,
      unresolved_notes: unresolvedNotes(ev),
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
      shortfall_at_185psf: round(pfAt[185]?.gap),
      shortfall_at_225psf: round(pfAt[225]?.gap),
      shortfall_at_250psf: round(pfAt[250]?.gap),
      shortfall_at_350psf: round(pfAt[350]?.gap),
      adjacent_city_lots_150ft: "",
      triage: tr?.triage ?? "",
      next_action: nextAction(lot, f, ev, pf, tr),
      rule_set: ruleSet,
      hard_cost_psf: assumptions.hardCostPerSf,
      soft_pct: assumptions.softCostPct,
      fee_pct: assumptions.devFeePct,
      target_margin_pct: assumptions.targetMarginPct,
      generated_at: generatedAt,
      staff_review_candidate: String(ready),
      checks_unknown: ev.counts.unknown,
      checks_not_checked: ev.counts.notChecked,
      units: priced ? dwellings : "",
      revenue_mode: pf?.mode ?? "",
      effective_land_cost: round(pf?.land),
      land_source: pf?.landSource ?? "",
      typical_home_sf: assumptions.typicalHomeSf,
      cap_rate_pct: assumptions.capRate,
      opex_pct: assumptions.opexPct,
      default_land_cost: assumptions.defaultLand,
      rule_citations: ruleCitations(lot, f, ruleSet),
      cost_basis: costBasis(pf),
      zone_map: lot.zoneMap ?? "",
      zone_agrees: lot.zoneAgrees == null ? "" : String(lot.zoneAgrees),
      shortfall_at_1_3x_value: round(pfPremium?.gap),
      finance_screened: String(fin.screened),
      finance_reason: fin.reason ?? "",
      site_cost_per_project: assumptions.siteCostPerProject,
    } as PlanRow;
    for (const x of ev.checks) row[EVIDENCE_COL[x.id]] = STATE_CSV[x.state];
    rows.push(row);
  }

  // Candidates first, lowest shortfall first (unassessed last), more literal passes, then larger lots.
  const gapOf = (r: PlanRow) => r.finance?.gap ?? Infinity;
  rows.sort(
    (a, b) =>
      Number(b.candidate) - Number(a.candidate) ||
      gapOf(a) - gapOf(b) ||
      (Number(b.checks_passed_of_6) - Number(a.checks_passed_of_6)) ||
      Number(b.lot_area_sf || 0) - Number(a.lot_area_sf || 0),
  );
  const n = Math.max(1, Math.floor(homesToPlan));
  const shortlist = rows.filter((r) => r.candidate).slice(0, n);
  const priced = shortlist.filter((r): r is PlanRow & { finance: RowFinance } => r.finance !== null);

  let gap: Gap | null = null;
  if (priced.length) {
    const dwellings = priced.reduce((s, r) => s + r.finance.dwellings, 0);
    const scen = (pick: (f: RowFinance) => number | null): GapScenario => {
      const total = priced.reduce((s, r) => s + (pick(r.finance) ?? 0), 0);
      return { total, perProject: total / priced.length, perDwelling: total / dwellings };
    };
    const modes = new Set(priced.map((r) => r.finance.mode));
    const basis = new Map<string, Gap["valueBasis"][number]>();
    for (const r of priced) {
      const c = comps[r.lotIndex];
      if (!c) continue;
      if (r.finance.mode === "sale" && c.zhvi != null) {
        const label = `${c.neighborhood} ZHVI`;
        if (!basis.has(label)) basis.set(label, { label, value: c.zhvi, date: c.zhviDate, mode: "sale" });
      } else if (r.finance.mode === "rent" && c.zori != null) {
        const label = `ZIP ${c.zip} ZORI`;
        if (!basis.has(label)) basis.set(label, { label, value: c.zori, date: c.zoriDate, mode: "rent" });
      }
    }
    gap = {
      n,
      projects: priced.length,
      notScreened: shortlist.length - priced.length,
      dwellings,
      hardCostPerSf: assumptions.hardCostPerSf,
      ...scen((f) => f.gap),
      atRates: HARD_COST_SCENARIOS.map(({ psf, note }) => ({ psf, note, ...scen((f) => f.gapAt[psf]) })),
      atPremium: scen((f) => f.gapPremium),
      targetValueAvg: priced.reduce((s, r) => s + r.finance.targetValue, 0) / priced.length,
      valueMode: modes.size === 1 ? [...modes][0] : "mixed",
      valueBasis: [...basis.values()],
    };
  }

  const billLine = billSentence(bill, readyByRuleSet);

  return {
    scopeLabel: scopeLabel(scope),
    typology,
    ruleSet,
    generatedAt,
    assumptions,
    funnel,
    candidates: { total: funnel.atLeast1000, byChannel, byType, districtUnconfirmed: districtOpen },
    gap,
    needsRelief,
    needsReliefWithApproval,
    hillsideReview,
    notEvaluated: funnel.records - funnel.encoded,
    billLine,
    shortlist,
    rows,
    // The district leads: every other item rests on it.
    openItems: [...open.values()].sort((a, b) => Number(b.label === DISTRICT_OPEN_ITEM.label) - Number(a.label === DISTRICT_OPEN_ITEM.label) || b.count - a.count),
    openGroups: (Object.keys(groups) as OpenGroupId[]).filter((id) => groups[id] > 0).map((id) => ({ id, label: OPEN_GROUP_LABEL[id], count: groups[id] })),
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

/** The funnel with the UI's stage names, then what each stage means (the brief defines them once). */
export function funnelLine(f: Funnel): string {
  return `${fmtNum(f.records)} lots → ${fmtNum(f.encoded)} encoded → ${fmtNum(f.byRight)} use table → ${fmtNum(f.availableNoFlag)} for sale, no flag → ${fmtNum(f.atLeast1000)} ≥ 1,000 sf → ${fmtNum(f.pencil)} clear cost screen`;
}

export const FUNNEL_STAGES =
  "Encoded: in a zoning district the rules engine encodes. Use table: lots that pass the use table and lot-size standards for at least one small home type we screened (other standards not checked). " +
  "For sale, no flag: recorded Available for Sale, not a protected-purpose record, no hazard flag at the inventory point. " +
  "≥ 1,000 sf: at least 1,000 sf, the candidates for staff review. Clear cost screen: candidates whose modeled value covers cost plus the target return.";

const VALUE_WORD: Record<Gap["valueMode"], string> = { sale: "sale value", rent: "capitalized value", mixed: "value (sale or capitalized)" };

function basisText(b: Gap["valueBasis"][number]): string {
  return b.mode === "sale" ? `${b.label} ${fmtUsdShort(b.value)}` : `${b.label} ${fmtUsd(b.value)}/mo`;
}

const plural = (n: number, one: string, many: string) => `${fmtNum(n)} ${n === 1 ? one : many}`;

/** " 8 more shortlisted candidates have no screened financial result …": what the total leaves out. */
function notScreenedLine(n: number): string {
  if (!n) return "";
  return ` ${fmtNum(n)} more shortlisted ${n === 1 ? "candidate has" : "candidates have"} no screened financial result (district or permission unresolved, or no comps) and ${n === 1 ? "is" : "are"} not in the total.`;
}

/** The mentors' framing for the hurdle card and the brief. */
export const PENCILS_FIRST =
  "Mentors' guidance: developers check whether a project pencils before pursuing a variance (T. Hardy, Sept 26, 2026).";

export interface HardCostRow {
  psf: number;
  label: string;
  s: GapScenario;
  /** The rate the plan was computed at. */
  strong: boolean;
}

/**
 * The shortfall table's rate rows, in rate order: each mentor scenario, with the plan's own rate marked
 * ("displayed" in the UI) and inserted in order when it is not one of the scenarios.
 */
export function hardCostRows(g: Gap, marker = "displayed"): HardCostRow[] {
  const rows: HardCostRow[] = g.atRates.map((r) =>
    r.psf === g.hardCostPerSf
      ? { psf: r.psf, label: `$${r.psf}/sf (${marker}; ${r.note})`, s: g, strong: true }
      : { psf: r.psf, label: `$${r.psf}/sf (${r.note})`, s: r, strong: false },
  );
  if (!rows.some((r) => r.strong)) rows.push({ psf: g.hardCostPerSf, label: `$${g.hardCostPerSf}/sf (${marker})`, s: g, strong: true });
  return rows.sort((x, y) => x.psf - y.psf);
}

export function gapSentence(plan: Plan): string {
  const g = plan.gap;
  if (!g) {
    return plan.shortlist.length
      ? `None of the ${fmtNum(plan.shortlist.length)} shortlisted candidates has a screened financial result (district or permission unresolved, or no comps), so no shortfall is totaled.`
      : "No candidate in scope has comps, so the shortfall was not modeled.";
  }
  const dwellings = g.projects === g.dwellings ? "" : ` (${plural(g.dwellings, "dwelling", "dwellings")})`;
  const who =
    g.projects === 1
      ? `The lowest-shortfall candidate is ${plural(g.projects, "project", "projects")}${dwellings}`
      : `The ${fmtNum(g.projects)} lowest-shortfall candidates are ${plural(g.projects, "project", "projects")}${dwellings}`;
  const per = g.projects === g.dwellings ? `${fmtUsdShort(g.perProject)} per project` : `${fmtUsdShort(g.perProject)} per project, ${fmtUsdShort(g.perDwelling)} per dwelling`;
  const basis = g.valueBasis.map(basisText).join(", ");
  return `${who}. Modeled shortfall about ${fmtUsdShort(g.total)} at $${g.hardCostPerSf}/sf (${per}). Target ${VALUE_WORD[g.valueMode]} ${fmtUsdShort(g.targetValueAvg)} per project, cost plus the ${plan.assumptions.targetMarginPct}% target return${basis ? `; ${basis}` : ""}.${notScreenedLine(g.notScreened)}`;
}

/** "4 pass · 1 fail · 1 not checked" from a row's count columns. */
export function rowChecks(r: PlanRow): string {
  const pass = Number(r.checks_passed_of_6);
  const unknown = Number(r.checks_unknown);
  const notChecked = Number(r.checks_not_checked);
  return summary({ counts: { pass, fail: 6 - pass - unknown - notChecked, unknown, notChecked } });
}

/** "241 lots fail only lot size; 211 of them also need a use approval (Hillside) that relief does not remove." Shared by the rail and the brief. */
export function reliefSentence(plan: Pick<Plan, "needsRelief" | "needsReliefWithApproval">): string {
  const n = plan.needsReliefWithApproval;
  return `${plural(plan.needsRelief, "lot fails", "lots fail")} only lot size; ${fmtNum(n)} of them also ${n === 1 ? "needs" : "need"} a use approval (Hillside) that relief does not remove.`;
}

const ZONING_SOURCES = "Pittsburgh Zoning Code, Title Nine, read 2026-09-26; Bill 2025-1545 substitute, corrected 2026-07-24.";

/** "City of Pittsburgh 25% or Greater Slope, 2026-09-23": the source name without its qualifiers, and its first date. */
function sourceLine(src: { name: string; url: string; vintage: string }): string {
  const name = src.name.split(/ \(|: /)[0].replace(/, class 'Vacant Land'$/, "");
  const date = src.vintage.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? src.vintage;
  return `${name}, ${date}. ${src.url}`;
}

/**
 * The short review brief (≤ 350 words): scope and assumptions, the funnel, candidates by channel, the
 * financial hurdle for N projects with the hard-cost and premium scenarios, open items grouped with counts, a pointer to
 * the CSV for per-lot detail, sources with vintages, the disclaimer. Stage definitions and the per-lot
 * list live in the CSV and README.
 */
export function toBrief(plan: Plan): string {
  const L: string[] = [];
  const date = plan.generatedAt.slice(0, 10);
  const a = plan.assumptions;
  const type = plan.typology ? TYPE_NAME[plan.typology] : "any (lowest-shortfall allowed type per lot)";
  const mode = a.mode === "sale" ? "sale" : `rent (${a.capRate}% cap rate)`;
  L.push(`# Disposition review: ${plan.scopeLabel}`, "");
  L.push(`_${date} · ${RULESET_LABEL[plan.ruleSet]} · Home type: ${type} · $${a.hardCostPerSf}/sf, ${a.softCostPct}% soft, ${a.devFeePct}% fee, ${a.targetMarginPct}% target return, ${mode} mode._`, "");
  L.push(`**Funnel.** ${funnelLine(plan.funnel)}`, "");
  const c = plan.candidates;
  const unconfirmed = c.districtUnconfirmed
    ? ` ${fmtNum(c.districtUnconfirmed)} ${c.districtUnconfirmed === 1 ? "has" : "have"} an unconfirmed district; resolve it first.`
    : "";
  L.push(
    `**Candidates for staff review: ${fmtNum(c.total)}.** ${CHANNELS.filter((x) => x !== "Other").map((x) => `${x} ${fmtNum(c.byChannel[x])}`).join(" · ")}. A review queue, not a disposition list.${unconfirmed}`,
    "",
  );
  L.push(plan.billLine, "");

  const g = plan.gap;
  L.push(`## Financial hurdle for ${g?.n ?? 0} projects`, "");
  if (!g) {
    L.push(gapSentence(plan), "");
  } else {
    const basis = g.valueBasis.map(basisText).join(", ");
    const dwellings = g.projects === g.dwellings ? "" : `, ${plural(g.dwellings, "dwelling", "dwellings")}`;
    L.push(
      `Each project needs about ${fmtUsdShort(g.targetValueAvg)} of value (cost plus the ${a.targetMarginPct}% target return) against ${basis || "the reference index"}. Shortfall for the ${plural(g.projects, "lowest-shortfall project", "lowest-shortfall projects")}${dwellings}:${notScreenedLine(g.notScreened)}`,
      "",
    );
    L.push("| Scenario | Shortfall | Per project |", "|---|---:|---:|");
    const row = (label: string, x: GapScenario) => `| ${label} | ${fmtUsd(x.total)} | ${fmtUsd(x.perProject)} |`;
    L.push(...hardCostRows(g, "assumed").map((r) => row(r.label, r.s)), row(`${NEW_CONSTRUCTION_PREMIUM}× index, $${g.hardCostPerSf}/sf`, g.atPremium), "");
    L.push(`Scenarios against an aggregate index: not a subsidy award or appraisal. ${PENCILS_FIRST}`, "");
  }

  if (plan.openGroups.length) {
    L.push(`## Open items on the ${fmtNum(c.total)} candidates`, "");
    for (const o of plan.openGroups) L.push(`- ${o.label}: ${fmtNum(o.count)}`);
    L.push("");
  }
  L.push("Per-lot detail (checks, next action, citations, cost basis) is in the CSV, one row per lot in scope.", "");

  L.push("## Sources", "");
  const seen = new Set<string>();
  for (const src of plan.sources) {
    const line = sourceLine(src);
    const key = line.split(",")[0];
    if (seen.has(key)) continue;
    seen.add(key);
    L.push(`- ${line}`);
  }
  L.push(`- ${ZONING_SOURCES} Section links per lot: CSV rule_citations.`, "");
  L.push(`_${DISCLAIMER}_`, "");
  return L.join("\n");
}
