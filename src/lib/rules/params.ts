import type { Citation, RuleParams, RuleSet } from "../types";
import type { AduRule, DistrictFamily, DistrictStandards, Standard, Subdistrict, UseEntry, UseRow } from "./districts";

/**
 * The district standards as a function of a few zoning parameters (docs/reform.md). TODAY_PARAMS rebuilds the
 * current-code registry and BILL_PARAMS the Bill 2025-1545 registry exactly (params.test.ts checks both against
 * a snapshot taken before this file existed). Any other params are a hypothetical lever, labeled as such in the notes.
 */

export type Registry = Record<string, DistrictStandards>;

export const TODAY_PARAMS: RuleParams = {
  minLotArea: { VL: 6000, L: 3000, M: 2400, H: 1200, VH: null },
  hillsideMinLot: 3200,
  r1dAttachedWidthCap: 35,
  twoUnitInR1: false,
  threeUnitInR2: false,
  aduByRight: false,
  parkingMinimums: true,
};

/** The substitute bill changes ADUs and parking; it leaves lot sizes and the residential use table alone. */
export const BILL_PARAMS: RuleParams = { ...TODAY_PARAMS, aduByRight: true, parkingMinimums: false };

/** The code section each parameter edits, for knob labels. */
export const RULE_PARAM_SECTION: Record<keyof RuleParams, string> = {
  minLotArea: "§ 903.03.A–E.2",
  hillsideMinLot: "§ 905.02.C",
  r1dAttachedWidthCap: "§ 911.04.A.69A",
  twoUnitInR1: "§ 911.02",
  threeUnitInR2: "§ 911.02",
  aduByRight: "§ 912.08",
  parkingMinimums: "§ 914.02.A",
};

export function sameParams(a: RuleParams, b: RuleParams): boolean {
  const s = Object.keys(a.minLotArea) as Subdistrict[];
  return (
    s.every((k) => a.minLotArea[k] === b.minLotArea[k]) &&
    a.hillsideMinLot === b.hillsideMinLot &&
    a.r1dAttachedWidthCap === b.r1dAttachedWidthCap &&
    a.twoUnitInR1 === b.twoUnitInR1 &&
    a.threeUnitInR2 === b.threeUnitInR2 &&
    a.aduByRight === b.aduByRight &&
    a.parkingMinimums === b.parkingMinimums
  );
}

export const BILL_URL =
  "https://www.pittsburghpa.gov/files/assets/city/v/1/dcp/documents/planning-commission/council-hearings-or-other/2025-1545-to-be-amended-by-substitute-from-june-2-2026-corrected-july-24-2026_final.pdf";

export const USE_ROW_TITLE: Record<UseRow, string> = {
  single: "Single-Unit Detached Residential",
  townhome: "Single-Unit Attached Residential",
  duplex: "Two-Unit Residential",
  triplex: "Three-Unit Residential",
};

const cite = (ruleSet: RuleSet, section: string, title: string, url: string): Citation => ({
  section,
  title,
  url,
  ruleSet,
});

const NUM = new Intl.NumberFormat("en-US");
const sf = (n: number | null) => (n === null ? "no minimum" : `${NUM.format(n)} sq ft`);
const hypothetical = (what: string) => `Hypothetical lever, not the code: ${what}.`;

/** ecode360 anchors for §903.03 per density subdistrict (from the City zoning GIS layer). */
const SUB_903: Record<Subdistrict, { url: string; letter: string; label: string }> = {
  VL: { url: "https://ecode360.com/45474225", letter: "A", label: "Very Low-Density" },
  L: { url: "https://ecode360.com/45474231", letter: "B", label: "Low-Density" },
  M: { url: "https://ecode360.com/45474237", letter: "C", label: "Moderate Density" },
  H: { url: "https://ecode360.com/45474243", letter: "D", label: "High Density" },
  VH: { url: "https://ecode360.com/45474250", letter: "E", label: "Very-High Density" },
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

/** §911.02 Use Table, residential rows, read 2026-09-26 (table last amended Ord. 18-2026 eff. 6-11-2026), with the params applied. */
function lettersByFamily(p: RuleParams): Record<DistrictFamily, Record<UseRow, UseEntry>> {
  const r1Duplex = p.twoUnitInR1 ? "P" : "N";
  return {
    R1D: { single: "P", townhome: { kind: "P-if-width-lte", widthFt: p.r1dAttachedWidthCap, otherwise: "S" }, duplex: r1Duplex, triplex: "N" },
    R1A: { single: "P", townhome: "P", duplex: r1Duplex, triplex: "N" },
    R2: { single: "P", townhome: "P", duplex: "P", triplex: p.threeUnitInR2 ? "P" : "N" },
    R3: { single: "P", townhome: "P", duplex: "P", triplex: "P" },
    RM: { single: "P", townhome: "P", duplex: "P", triplex: "P" },
    LNC: { single: "P", townhome: "P", duplex: "P", triplex: "P" },
    H: { single: "A", townhome: "S", duplex: "N", triplex: "N" },
  };
}

function notesByFamily(p: RuleParams): Partial<Record<DistrictFamily, Partial<Record<UseRow, string>>>> {
  const cap = p.r1dAttachedWidthCap;
  const capNote =
    cap === TODAY_PARAMS.r1dAttachedWidthCap ? "" : ` ${hypothetical(`${cap} ft in place of the code's ${TODAY_PARAMS.r1dAttachedWidthCap} ft`)}`;
  const twoUnit = p.twoUnitInR1 ? hypothetical("Two-Unit Residential by right; the § 911.02 use table lists it N here") : undefined;
  return {
    R1D: {
      townhome: `§911.04.A.69A: by right on lots ${cap} ft wide or narrower; Special Exception (§922.07) on wider lots. With no width in the record the permission is unresolved, not a Special Exception.${capNote}`,
      ...(twoUnit ? { duplex: twoUnit } : {}),
    },
    ...(twoUnit ? { R1A: { duplex: twoUnit } } : {}),
    ...(p.threeUnitInR2 ? { R2: { triplex: hypothetical("Three-Unit Residential by right; the § 911.02 use table lists it N here") } } : {}),
    H: {
      single:
        "§911.04.A.69(a): Administrator Exception subject to topography, soils, vegetation, access and infrastructure conditions.",
      townhome: "§911.04.A.69(c): Special Exception, no more than four units per cluster.",
    },
  };
}

/** §914.02.A Schedule A minimums (current, last amended Ord. 4-2024 eff. 2-27-2024). */
const PARKING_CURRENT: Record<UseRow, number> = { single: 1, townhome: 0, duplex: 1, triplex: 1 };

const ADU_CURRENT: AduRule = { permitted: "overlay", maxPerLot: 1, ownerOccupancyRequired: true, maxSizeSqFt: 800 };
const ADU_BILL: AduRule = { permitted: "P", maxPerLot: 2, ownerOccupancyRequired: false, maxSizeSqFt: 1000 };

/** What one registry build shares: the params, the rule set its citations name, and the precomputed use table. */
interface Ctx {
  p: RuleParams;
  ruleSet: RuleSet;
  letters: Record<DistrictFamily, Record<UseRow, UseEntry>>;
  notes: Partial<Record<DistrictFamily, Partial<Record<UseRow, string>>>>;
}

function buildUseStandards(x: Ctx, family: DistrictFamily): Record<UseRow, Standard<UseEntry>> {
  const rows = x.letters[family];
  const out = {} as Record<UseRow, Standard<UseEntry>>;
  for (const row of Object.keys(rows) as UseRow[]) {
    out[row] = {
      value: rows[row],
      citation: cite(x.ruleSet, "§ 911.02", `Use Table — ${USE_ROW_TITLE[row]} (${family} column)`, USE_TABLE_URL),
      note: x.notes[family]?.[row],
    };
  }
  return out;
}

/** With minimums on, Schedule A as codified; off, the bill's maximum-only schedule (the only text that strikes them). */
function parkingStandards(x: Ctx): Record<UseRow, Standard<number>> {
  const out = {} as Record<UseRow, Standard<number>>;
  for (const row of Object.keys(PARKING_CURRENT) as UseRow[]) {
    out[row] = x.p.parkingMinimums
      ? {
          value: PARKING_CURRENT[row],
          citation: cite(x.ruleSet, "§ 914.02.A", `Parking Schedule A — ${USE_ROW_TITLE[row]} minimum`, PARKING_URL),
        }
      : {
          value: 0,
          citation: cite(
            x.ruleSet,
            "Bill 2025-1545 § 40 (new § 914.02.A)",
            "Schedule A minimums struck; replaced by a maximum-only parking schedule",
            BILL_URL,
          ),
          note: "The substitute bill deletes minimum off-street parking; §914.02.A becomes a maximum schedule.",
        };
  }
  return out;
}

/** ADUs by right take the bill's § 912.08 text (up to 2, no owner occupancy); otherwise the codified overlay rule. */
function aduStandard(x: Ctx): Standard<AduRule> {
  return x.p.aduByRight
    ? {
        value: ADU_BILL,
        citation: cite(
          x.ruleSet,
          "Bill 2025-1545 § 37 (§ 912.08.C.2, C.8)",
          "ADUs permitted on any lot with a Residential primary use; up to 2 per zoning lot; owner-occupancy requirement struck",
          BILL_URL,
        ),
      }
    : {
        value: ADU_CURRENT,
        citation: cite(x.ruleSet, "§ 912.08", "Accessory Dwelling Unit Overlay District (Ord. 32-2018)", ADU_URL),
        note:
          "ADUs are allowed only inside an adopted ADU Overlay District; max 1 per lot, under 800 sq ft, owner must live on site. The City's overlay map is not in our data, so whether this lot is inside one is unresolved: staff confirm.",
      };
}

function minLotNote(sub: Subdistrict, value: number | null): string | undefined {
  const today = TODAY_PARAMS.minLotArea[sub];
  if (value !== today) return hypothetical(`${sf(value)} in place of the code's ${sf(today)}`);
  return value === null ? "§903.03.E lists no Minimum Lot Size row for the Very-High Density subdistrict." : undefined;
}

function residential(x: Ctx, family: DistrictFamily, sub: Subdistrict): DistrictStandards {
  const s = SUB_903[sub];
  const minLot = x.p.minLotArea[sub];
  const section = `§ 903.03.${s.letter}.2`;
  const title = `${s.label} Subdistrict site development standards (Ord. 10-2025, eff. 5-7-2025)`;
  const c = cite(x.ruleSet, section, title, s.url);
  return {
    zone: `${family}-${sub}`,
    family,
    subdistrict: sub,
    name: `${FAMILY_NAME[family]}, ${s.label}`,
    uses: buildUseStandards(x, family),
    minLotAreaSqFt: { value: minLot, citation: c, note: minLotNote(sub, minLot) },
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
    maxFar: { value: null, citation: c },
    parkingPerUnit: parkingStandards(x),
    adu: aduStandard(x),
  };
}

function lnc(x: Ctx): DistrictStandards {
  const c = cite(x.ruleSet, "§ 904.02.C", "LNC site development standards", LNC_URL);
  return {
    zone: "LNC",
    family: "LNC",
    subdistrict: null,
    name: FAMILY_NAME.LNC,
    uses: buildUseStandards(x, "LNC"),
    minLotAreaSqFt: { value: 0, citation: c, note: "Minimum Lot Size 0 (unchanged by Bill 2025-1545 § 2)." },
    minLotAreaPerUnitSqFt: { value: null, citation: c, note: "No minimum lot area per unit in §904.02.C." },
    minLotWidthFt: { value: null, citation: c, note: "§904.02.C sets no minimum lot width." },
    maxFar: {
      value: 2,
      citation: c,
      // Captured text: docs/sources/ecode360-45474257-LNC.txt, "Maximum Floor Area Ratio 2:1".
      note: "Maximum Floor Area Ratio 2:1 in the §904.02.C LNC site development standards table.",
    },
    parkingPerUnit: parkingStandards(x),
    adu: aduStandard(x),
  };
}

function hillside(x: Ctx): DistrictStandards {
  const c = cite(x.ruleSet, "§ 905.02.C", "H, Hillside District site development standards", H_URL);
  const min = x.p.hillsideMinLot;
  const today = TODAY_PARAMS.hillsideMinLot;
  return {
    zone: "H",
    family: "H",
    subdistrict: null,
    name: FAMILY_NAME.H,
    uses: buildUseStandards(x, "H"),
    minLotAreaSqFt: { value: min, citation: c, ...(min === today ? {} : { note: hypothetical(`${sf(min)} in place of the code's ${sf(today)}`) }) },
    minLotAreaPerUnitSqFt: { value: null, citation: c, note: "No minimum lot area per unit in §905.02.C." },
    minLotWidthFt: { value: null, citation: c, note: "§905.02.C sets no minimum lot width." },
    maxFar: { value: null, citation: c },
    parkingPerUnit: parkingStandards(x),
    adu: aduStandard(x),
  };
}

const RES_FAMILIES: DistrictFamily[] = ["R1D", "R1A", "R2", "R3", "RM"];
const SUBS: Subdistrict[] = ["VL", "L", "M", "H", "VH"];

/**
 * Every encoded district's standards under `params`, keyed by zoning district string ("R1D-H", "LNC", "H").
 * Citations name `ruleSet`: by default "bill-2025-1545" when the params are exactly BILL_PARAMS, else "current"
 * (a lever is an edit of today's code). evaluateLot marks checks from any registry other than the prebuilt one
 * with `citationScenario: "custom"`.
 */
export function buildRegistry(params: RuleParams, ruleSet: RuleSet = sameParams(params, BILL_PARAMS) ? "bill-2025-1545" : "current"): Registry {
  const x: Ctx = { p: params, ruleSet, letters: lettersByFamily(params), notes: notesByFamily(params) };
  const table: Registry = {};
  for (const fam of RES_FAMILIES) for (const sub of SUBS) table[`${fam}-${sub}`] = residential(x, fam, sub);
  table.LNC = lnc(x);
  table.H = hillside(x);
  return table;
}
