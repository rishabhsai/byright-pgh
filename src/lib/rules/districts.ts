import type { Citation, RuleSet, Typology } from "../types";
import { BILL_PARAMS, buildRegistry, TODAY_PARAMS, USE_ROW_TITLE, BILL_URL } from "./params";

export { USE_ROW_TITLE, BILL_URL };

/**
 * Registry of encoded district standards. One row per (rule set, zoning district).
 * Every numeric standard carries the citation for the text it was read from.
 * Sources and access dates: docs/rules-sources.md; verbatim page text: docs/sources/.
 * The tables are built from RuleParams in ./params.ts (TODAY_PARAMS, BILL_PARAMS).
 */

export type DistrictFamily = "R1D" | "R1A" | "R2" | "R3" | "RM" | "LNC" | "H";
export type Subdistrict = "VL" | "L" | "M" | "H" | "VH";

/** Use-table entry per §911.01: P by right, A administrator exception, S special exception, N not listed (prohibited). */
export type UseLetter = "P" | "A" | "S" | "N";

/** §911.04.A.69A: attached units in R1D are P on lots <= 35 ft wide, otherwise S. */
export type UseEntry =
  | UseLetter
  | { kind: "P-if-width-lte"; widthFt: number; otherwise: UseLetter };

export interface Standard<T> {
  value: T;
  citation: Citation;
  /** Plain-language qualification shown next to the check. */
  note?: string;
}

/** Use-table rows the five typologies map onto. single_adu = single + the ADU rule. */
export type UseRow = "single" | "townhome" | "duplex" | "triplex";

export const TYPOLOGY_USE_ROW: Record<Typology, UseRow> = {
  single: "single",
  single_adu: "single",
  duplex: "duplex",
  triplex: "triplex",
  townhome: "townhome",
};

export interface AduRule {
  /**
   * P: ADU is a permitted accessory use on this lot. "overlay": permitted only inside an adopted ADU Overlay
   * District (§ 912.08); the prototype has no overlay layer, so applicability stays an open question.
   */
  permitted: UseLetter | "overlay";
  maxPerLot: number;
  ownerOccupancyRequired: boolean;
  maxSizeSqFt: number;
}

export interface DistrictStandards {
  zone: string;
  family: DistrictFamily;
  subdistrict: Subdistrict | null;
  name: string;
  uses: Record<UseRow, Standard<UseEntry>>;
  minLotAreaSqFt: Standard<number | null>;
  minLotAreaPerUnitSqFt: Standard<number | null>;
  minLotWidthFt: Standard<number | null>;
  /** Maximum floor area ratio; null where the prototype does not encode one. */
  maxFar: Standard<number | null>;
  parkingPerUnit: Record<UseRow, Standard<number>>;
  adu: Standard<AduRule>;
}

/** Everything the engine knows, keyed by rule set then zoning district string (e.g. "R1D-H", "LNC", "H"). */
export const DISTRICTS: Record<RuleSet, Record<string, DistrictStandards>> = {
  current: buildRegistry(TODAY_PARAMS),
  "bill-2025-1545": buildRegistry(BILL_PARAMS),
};

/** Labels for districts we deliberately did not encode, used in the `unknown` summary. */
export const UNENCODED_DISTRICT_NAME: Record<string, string> = {
  P: "Parks",
  EMI: "Educational/Medical Institution",
  RIV: "Riverfront",
  NDO: "Neighborhood Office",
  NDI: "Neighborhood Industrial",
  UNC: "Urban Neighborhood Commercial",
  HC: "Highway Commercial",
  GI: "General Industrial",
  UI: "Urban Industrial",
  UC: "Urban Center",
  GT: "Golden Triangle",
  DR: "Downtown Riverfront",
  SP: "Specially Planned",
  PUD: "Planned Unit Development",
  GPR: "Grandview Public Realm",
  UNKNOWN: "unknown",
};

export function normalizeZone(zone: string): string {
  return zone.trim().toUpperCase().replace(/\s+/g, "");
}

export function lookupDistrict(ruleSet: RuleSet, zone: string): DistrictStandards | null {
  return DISTRICTS[ruleSet][normalizeZone(zone)] ?? null;
}

export function describeUnencoded(zone: string): string {
  const z = normalizeZone(zone) || "UNKNOWN";
  const prefix = z.split("-")[0];
  const name = UNENCODED_DISTRICT_NAME[prefix];
  return name ? `${z} (${name})` : z;
}
