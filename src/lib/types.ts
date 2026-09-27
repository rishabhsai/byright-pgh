export type RuleSet = "current" | "bill-2025-1545";

export type Typology = "single" | "single_adu" | "duplex" | "triplex" | "townhome";

export type Verdict = "by-right" | "review" | "variance" | "prohibited" | "unknown";

export interface Lot {
  id: string;
  address: string;
  neighborhood: string;
  councilDistrict: string;
  ward: string;
  lat: number;
  lon: number;
  zone: string;
  /**
   * District of the City zoning map polygon under the inventory point (`zon_new`), from pipeline/build.py.
   * null when no polygon contains the point. Optional only so hand-built fixtures stay valid; lots.json always has it.
   */
  zoneMap?: string | null;
  /** `zone` equals `zoneMap`; null when either is missing (inventory zone blank, or no map polygon). */
  zoneAgrees?: boolean | null;
  lotAreaSqFt: number | null;
  frontageFt: number | null;
  landValue: number | null;
  status: string;
  inventoryType: string;
  hazards: {
    steepSlope: boolean;
    undermined: boolean;
    floodZone: boolean | null;
  };
}

export interface LotsFile {
  generatedAt: string;
  sources: { name: string; url: string; vintage: string }[];
  lots: Lot[];
}

export interface Citation {
  section: string;
  title: string;
  url: string;
  ruleSet: RuleSet;
}

export interface Check {
  id: string;
  label: string;
  passed: boolean | null;
  measured: string | null;
  required: string | null;
  citation: Citation;
  note?: string;
  /**
   * "custom" when the check came from a registry built from hypothetical RuleParams (a reform lever) rather than
   * the prebuilt registry for `citation.ruleSet`: same section, but not the text of that rule set. Absent otherwise.
   */
  citationScenario?: "custom";
}

export type ReviewKind = "administrator" | "special";

/**
 * A permission that hinges on a fact the data does not hold: the R1D attached-unit width test with no
 * frontage in the record, or ADU Overlay District applicability with no overlay layer. The use stays
 * unresolved (never a definite exception route or prohibition) until someone answers the question.
 */
export interface PermissionQuestion {
  kind: "lot-width" | "adu-overlay";
  /** "P if lot width ≤ 35 ft, else S; width not in the record". */
  question: string;
  /** The open item and next action: "Resolve permission: confirm lot width (§ 911.04.A.69A)". */
  action: string;
  citation: Citation;
}

export interface Finding {
  typology: Typology;
  verdict: Verdict;
  checks: Check[];
  summary: string;
  /** Ids of checks that could not be verified from the data (passed === null). */
  unresolved: string[];
  /** Which exception the use needs: Administrator Exception (§ 922.08) or Special Exception (§ 922.07). */
  reviewKind: ReviewKind | null;
  /** Set when the use permission turns on a fact the data lacks; the verdict is then `unknown` (or `variance` if a lot standard fails). */
  permissionQuestion?: PermissionQuestion | null;
}

export const TYPOLOGY_LABEL: Record<Typology, string> = {
  single: "House",
  single_adu: "House + backyard unit",
  duplex: "Duplex",
  triplex: "Triplex",
  townhome: "Townhouse",
};

/** Generic label per verdict. UI copy should go through verdictLabel(finding), which keeps the approval route. */
export const VERDICT_LABEL: Record<Verdict, string> = {
  "by-right": "Allowed by the use table and lot-size standards; other standards not checked",
  review: "Needs approval",
  variance: "Relief needed (variance or § 921.04 exception)",
  prohibited: "Not allowed here",
  unknown: "Not checked yet",
};

/** Short chip label per verdict; verdictShort(finding) refines review by route. */
export const VERDICT_SHORT_LABEL: Record<Verdict, string> = {
  "by-right": "Allowed",
  review: "Needs approval",
  variance: "Relief needed",
  prohibited: "Not allowed",
  unknown: "Not checked",
};

export const REVIEW_KIND_LABEL: Record<ReviewKind, string> = {
  administrator: "Staff approval (administrator exception)",
  special: "Board approval (special exception)",
};

const REVIEW_KIND_SHORT: Record<ReviewKind, string> = { administrator: "Staff approval", special: "Board approval" };

/** What verdictLabel reads: the verdict, the approval route, and (for relief) which checks failed. Slim findings work. */
export type LabelInput = Pick<Finding, "verdict"> & Partial<Pick<Finding, "reviewKind" | "checks" | "permissionQuestion">>;

const PERMISSION_LABEL: Record<PermissionQuestion["kind"], string> = {
  "lot-width": "Permission unresolved (lot width not in the record)",
  "adu-overlay": "Permission unresolved (ADU overlay not in our data)",
};

const failedStandards = (f: LabelInput) =>
  (f.checks ?? []).filter((c) => c.passed === false && c.id !== "use" && c.id !== "adu-eligibility");

/**
 * Plain-language label for one finding. Keeps the distinctions the verdict alone loses: administrator vs
 * special exception, FAR relief vs lot-size relief, and a use approval that remains after dimensional relief.
 */
export function verdictLabel(f: LabelInput): string {
  if (f.verdict === "unknown" && f.permissionQuestion) return PERMISSION_LABEL[f.permissionQuestion.kind];
  if (f.verdict === "review") return f.reviewKind ? REVIEW_KIND_LABEL[f.reviewKind] : VERDICT_LABEL.review;
  if (f.verdict === "variance") {
    const failed = failedStandards(f);
    const base = failed.length > 0 && failed.every((c) => c.id === "far") ? "Relief needed (smaller building or variance)" : VERDICT_LABEL.variance;
    if (!f.reviewKind) return base;
    const route = REVIEW_KIND_LABEL[f.reviewKind];
    return `${base} + ${route.charAt(0).toLowerCase()}${route.slice(1)}`;
  }
  return VERDICT_LABEL[f.verdict];
}

/** Chip-length label: "Staff approval", "Board approval", "Relief needed", "Allowed". */
export function verdictShort(f: LabelInput): string {
  if (f.verdict === "review" && f.reviewKind) return REVIEW_KIND_SHORT[f.reviewKind];
  if (f.verdict === "unknown" && f.permissionQuestion) return "Unresolved";
  return VERDICT_SHORT_LABEL[f.verdict];
}

export type Triage = "green" | "yellow" | "red" | "gray";

export const TRIAGE_LABEL: Record<Triage, string> = {
  green: "Passes the screen",
  yellow: "Needs review, relief, data or a shortfall",
  red: "Blocked",
  gray: "Not checked",
};

export interface Comps {
  neighborhood: string;
  zip: string | null;
  zhvi: number | null;
  zhviDate: string | null;
  zori: number | null;
  zoriDate: string | null;
}

export interface CompsFile {
  generatedAt: string;
  sources: { name: string; url: string; vintage: string }[];
  byNeighborhood: Record<string, { zhvi: number | null; zhviDate: string | null }>;
  byZip: Record<string, { zori: number | null; zoriDate: string | null }>;
  lotZip: Record<string, string>;
}

export interface TriageResult {
  triage: Triage;
  reasons: string[];
  bestTypology: Typology | null;
  pencils: boolean | null;
  gap: number | null;
  /** Dollar margin of the best home type's pro forma, or null when finance was not assessed. */
  margin: number | null;
}

/**
 * Reform levers: the zoning parameters `buildRegistry` (src/lib/rules/params.ts) turns into district standards.
 * TODAY_PARAMS reproduces the current code; BILL_PARAMS reproduces Bill 2025-1545. Any other value is a
 * hypothetical parameter change, not a proposal. See docs/reform.md.
 */
export interface RuleParams {
  /** § 903.03.{A–E}.2 minimum lot size per density subdistrict, sq ft; null = none. Today 6000/3000/2400/1200/null. */
  minLotArea: { VL: number | null; L: number | null; M: number | null; H: number | null; VH: number | null };
  /** § 905.02.C Hillside minimum lot size, sq ft. Today 3200. */
  hillsideMinLot: number;
  /** § 911.04.A.69A: R1D attached units are by right on lots at or under this width, else Special Exception. Today 35. */
  r1dAttachedWidthCap: number;
  /** § 911.02: Two-Unit Residential by right in R1D and R1A. Today false (N). */
  twoUnitInR1: boolean;
  /** § 911.02: Three-Unit Residential by right in R2. Today false (N). */
  threeUnitInR2: boolean;
  /** § 912.08: ADUs by right on any residential lot (the bill's ADU text: up to 2, no owner occupancy). Today false (overlay only). */
  aduByRight: boolean;
  /** § 914.02.A Schedule A parking minimums. Today true; the bill strikes them. */
  parkingMinimums: boolean;
}

export interface RulePreset {
  id: string;
  label: string;
  params: RuleParams;
  note: string;
  citation?: Citation;
}

/** One lever's effect on the public-lot screen (the 11,338 City inventory records), aggregates only. */
export interface LeverResult {
  presetId: string;
  label: string;
  /** Lots with at least one small home type allowed by the use table and lot-size standards (and LNC FAR). */
  publicLotsAllowed: number;
  /** Lots allowed under the params that are not allowed today. */
  publicLotsNewlyAllowed: number;
  /** Lots allowed today that are not allowed under the params (only a stricter custom knob can make this nonzero). */
  publicLotsNoLongerAllowed: number;
  /** Candidates for staff review: allowed, recorded Available for Sale, disposition-eligible, no hazard flag, ≥ 1,000 sf. */
  candidates: number;
  candidatesNewly: number;
  /** Candidates whose selected proposal clears the cost-and-return screen (same finance gate as triage). */
  clearingCostScreen: number;
  /** Candidates whose selected proposal carries a required parking count the data cannot verify. */
  parkingUnresolved: number;
  /** Per home type: lots where that type is allowed under the params minus lots where it is allowed today. */
  typologyDelta: Record<Typology, number>;
  /** Top 10 neighborhoods by newlyAllowed (then allowed, then name). */
  byNeighborhood: { name: string; allowed: number; newlyAllowed: number }[];
  /** Encoded district families in code order: R1D, R1A, R2, R3, RM, LNC, H. */
  byDistrictFamily: { family: string; allowed: number; newlyAllowed: number }[];
}
