import type { Citation, RuleSet, Typology } from "../types";

/**
 * Registry of encoded district standards. One row per (rule set, zoning district).
 * Every numeric standard carries the citation for the text it was read from.
 * Sources and access dates: docs/rules-sources.md; verbatim page text: docs/sources/.
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

export const USE_ROW_TITLE: Record<UseRow, string> = {
  single: "Single-Unit Detached Residential",
  townhome: "Single-Unit Attached Residential",
  duplex: "Two-Unit Residential",
  triplex: "Three-Unit Residential",
};

export interface AduRule {
  /** P: ADU is a permitted accessory use on this lot; N: only inside an ADU overlay district (none in the data). */
  permitted: UseLetter;
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
  parkingPerUnit: Record<UseRow, Standard<number>>;
  adu: Standard<AduRule>;
}

export const BILL_URL =
  "https://www.pittsburghpa.gov/files/assets/city/v/1/dcp/documents/planning-commission/council-hearings-or-other/2025-1545-to-be-amended-by-substitute-from-june-2-2026-corrected-july-24-2026_final.pdf";

const cite = (ruleSet: RuleSet, section: string, title: string, url: string): Citation => ({
  section,
  title,
  url,
  ruleSet,
});

/** ecode360 anchors for §903.03 per density subdistrict (from the City zoning GIS layer). */
const SUB_903: Record<Subdistrict, { url: string; letter: string; label: string; minLot: number | null }> = {
  VL: { url: "https://ecode360.com/45474225", letter: "A", label: "Very Low-Density", minLot: 6000 },
  L: { url: "https://ecode360.com/45474231", letter: "B", label: "Low-Density", minLot: 3000 },
  M: { url: "https://ecode360.com/45474237", letter: "C", label: "Moderate Density", minLot: 2400 },
  H: { url: "https://ecode360.com/45474243", letter: "D", label: "High Density", minLot: 1200 },
  VH: { url: "https://ecode360.com/45474250", letter: "E", label: "Very-High Density", minLot: null },
};

const USE_TABLE_URL = "https://ecode360.com/45476524";
const ADU_URL = "https://ecode360.com/45477814";
const PARKING_URL = "https://ecode360.com/45478031";
const LNC_URL = "https://ecode360.com/45474257#45474277";
const H_URL = "https://ecode360.com/45474542#45474559";

const FAMILY_NAME: Record<DistrictFamily, string> = {
  R1D: "Single-Unit Detached Residential",
  R1A: "Single-Unit Attached Residential",
  R2: "Two-Unit Residential",
  R3: "Three-Unit Residential",
  RM: "Multi-Unit Residential",
  LNC: "Local Neighborhood Commercial",
  H: "Hillside",
};

/** §911.02 Use Table, residential rows, read 2026-09-26 (table last amended Ord. 18-2026 eff. 6-11-2026). */
const USE_LETTERS: Record<DistrictFamily, Record<UseRow, UseEntry>> = {
  R1D: { single: "P", townhome: { kind: "P-if-width-lte", widthFt: 35, otherwise: "S" }, duplex: "N", triplex: "N" },
  R1A: { single: "P", townhome: "P", duplex: "N", triplex: "N" },
  R2: { single: "P", townhome: "P", duplex: "P", triplex: "N" },
  R3: { single: "P", townhome: "P", duplex: "P", triplex: "P" },
  RM: { single: "P", townhome: "P", duplex: "P", triplex: "P" },
  LNC: { single: "P", townhome: "P", duplex: "P", triplex: "P" },
  H: { single: "A", townhome: "S", duplex: "N", triplex: "N" },
};

const USE_NOTE: Partial<Record<DistrictFamily, Partial<Record<UseRow, string>>>> = {
  R1D: {
    townhome:
      "§911.04.A.69A: by right on lots 35 ft wide or narrower; Special Exception (§922.07) on wider lots.",
  },
  H: {
    single:
      "§911.04.A.69(a): Administrator Exception subject to topography, soils, vegetation, access and infrastructure conditions.",
    townhome: "§911.04.A.69(c): Special Exception, no more than four units per cluster.",
  },
};

/** §914.02.A Schedule A minimums (current, last amended Ord. 4-2024 eff. 2-27-2024). */
const PARKING_CURRENT: Record<UseRow, number> = { single: 1, townhome: 0, duplex: 1, triplex: 1 };

const ADU_CURRENT: AduRule = { permitted: "N", maxPerLot: 1, ownerOccupancyRequired: true, maxSizeSqFt: 800 };
const ADU_BILL: AduRule = { permitted: "P", maxPerLot: 2, ownerOccupancyRequired: false, maxSizeSqFt: 1000 };

function useStandards(ruleSet: RuleSet, family: DistrictFamily): Record<UseRow, Standard<UseEntry>> {
  const rows = USE_LETTERS[family];
  const out = {} as Record<UseRow, Standard<UseEntry>>;
  for (const row of Object.keys(rows) as UseRow[]) {
    out[row] = {
      value: rows[row],
      citation: cite(ruleSet, "§ 911.02", `Use Table — ${USE_ROW_TITLE[row]} (${family} column)`, USE_TABLE_URL),
      note: USE_NOTE[family]?.[row],
    };
  }
  return out;
}

function parkingStandards(ruleSet: RuleSet): Record<UseRow, Standard<number>> {
  const out = {} as Record<UseRow, Standard<number>>;
  for (const row of Object.keys(PARKING_CURRENT) as UseRow[]) {
    out[row] =
      ruleSet === "current"
        ? {
            value: PARKING_CURRENT[row],
            citation: cite("current", "§ 914.02.A", `Parking Schedule A — ${USE_ROW_TITLE[row]} minimum`, PARKING_URL),
          }
        : {
            value: 0,
            citation: cite(
              "bill-2025-1545",
              "Bill 2025-1545 § 40 (new § 914.02.A)",
              "Schedule A minimums struck; replaced by a maximum-only parking schedule",
              BILL_URL,
            ),
            note: "The substitute bill deletes minimum off-street parking; §914.02.A becomes a maximum schedule.",
          };
  }
  return out;
}

function aduStandard(ruleSet: RuleSet): Standard<AduRule> {
  return ruleSet === "current"
    ? {
        value: ADU_CURRENT,
        citation: cite("current", "§ 912.08", "Accessory Dwelling Unit Overlay District (Ord. 32-2018)", ADU_URL),
        note:
          "ADUs are allowed only inside an adopted ADU Overlay District; max 1 per lot, under 800 sq ft, owner must live on site. This prototype has no overlay layer and assumes the lot is outside one.",
      }
    : {
        value: ADU_BILL,
        citation: cite(
          "bill-2025-1545",
          "Bill 2025-1545 § 37 (§ 912.08.C.2, C.8)",
          "ADUs permitted on any lot with a Residential primary use; up to 2 per zoning lot; owner-occupancy requirement struck",
          BILL_URL,
        ),
      };
}

function residential(ruleSet: RuleSet, family: DistrictFamily, sub: Subdistrict): DistrictStandards {
  const s = SUB_903[sub];
  const section = `§ 903.03.${s.letter}.2`;
  const title = `${s.label} Subdistrict site development standards (Ord. 10-2025, eff. 5-7-2025)`;
  const c = cite(ruleSet, section, title, s.url);
  return {
    zone: `${family}-${sub}`,
    family,
    subdistrict: sub,
    name: `${FAMILY_NAME[family]}, ${s.label}`,
    uses: useStandards(ruleSet, family),
    minLotAreaSqFt: {
      value: s.minLot,
      citation: c,
      note: s.minLot === null ? "§903.03.E lists no Minimum Lot Size row for the Very-High Density subdistrict." : undefined,
    },
    minLotAreaPerUnitSqFt: {
      value: null,
      citation: c,
      note: "No minimum lot area per unit: eliminated from §903.03 by Ord. 10-2025.",
    },
    minLotWidthFt: {
      value: null,
      citation: c,
      note: "§903.03 sets no minimum lot width.",
    },
    parkingPerUnit: parkingStandards(ruleSet),
    adu: aduStandard(ruleSet),
  };
}

function lnc(ruleSet: RuleSet): DistrictStandards {
  const c = cite(ruleSet, "§ 904.02.C", "LNC site development standards", LNC_URL);
  return {
    zone: "LNC",
    family: "LNC",
    subdistrict: null,
    name: FAMILY_NAME.LNC,
    uses: useStandards(ruleSet, "LNC"),
    minLotAreaSqFt: { value: 0, citation: c, note: "Minimum Lot Size 0 (unchanged by Bill 2025-1545 § 2)." },
    minLotAreaPerUnitSqFt: { value: null, citation: c, note: "No minimum lot area per unit in §904.02.C." },
    minLotWidthFt: { value: null, citation: c, note: "§904.02.C sets no minimum lot width." },
    parkingPerUnit: parkingStandards(ruleSet),
    adu: aduStandard(ruleSet),
  };
}

function hillside(ruleSet: RuleSet): DistrictStandards {
  const c = cite(ruleSet, "§ 905.02.C", "H, Hillside District site development standards", H_URL);
  return {
    zone: "H",
    family: "H",
    subdistrict: null,
    name: FAMILY_NAME.H,
    uses: useStandards(ruleSet, "H"),
    minLotAreaSqFt: { value: 3200, citation: c },
    minLotAreaPerUnitSqFt: { value: null, citation: c, note: "No minimum lot area per unit in §905.02.C." },
    minLotWidthFt: { value: null, citation: c, note: "§905.02.C sets no minimum lot width." },
    parkingPerUnit: parkingStandards(ruleSet),
    adu: aduStandard(ruleSet),
  };
}

const RES_FAMILIES: DistrictFamily[] = ["R1D", "R1A", "R2", "R3", "RM"];
const SUBS: Subdistrict[] = ["VL", "L", "M", "H", "VH"];

function buildRegistry(ruleSet: RuleSet): Record<string, DistrictStandards> {
  const table: Record<string, DistrictStandards> = {};
  for (const fam of RES_FAMILIES) for (const sub of SUBS) table[`${fam}-${sub}`] = residential(ruleSet, fam, sub);
  table.LNC = lnc(ruleSet);
  table.H = hillside(ruleSet);
  return table;
}

/** Everything the engine knows, keyed by rule set then zoning district string (e.g. "R1D-H", "LNC", "H"). */
export const DISTRICTS: Record<RuleSet, Record<string, DistrictStandards>> = {
  current: buildRegistry("current"),
  "bill-2025-1545": buildRegistry("bill-2025-1545"),
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
