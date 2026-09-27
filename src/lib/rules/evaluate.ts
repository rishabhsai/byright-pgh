import type { Check, Finding, Lot, PermissionQuestion, ReviewKind, RuleSet, Typology, Verdict } from "../types";
import { TYPOLOGY_LABEL } from "../types";
import { buildingSf } from "../proforma";
import type { Registry } from "./params";
import {
  describeUnencoded,
  DISTRICTS,
  normalizeZone,
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
const LOT_AREA_MISSING = "Lot area is not in the City inventory";

export const NONCONFORMING_LOT_URL = "https://ecode360.com/45478977";

/** A failed lot-size standard does not by itself fix the approval path. */
export const LOT_RELIEF =
  "Relief required: a dimensional variance, or the nonconforming-lot exception under § 921.04 if the lot qualifies; zoning staff determine the path.";

const LOT_RELIEF_NOTE = `${LOT_RELIEF} (§ 921.04, ${NONCONFORMING_LOT_URL})`;

const REVIEW_KIND: Partial<Record<UseLetter, ReviewKind>> = { A: "administrator", S: "special" };

const NUM = new Intl.NumberFormat("en-US");
const fmt = (n: number) => NUM.format(n);

/** "P if lot width ≤ 35 ft, else S; width not in the record". */
const widthQuestion = (widthFt: number, otherwise: UseLetter) => `P if lot width ≤ ${widthFt} ft, else ${otherwise}; width not in the record`;

/**
 * Resolve a conditional use entry against the lot. With no width in the record the letter is null:
 * the permission is unresolved, never the stricter branch by default.
 */
function resolveUse(entry: UseEntry, lot: Lot): { letter: UseLetter | null; note?: string; question?: string } {
  if (typeof entry === "string") return { letter: entry };
  if (lot.frontageFt === null) {
    const question = widthQuestion(entry.widthFt, entry.otherwise);
    return {
      letter: null,
      question,
      note: `${question} (${NEEDS_SURVEY}). Frontage is not in the County legal description; confirm lot width before choosing a route.`,
    };
  }
  return lot.frontageFt <= entry.widthFt
    ? { letter: "P", note: `Lot width ${fmt(lot.frontageFt)} ft is within the ${entry.widthFt} ft by-right threshold.` }
    : { letter: entry.otherwise, note: `Lot width ${fmt(lot.frontageFt)} ft exceeds the ${entry.widthFt} ft by-right threshold.` };
}

const ADU_UNKNOWN = "ADU overlay applicability unknown; the City's overlay map is not in our data";

interface UseResult {
  check: Check;
  /** null: permission unresolved (see `question`). */
  letter: UseLetter | null;
  question: PermissionQuestion | null;
}

function permittedUseCheck(d: DistrictStandards, typology: Typology, lot: Lot): UseResult {
  const row = TYPOLOGY_USE_ROW[typology];
  const std = d.uses[row];
  const resolved = resolveUse(std.value, lot);
  let letter = resolved.letter;
  let notes = [std.note, resolved.note].filter(Boolean) as string[];
  let question: PermissionQuestion | null = resolved.question
    ? {
        kind: "lot-width",
        question: resolved.question,
        action: "Resolve permission: confirm lot width (§ 911.04.A.69A)",
        citation: std.citation,
      }
    : null;
  let citation = std.citation;

  // single_adu: the ADU is an accessory use gated by §912.08, on top of the primary single-unit use.
  if (typology === "single_adu") {
    const adu = d.adu.value;
    const aduNote = d.adu.note ?? `ADU permitted as accessory to a residential use, up to ${adu.maxPerLot} per lot.`;
    if (letter === "N") {
      notes.push(aduNote);
    } else if (adu.permitted === "N") {
      letter = "N";
      notes = [aduNote]; // the ADU rule is the blocker; the primary-use note would only confuse
      citation = d.adu.citation;
    } else if (adu.permitted === "overlay") {
      // Permitted only inside an ADU Overlay District, and we have no overlay layer: the permission is open.
      letter = null;
      notes = [aduNote];
      citation = d.adu.citation;
      question = {
        kind: "adu-overlay",
        question: `${ADU_UNKNOWN}. ADUs are permitted only inside an adopted ADU Overlay District (§ 912.08)`,
        action: "Resolve permission: confirm ADU overlay (§ 912.08)",
        citation: d.adu.citation,
      };
    } else {
      notes.push(aduNote);
    }
  }

  const unresolvedMeasure = question?.kind === "lot-width" ? question.question : ADU_UNKNOWN;
  const check: Check = {
    id: "use",
    label: `Use permitted: ${USE_ROW_TITLE[row]}${typology === "single_adu" ? " + ADU" : ""}`,
    passed: letter === "P" ? true : letter === "N" ? false : null,
    measured: letter === null ? unresolvedMeasure : USE_LETTER_LABEL[letter],
    required: "P (permitted by right)",
    citation,
    note: notes.length ? notes.join(" ") : undefined,
  };
  return { check, letter, question: letter === null ? question : null };
}

function numericCheck(
  id: string,
  label: string,
  measured: number | null,
  measuredUnit: string,
  required: number | null,
  requiredNote: string | undefined,
  citation: Check["citation"],
  /** Why the measure is missing, e.g. "Lot area is not in the City inventory". */
  missing: string,
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
      note: `${missing}; ${NEEDS_SURVEY}.`,
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
      LOT_AREA_MISSING,
    ),
    numericCheck(
      "lot-width",
      "Minimum lot width",
      lot.frontageFt,
      "ft",
      d.minLotWidthFt.value,
      d.minLotWidthFt.note,
      d.minLotWidthFt.citation,
      "Frontage is not in the County legal description",
    ),
    numericCheck(
      "lot-area-per-unit",
      `Minimum lot area per unit (${units} unit${units > 1 ? "s" : ""})`,
      lot.lotAreaSqFt,
      "sq ft",
      perUnit === null ? null : perUnit * units,
      d.minLotAreaPerUnitSqFt.note,
      d.minLotAreaPerUnitSqFt.citation,
      LOT_AREA_MISSING,
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
    passed: adu.permitted === "P" ? true : adu.permitted === "overlay" ? null : false,
    measured: adu.permitted === "P" ? "Permitted accessory use" : adu.permitted === "overlay" ? ADU_UNKNOWN : "Not permitted",
    required: `Up to ${adu.maxPerLot} ADU per lot, max ${fmt(adu.maxSizeSqFt)} sq ft, owner-occupancy ${adu.ownerOccupancyRequired ? "required" : "not required"}`,
    citation: d.adu.citation,
    note: d.adu.note,
  };
}

/** An unresolved permission (letter null) is `unknown`, or `variance` when a lot standard fails regardless. */
function verdictFor(letter: UseLetter | null, checks: Check[]): Verdict {
  if (letter === "N") return "prohibited";
  const dimensional = checks.filter((c) => c.id !== "use" && c.id !== "adu-eligibility");
  const failed = dimensional.some((c) => c.passed === false);
  if (failed) return "variance";
  if (letter === null) return "unknown";
  return letter === "P" ? "by-right" : "review";
}

function summarize(d: DistrictStandards, typology: Typology, verdict: Verdict, letter: UseLetter | null, checks: Check[], question: PermissionQuestion | null): string {
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
      const useText =
        letter === null ? `a use whose permission is unresolved (${question?.question ?? "not in the record"})` : letter === "P" ? "a permitted use" : `allowed only through ${USE_LETTER_LABEL[letter]}`;
      return `${name} is ${useText} in ${zone}, but ${failed
        .map((c) => `${c.label.toLowerCase()} fails (${c.measured} vs ${c.required} required, ${c.citation.section})`)
        .join("; ")}. ${relief}${surveyNote}`;
    }
    case "review":
      return `${name} in ${zone} is allowed only through ${USE_LETTER_LABEL[letter ?? "S"]}; no encoded lot standard fails.${use?.note ? ` ${use.note}` : ""}${surveyNote}`;
    case "by-right":
      return `${name} is permitted by right in ${zone} and no encoded lot standard fails; building fit (setbacks, height, coverage) and parking on the site plan are not established.${surveyNote}`;
    default:
      return question
        ? `${name} in ${zone}: permission unresolved. ${question.question}. No encoded lot standard fails.${surveyNote}`
        : `${name}: not evaluated.`;
  }
}

function evaluateTypology(d: DistrictStandards, typology: Typology, lot: Lot): Finding {
  const { check: use, letter, question } = permittedUseCheck(d, typology, lot);
  const checks: Check[] = [use, ...dimensionalChecks(d, typology, lot), capacityCheck(d, typology, lot), parkingCheck(d, typology)];
  if (typology === "single_adu") checks.push(aduCheck(d));
  const verdict = verdictFor(letter, checks);
  return {
    typology,
    verdict,
    checks,
    summary: summarize(d, typology, verdict, letter, checks, question),
    unresolved: checks.filter((c) => c.passed === null).map((c) => c.id),
    reviewKind: letter !== null && (verdict === "review" || verdict === "variance") ? (REVIEW_KIND[letter] ?? null) : null,
    permissionQuestion: question,
  };
}

/**
 * Every typology's finding for one lot. `registry` defaults to the prebuilt one for `ruleSet`; pass
 * buildRegistry(params) to evaluate a reform lever. Checks from any other registry carry
 * `citationScenario: "custom"`: same sections, but not the text of `ruleSet`.
 */
export function evaluateLot(lot: Lot, ruleSet: RuleSet, registry: Registry = DISTRICTS[ruleSet]): Finding[] {
  const d = registry[normalizeZone(lot.zone)] ?? null;
  if (!d) {
    const summary = `District ${describeUnencoded(lot.zone)} is not encoded in this prototype; only R1D, R1A, R2, R3, RM, LNC and H are evaluated.`;
    return TYPOLOGY_ORDER.map((typology) => ({ typology, verdict: "unknown", checks: [], summary, unresolved: [], reviewKind: null }));
  }
  const findings = TYPOLOGY_ORDER.map((typology) => evaluateTypology(d, typology, lot));
  if (registry !== DISTRICTS[ruleSet]) for (const f of findings) for (const c of f.checks) c.citationScenario = "custom";
  return findings;
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
