import type { RuleSet } from "../types";

export { evaluateLot, bestVerdict, countByRight, TYPOLOGY_ORDER } from "./evaluate";
export {
  DISTRICTS,
  BILL_URL,
  UNENCODED_DISTRICT_NAME,
  TYPOLOGY_USE_ROW,
  USE_ROW_TITLE,
  lookupDistrict,
  normalizeZone,
  describeUnencoded,
} from "./districts";
export type { DistrictStandards, DistrictFamily, Subdistrict, UseEntry, UseLetter, UseRow, AduRule, Standard } from "./districts";

export const RULESET_LABEL: Record<RuleSet, string> = {
  current: "Current code (Title Nine as of 2026-09-16)",
  "bill-2025-1545": "If Bill 2025-1545 passes",
};

export const RULESET_NOTE: Record<RuleSet, string> = {
  current:
    "Title Nine as published on ecode360 (code through 2026-09-16), including Ord. 10-2025 which set one minimum lot size per density subdistrict and removed lot-area-per-unit minimums.",
  "bill-2025-1545":
    "The substitute bill (June 2, 2026, corrected July 24, 2026) allows up to two ADUs on any lot with a residential use without owner-occupancy and deletes minimum off-street parking; it does not change residential lot-size minimums or the residential use table.",
};

/** Honest limits of what is encoded. Shown in the UI and in docs/rules-sources.md. */
export const caveats: string[] = [
  "Screening only. Verdicts come from encoded tables, not from the Zoning Administrator; overlays, setbacks, height, lot coverage, steep-slope (§ 915) and riverfront/IPOD rules are not evaluated.",
  "Current-code ADU verdicts assume the lot is outside any ADU Overlay District (§ 912.08); the prototype has no overlay layer.",
  "Lot area and frontage come from the City inventory; when missing, the check is marked 'needs survey' and does not change the verdict.",
  "Frontage is used as lot width for the § 911.04.A.69A 35 ft attached-unit test in R1D; the code measures Lot Width, which can differ from street frontage.",
  "Parking minimums are reported, not checked against lot geometry.",
  "H (Hillside) single-unit uses need Administrator Exception review under § 911.04.A.69(a); those site conditions are not encoded.",
  "§ 903.03.E lists no minimum lot size for VH subdistricts; the engine treats VH as having none.",
];
