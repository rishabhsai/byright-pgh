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
}

export type ReviewKind = "administrator" | "special";

export interface Finding {
  typology: Typology;
  verdict: Verdict;
  checks: Check[];
  summary: string;
  /** Ids of checks that could not be verified from the data (passed === null). */
  unresolved: string[];
  /** Which exception the use needs: Administrator Exception (§ 922.08) or Special Exception (§ 922.07). */
  reviewKind: ReviewKind | null;
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
  "by-right": "Allowed, no hearing",
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
export type LabelInput = Pick<Finding, "verdict"> & Partial<Pick<Finding, "reviewKind" | "checks">>;

const failedStandards = (f: LabelInput) =>
  (f.checks ?? []).filter((c) => c.passed === false && c.id !== "use" && c.id !== "adu-eligibility");

/**
 * Plain-language label for one finding. Keeps the distinctions the verdict alone loses: administrator vs
 * special exception, FAR relief vs lot-size relief, and a use approval that remains after dimensional relief.
 */
export function verdictLabel(f: LabelInput): string {
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
  return VERDICT_SHORT_LABEL[f.verdict];
}

export type Triage = "green" | "yellow" | "red" | "gray";

export const TRIAGE_LABEL: Record<Triage, string> = {
  green: "Passes the screen",
  yellow: "Needs review, relief, data or subsidy",
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
