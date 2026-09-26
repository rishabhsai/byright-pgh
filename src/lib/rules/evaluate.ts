import type { Check, Finding, Lot, ReviewKind, RuleSet, Typology, Verdict } from "../types";
import { TYPOLOGY_LABEL } from "../types";
import { buildingSf } from "../proforma";
import {
  describeUnencoded,
  lookupDistrict,
  TYPOLOGY_USE_ROW,
  USE_ROW_TITLE,
  type DistrictStandards,
  type UseEntry,
  type UseLetter,
} from "./districts";

export const TYPOLOGY_ORDER: Typology[] = ["single", "single_adu", "duplex", "triplex", "townhome"];

const UNITS: Record<Typology, number> = { single: 1, single_adu: 2, duplex: 2, triplex: 3, townhome: 1 };

const USE_LETTER_LABEL: Record<UseLetter, string> = {
  P: "Permitted by right",
  A: "Administrator Exception (staff review, § 922.08)",
  S: "Special Exception (ZBA hearing, § 922.07)",
  N: "Not listed in the use table (prohibited)",
};

const NEEDS_SURVEY = "needs survey";

export const NONCONFORMING_LOT_URL = "https://ecode360.com/45478977";

/** A failed lot-size standard does not by itself fix the approval path. */
export const LOT_RELIEF =
  "Relief required: a dimensional variance, or the nonconforming-lot exception under § 921.04 if the lot qualifies; zoning staff determine the path.";

const LOT_RELIEF_NOTE = `${LOT_RELIEF} (§ 921.04, ${NONCONFORMING_LOT_URL})`;

const REVIEW_KIND: Partial<Record<UseLetter, ReviewKind>> = { A: "administrator", S: "special" };

const NUM = new Intl.NumberFormat("en-US");
const fmt = (n: number) => NUM.format(n);

/** Resolve a conditional use entry against the lot. Unknown width falls back to the stricter letter. */
function resolveUse(entry: UseEntry, lot: Lot): { letter: UseLetter; note?: string } {
  if (typeof entry === "string") return { letter: entry };
  if (lot.frontageFt === null) {
    return {
      letter: entry.otherwise,
      note: `Frontage not in inventory (${NEEDS_SURVEY}); by right only if lot width is ${entry.widthFt} ft or less.`,
    };
  }
  return lot.frontageFt <= entry.widthFt
    ? { letter: "P", note: `Lot width ${fmt(lot.frontageFt)} ft is within the ${entry.widthFt} ft by-right threshold.` }
    : { letter: entry.otherwise, note: `Lot width ${fmt(lot.frontageFt)} ft exceeds the ${entry.widthFt} ft by-right threshold.` };
}

function permittedUseCheck(d: DistrictStandards, typology: Typology, lot: Lot): { check: Check; letter: UseLetter } {
  const row = TYPOLOGY_USE_ROW[typology];
  const std = d.uses[row];
  const resolved = resolveUse(std.value, lot);
  let letter = resolved.letter;
  let notes = [std.note, resolved.note].filter(Boolean) as string[];

  // single_adu: the ADU is an accessory use gated by §912.08, on top of the primary single-unit use.
  if (typology === "single_adu") {
    const adu = d.adu.value;
    const aduNote = d.adu.note ?? `ADU permitted as accessory to a residential use, up to ${adu.maxPerLot} per lot.`;
    if (adu.permitted === "N" && letter !== "N") {
      letter = "N";
      notes = [aduNote]; // the ADU rule is the blocker; the primary-use note would only confuse
    } else {
      notes.push(aduNote);
    }
  }

  const check: Check = {
    id: "use",
    label: `Use permitted: ${USE_ROW_TITLE[row]}${typology === "single_adu" ? " + ADU" : ""}`,
    passed: letter === "P" ? true : letter === "N" ? false : null,
    measured: USE_LETTER_LABEL[letter],
    required: "P (permitted by right)",
    citation: typology === "single_adu" && d.adu.value.permitted === "N" ? d.adu.citation : std.citation,
    note: notes.length ? notes.join(" ") : undefined,
  };
  return { check, letter };
}

function numericCheck(
  id: string,
  label: string,
  measured: number | null,
  measuredUnit: string,
  required: number | null,
  requiredNote: string | undefined,
  citation: Check["citation"],
  missingLabel: string,
): Check {
  if (required === null || required === 0) {
    return {
      id,
      label,
      passed: true,
      measured: measured === null ? null : `${fmt(measured)} ${measuredUnit}`,
      required: required === 0 ? `0 ${measuredUnit}` : "none",
      citation,
      note: requiredNote,
    };
  }
  if (measured === null) {
    return {
      id,
      label: `${label} (${NEEDS_SURVEY})`,
      passed: null,
      measured: null,
      required: `${fmt(required)} ${measuredUnit}`,
      citation,
      note: `${missingLabel} is not in the City inventory; ${NEEDS_SURVEY}.`,
    };
  }
  const passed = measured >= required;
  return {
    id,
    label,
    passed,
    measured: `${fmt(measured)} ${measuredUnit}`,
    required: `${fmt(required)} ${measuredUnit}`,
    citation,
    note: passed ? requiredNote : [requiredNote, LOT_RELIEF_NOTE].filter(Boolean).join(" "),
  };
}

function capacityCheck(d: DistrictStandards, typology: Typology, lot: Lot): Check {
  const far = d.maxFar.value;
  const proposed = buildingSf(typology);
  if (far === null) {
    return {
      id: "building-fit",
      label: "Building fit (setbacks, height, coverage): not evaluated",
      passed: null,
      measured: `${fmt(proposed)} sq ft proposed`,
      required: null,
      citation: d.minLotAreaSqFt.citation,
      note: "Setbacks, height and lot coverage are not encoded; whether the building fits needs a site plan.",
    };
  }
  if (lot.lotAreaSqFt === null) {
    return {
      id: "far",
      label: `Floor area ratio (${NEEDS_SURVEY})`,
      passed: null,
      measured: `${fmt(proposed)} sq ft proposed`,
      required: `${far}:1 floor area ratio`,
      citation: d.maxFar.citation,
      note: `Lot area is not in the City inventory; ${NEEDS_SURVEY}. ${d.maxFar.note ?? ""}`.trim(),
    };
  }
  const max = Math.floor(far * lot.lotAreaSqFt);
  const passed = proposed <= max;
  return {
    id: "far",
    label: "Floor area ratio",
    passed,
    measured: `${fmt(proposed)} sq ft proposed`,
    required: `at most ${fmt(max)} sq ft (${far}:1 × ${fmt(lot.lotAreaSqFt)} sq ft lot)`,
    citation: d.maxFar.citation,
    note: passed
      ? d.maxFar.note
      : `${d.maxFar.note ?? ""} Relief required: build no more than ${fmt(max)} sq ft, or seek a dimensional variance; zoning staff determine the path.`.trim(),
  };
}

function dimensionalChecks(d: DistrictStandards, typology: Typology, lot: Lot): Check[] {
  const units = UNITS[typology];
  const perUnit = d.minLotAreaPerUnitSqFt.value;
  return [
    numericCheck(
      "lot-area",
      "Minimum lot size",
      lot.lotAreaSqFt,
      "sq ft",
      d.minLotAreaSqFt.value,
      d.minLotAreaSqFt.note,
      d.minLotAreaSqFt.citation,
      "Lot area",
    ),
    numericCheck(
      "lot-width",
      "Minimum lot width",
      lot.frontageFt,
      "ft",
      d.minLotWidthFt.value,
      d.minLotWidthFt.note,
      d.minLotWidthFt.citation,
      "Frontage",
    ),
    numericCheck(
      "lot-area-per-unit",
      `Minimum lot area per unit (${units} unit${units > 1 ? "s" : ""})`,
      lot.lotAreaSqFt,
      "sq ft",
      perUnit === null ? null : perUnit * units,
      d.minLotAreaPerUnitSqFt.note,
      d.minLotAreaPerUnitSqFt.citation,
      "Lot area",
    ),
  ];
}

function parkingCheck(d: DistrictStandards, typology: Typology): Check {
  const row = TYPOLOGY_USE_ROW[typology];
  const std = d.parkingPerUnit[row];
  const primaryUnits = typology === "single_adu" ? 1 : UNITS[typology];
  const spaces = std.value * primaryUnits;
  const aduNote =
    typology === "single_adu" && std.value > 0 ? " ADU itself is exempt from on-site parking (§ 912.08.E.9)." : "";
  return {
    id: "parking",
    label: "Minimum off-street parking",
    passed: spaces === 0 ? true : null,
    measured: null,
    required: `${spaces} space${spaces === 1 ? "" : "s"} (${std.value} per unit)`,
    citation: std.citation,
    note: (spaces === 0 ? "No minimum parking required." : "On a vacant lot this is a site-plan question: the spaces must fit on the lot, which inventory data cannot show.") + (std.note ? ` ${std.note}` : "") + aduNote,
  };
}

function aduCheck(d: DistrictStandards): Check {
  const adu = d.adu.value;
  return {
    id: "adu-eligibility",
    label: "Accessory dwelling unit eligibility",
    passed: adu.permitted === "P" ? true : false,
    measured: adu.permitted === "P" ? "Permitted accessory use" : "Only inside an ADU Overlay District (none assumed)",
    required: `Up to ${adu.maxPerLot} ADU per lot, max ${fmt(adu.maxSizeSqFt)} sq ft, owner-occupancy ${adu.ownerOccupancyRequired ? "required" : "not required"}`,
    citation: d.adu.citation,
    note: d.adu.note,
  };
}

function verdictFor(letter: UseLetter, checks: Check[]): Verdict {
  if (letter === "N") return "prohibited";
  const dimensional = checks.filter((c) => c.id !== "use" && c.id !== "adu-eligibility");
  const failed = dimensional.some((c) => c.passed === false);
  if (failed) return "variance";
  return letter === "P" ? "by-right" : "review";
}

function summarize(d: DistrictStandards, typology: Typology, verdict: Verdict, letter: UseLetter, checks: Check[]): string {
  const name = TYPOLOGY_LABEL[typology];
  const zone = d.zone;
  const survey = checks.filter((c) => c.passed === null && c.label.includes(NEEDS_SURVEY)).map((c) => c.label.replace(` (${NEEDS_SURVEY})`, "").toLowerCase());
  const surveyNote = survey.length ? ` Not verifiable from inventory data: ${survey.join(", ")} (${NEEDS_SURVEY}).` : "";
  const failed = checks.filter((c) => c.passed === false && c.id !== "use");
  const use = checks.find((c) => c.id === "use");
  switch (verdict) {
    case "prohibited":
      return `${name} is not allowed in ${zone}: ${use?.note ?? "not listed in the § 911.02 use table for this district"}`.replace(/\.?$/, ".");
    case "variance": {
      const lotFailed = failed.some((c) => c.id !== "far");
      const relief = lotFailed
        ? LOT_RELIEF
        : "Relief required: a smaller building, or a dimensional variance; zoning staff determine the path.";
      return `${name} is ${letter === "P" ? "a permitted use" : `allowed only through ${USE_LETTER_LABEL[letter]}`} in ${zone}, but ${failed
        .map((c) => `${c.label.toLowerCase()} fails (${c.measured} vs ${c.required} required, ${c.citation.section})`)
        .join("; ")}. ${relief}${surveyNote}`;
    }
    case "review":
      return `${name} in ${zone} is allowed only through ${USE_LETTER_LABEL[letter]}; the lot standards encoded here are met.${use?.note ? ` ${use.note}` : ""}${surveyNote}`;
    case "by-right":
      return `${name} is permitted by right in ${zone} and meets the encoded lot standards; building fit (setbacks, height, coverage) is not established.${surveyNote}`;
    default:
      return `${name}: not evaluated.`;
  }
}

function evaluateTypology(d: DistrictStandards, typology: Typology, lot: Lot): Finding {
  const { check: use, letter } = permittedUseCheck(d, typology, lot);
  const checks: Check[] = [use, ...dimensionalChecks(d, typology, lot), capacityCheck(d, typology, lot), parkingCheck(d, typology)];
  if (typology === "single_adu") checks.push(aduCheck(d));
  const verdict = verdictFor(letter, checks);
  return {
    typology,
    verdict,
    checks,
    summary: summarize(d, typology, verdict, letter, checks),
    unresolved: checks.filter((c) => c.passed === null).map((c) => c.id),
    reviewKind: verdict === "review" || verdict === "variance" ? (REVIEW_KIND[letter] ?? null) : null,
  };
}

export function evaluateLot(lot: Lot, ruleSet: RuleSet): Finding[] {
  const d = lookupDistrict(ruleSet, lot.zone);
  if (!d) {
    const summary = `District ${describeUnencoded(lot.zone)} is not encoded in this prototype; only R1D, R1A, R2, R3, RM, LNC and H are evaluated.`;
    return TYPOLOGY_ORDER.map((typology) => ({ typology, verdict: "unknown", checks: [], summary, unresolved: [], reviewKind: null }));
  }
  return TYPOLOGY_ORDER.map((typology) => evaluateTypology(d, typology, lot));
}

/** Most permissive first. */
const VERDICT_RANK: Record<Verdict, number> = { "by-right": 0, review: 1, variance: 2, prohibited: 3, unknown: 4 };

export function bestVerdict(findings: Finding[]): Verdict {
  if (findings.length === 0) return "unknown";
  return findings.reduce<Verdict>((best, f) => (VERDICT_RANK[f.verdict] < VERDICT_RANK[best] ? f.verdict : best), "unknown");
}

export function countByRight(findings: Finding[]): number {
  return findings.filter((f) => f.verdict === "by-right").length;
}
