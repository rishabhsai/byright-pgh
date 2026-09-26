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

export const VERDICT_LABEL: Record<Verdict, string> = {
  "by-right": "Allowed, no hearing",
  review: "Needs staff approval",
  variance: "Needs a hearing",
  prohibited: "Not allowed here",
  unknown: "Not checked yet",
};

export type Triage = "green" | "yellow" | "red" | "gray";

export const TRIAGE_LABEL: Record<Triage, string> = {
  green: "Ready",
  yellow: "Allowed, needs subsidy or a hearing",
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
