import type { Check, Citation, Comps, Finding, Lot, TriageResult, Typology, Verdict } from "./types";
import { lookupDistrict } from "./rules";
import { DEFAULT_FINANCE, fmtNum, fmtUsd, runProforma, type FinanceAssumptions, type Proforma } from "./proforma";
import { MIN_PRACTICAL_LOT_SQFT } from "./triage";

/*
 * The evidence row: six screening checks for one proposal on one lot, each Pass, Fail, Unknown or
 * Not checked. "Not checked" is out of scope: it never blocks a full score but is always shown, so a
 * 6 of 6 lot literally reads "fit not checked". Copy follows research/07-brainstorm-product-cycle1.md § 3.
 */

export type EvidenceId = "use" | "lotSize" | "width" | "fit" | "site" | "finance";
export type EvidenceState = "pass" | "fail" | "unknown" | "notChecked";

export interface EvidenceCheck {
  id: EvidenceId;
  state: EvidenceState;
  label: string;
  detail: string;
  citation?: Citation;
}

export interface Evidence {
  checks: EvidenceCheck[];
  /** Checks that pass or are out of scope (not checked); the "N" in "N/6". */
  passed: number;
  total: 6;
  /** The use needs an exception, or a dimensional standard needs relief: a hearing or staff approval. */
  needsApproval: boolean;
}

export const EVIDENCE_LABEL: Record<EvidenceId, string> = {
  use: "Use",
  lotSize: "Lot size",
  width: "Width",
  fit: "Fit",
  site: "Site",
  finance: "Finance",
};

export const EVIDENCE_STATE_LABEL: Record<EvidenceState, string> = {
  pass: "Pass",
  fail: "Fail",
  unknown: "Unknown",
  notChecked: "Not checked",
};

/** Proposal names used in evidence sentences (kept here so label rewrites elsewhere do not change the copy). */
const PROPOSAL: Record<Typology, string> = {
  single: "Single-unit detached",
  single_adu: "Single-unit + ADU",
  duplex: "Two-unit",
  triplex: "Three-unit",
  townhome: "Single-unit attached",
};

/** Data vintages shown in the site row (public/data/lots.json sources). */
export const SITE_VINTAGE = "City GIS 2026-09; FEMA panel 2015";
const NOT_CHECKED_SITE = "Access, water/sewer, soils not checked";

const find = (f: Finding, id: string): Check | undefined => f.checks.find((c) => c.id === id);
const month = (d: string | null | undefined) => (d ? d.slice(0, 7) : "latest");

/** $1.42M, $641k, $83k: compact dollars for one-line evidence copy. */
export function fmtUsdShort(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (a >= 1_000_000) return `${sign}$${(a / 1_000_000).toFixed(2)}M`;
  if (a >= 1_000) return `${sign}$${Math.round(a / 1_000)}k`;
  return fmtUsd(n);
}

function permittedUseCheck(lot: Lot, f: Finding): EvidenceCheck {
  const base = { id: "use" as const, label: EVIDENCE_LABEL.use };
  const c = find(f, "use");
  if (f.verdict === "unknown" || !c) return { ...base, state: "unknown", detail: f.summary };
  const name = PROPOSAL[f.typology];
  const sec = c.citation.section;
  if (c.passed === true) {
    return { ...base, state: "pass", detail: `${name} is permitted (P) in ${lot.zone} · ${sec}`, citation: c.citation };
  }
  if (c.passed === false) {
    const adu = f.typology === "single_adu" && find(f, "adu-eligibility")?.passed === false;
    return {
      ...base,
      state: "fail",
      detail: adu
        ? `The ADU is allowed in ${lot.zone} only inside an ADU Overlay District · ${sec}. None is assumed; staff confirm.`
        : `${name} is not listed in ${lot.zone} · ${sec}. Needs a use variance; staff determine the path.`,
      citation: c.citation,
    };
  }
  const admin = f.reviewKind === "administrator";
  return {
    ...base,
    state: "unknown",
    detail: admin
      ? `${name} is an Administrator Exception use in ${lot.zone} · ${sec}, § 922.08. Not a hearing by default.`
      : `${name} is a Special Exception use in ${lot.zone} · ${sec}, § 922.07. Zoning Board hearing.`,
    citation: c.citation,
  };
}

function lotSizeCheck(lot: Lot, f: Finding): EvidenceCheck {
  const base = { id: "lotSize" as const, label: EVIDENCE_LABEL.lotSize };
  const c = find(f, "lot-area");
  if (f.verdict === "unknown" || !c) return { ...base, state: "unknown", detail: "District not encoded; lot size not evaluated." };
  if (lot.lotAreaSqFt === null) return { ...base, state: "unknown", detail: "Area not in the County record. Survey needed.", citation: c.citation };
  const area = `${fmtNum(lot.lotAreaSqFt)} sf`;
  const sec = c.citation.section;
  const perUnit = find(f, "lot-area-per-unit");
  const failed = [c, perUnit].find((x) => x?.passed === false);
  if (failed) {
    return {
      ...base,
      state: "fail",
      detail: `${area} < ${failed.required?.replace(" sq ft", " sf")} minimum · ${failed.citation.section}. Relief needed: variance or § 921.04 nonconforming-lot exception; staff determine which.`,
      citation: failed.citation,
    };
  }
  const min = c.required && c.required !== "none" && !c.required.startsWith("0 ") ? c.required.replace(" sq ft", " sf") : null;
  if (lot.lotAreaSqFt < MIN_PRACTICAL_LOT_SQFT) {
    return {
      ...base,
      state: "fail",
      detail: `${area} ${min ? `meets the ${min} minimum` : `meets the code (no minimum in ${lot.zone})`} · ${sec}, but is under the ${fmtNum(MIN_PRACTICAL_LOT_SQFT)} sf screening floor; likely needs consolidation (assumption, not code).`,
      citation: c.citation,
    };
  }
  return {
    ...base,
    state: "pass",
    detail: min ? `${area} ≥ ${min} minimum · ${sec}` : `${area}; no minimum lot size in ${lot.zone} · ${sec}`,
    citation: c.citation,
  };
}

/** The R1D attached-unit test (§ 911.04.A.69A): by right only at or under this width. */
function widthThreshold(lot: Lot, f: Finding): number | null {
  const rs = find(f, "use")?.citation.ruleSet ?? "current";
  const d = lookupDistrict(rs, lot.zone);
  if (!d || f.typology !== "townhome") return null;
  const entry = d.uses.townhome.value;
  return typeof entry === "string" ? null : entry.widthFt;
}

function widthCheck(lot: Lot, f: Finding): EvidenceCheck {
  const base = { id: "width" as const, label: EVIDENCE_LABEL.width };
  const c = find(f, "lot-width");
  if (f.verdict === "unknown" || !c) return { ...base, state: "unknown", detail: "District not encoded; width not evaluated." };
  if (lot.frontageFt === null) {
    return { ...base, state: "unknown", detail: "Frontage not in the County legal description; survey needed", citation: c.citation };
  }
  const w = `≈ ${fmtNum(lot.frontageFt)} ft parsed from the legal description`;
  const threshold = widthThreshold(lot, f);
  if (threshold !== null) {
    return lot.frontageFt <= threshold
      ? { ...base, state: "pass", detail: `${w}; treated as ≤ ${threshold} ft for § 911.04.A.69A. Survey governs.` }
      : { ...base, state: "fail", detail: `${w}; over ${threshold} ft, so attached units need a Special Exception (§ 911.04.A.69A). Survey governs.` };
  }
  if (c.passed === false) {
    return { ...base, state: "fail", detail: `${w}; under the ${c.required} minimum · ${c.citation.section}. Survey governs.`, citation: c.citation };
  }
  return { ...base, state: "pass", detail: `${w}; no minimum width applies · ${c.citation.section}. Survey governs.`, citation: c.citation };
}

function fitCheck(lot: Lot, f: Finding): EvidenceCheck {
  const base = { id: "fit" as const, label: EVIDENCE_LABEL.fit };
  const far = find(f, "far");
  if (!far) return { ...base, state: "notChecked", detail: "Setbacks, height, lot coverage not modeled; LNC FAR only" };
  const sec = far.citation.section;
  const ratio = far.required?.match(/(\d+(?:\.\d+)?):1/)?.[1] ?? "";
  const proposed = far.measured?.replace(" sq ft proposed", " sf") ?? "";
  if (far.passed === null) {
    return { ...base, state: "unknown", detail: `FAR ${ratio}:1 · ${sec} cannot be checked: lot area not in the County record. Survey needed.`, citation: far.citation };
  }
  const cap = lot.lotAreaSqFt !== null ? `${fmtNum(Math.floor(Number(ratio) * lot.lotAreaSqFt))} sf` : "";
  return far.passed
    ? { ...base, state: "pass", detail: `FAR ${ratio}:1 allows up to ${cap} · ${sec}. The ${proposed} proposal fits; setbacks and height not modeled.`, citation: far.citation }
    : { ...base, state: "fail", detail: `FAR ${ratio}:1 caps floor area at ${cap} · ${sec}. The ${proposed} proposal does not fit.`, citation: far.citation };
}

function siteCheck(lot: Lot): EvidenceCheck {
  const base = { id: "site" as const, label: EVIDENCE_LABEL.site };
  const h = lot.hazards;
  const flags: string[] = [];
  if (h.steepSlope) flags.push("Slope ≥ 25%");
  if (h.undermined) flags.push("Undermined-area");
  if (h.floodZone) flags.push("FEMA flood zone");
  if (flags.length) {
    const hillside = h.steepSlope ? "; H-district conditions in § 911.04.A.69(a)" : "";
    return {
      ...base,
      state: "fail",
      detail: `${flags.join(" and ")} flag at the inventory point (City GIS). Site review needed${hillside}. ${NOT_CHECKED_SITE}.`,
    };
  }
  if (h.floodZone === null) {
    return {
      ...base,
      state: "unknown",
      detail: `No slope or mine flag at the inventory point; FEMA flood screening missing there. ${NOT_CHECKED_SITE}.`,
    };
  }
  return {
    ...base,
    state: "pass",
    detail: `No slope, mine, or flood flag at the inventory point (${SITE_VINTAGE}). ${NOT_CHECKED_SITE}.`,
  };
}

function financeCheck(lot: Lot, f: Finding, pf: Proforma | null, comps: Comps | null): EvidenceCheck {
  const base = { id: "finance" as const, label: EVIDENCE_LABEL.finance };
  if (!pf && (f.verdict === "prohibited" || f.verdict === "unknown")) {
    return { ...base, state: "unknown", detail: "Not screened: the proposal is not permitted or not evaluated here." };
  }
  if (!pf || !comps) {
    return { ...base, state: "unknown", detail: `No Zillow series for ${lot.neighborhood || "this lot"}. Enter a comp to screen.` };
  }
  const input = (k: string) => pf.inputsUsed.find((i) => i.key === k)?.value;
  const psf = input("hardCostPerSf");
  const target = input("targetMarginPct");
  const comp =
    pf.mode === "sale"
      ? `${comps.neighborhood} ZHVI ${fmtUsd(comps.zhvi ?? 0)} (${month(comps.zhviDate)})`
      : `ZIP ${comps.zip} ZORI ${fmtUsd(comps.zori ?? 0)}/mo (${month(comps.zoriDate)})`;
  if (pf.pencils) {
    const compShort =
      pf.mode === "sale"
        ? `${comps.neighborhood} ZHVI ${fmtUsdShort(comps.zhvi ?? 0)} (${month(comps.zhviDate)})`
        : comp;
    return {
      ...base,
      state: "pass",
      detail: `Modeled value ${fmtUsdShort(pf.revenue)} vs cost ${fmtUsdShort(pf.totalCost)} at $${psf}/sf, ${compShort}. Screen, not underwriting`,
    };
  }
  return {
    ...base,
    state: "fail",
    detail: `Modeled shortfall ${fmtUsd(pf.gap)} to a ${target}% return at $${psf}/sf. Break-even ${pf.mode === "sale" ? "sale " : ""}value ${fmtUsd(pf.breakEvenValue)}; ${comp}.`,
  };
}

export function deriveEvidence(
  lot: Lot,
  findingOrNull: Finding | null,
  _triage: TriageResult | null,
  proforma: Proforma | null,
  comps: Comps | null,
): Evidence {
  const finding: Finding = findingOrNull ?? {
    typology: "single",
    verdict: "unknown",
    checks: [],
    summary: "Zoning was not evaluated for this lot.",
    unresolved: [],
    reviewKind: null,
  };
  const checks = [permittedUseCheck(lot, finding), lotSizeCheck(lot, finding), widthCheck(lot, finding), fitCheck(lot, finding), siteCheck(lot), financeCheck(lot, finding, proforma, comps)];
  const passed = checks.filter((c) => c.state === "pass" || c.state === "notChecked").length;
  const needsApproval =
    finding.verdict === "review" ||
    finding.verdict === "variance" ||
    finding.verdict === "prohibited" ||
    checks.some((c) => (c.id === "width" || c.id === "fit") && c.state === "fail");
  return { checks, passed, total: 6, needsApproval };
}

export type YellowReason = "needs subsidy" | "needs a hearing or staff approval" | "unknowns to resolve";

/** One phrase for why a Yellow lot is Yellow, in the order a disposition analyst clears them. */
export function yellowReason(triage: TriageResult | null, evidence: Evidence): YellowReason | null {
  if (!triage || triage.triage !== "yellow") return null;
  if (evidence.needsApproval) return "needs a hearing or staff approval";
  const state = (id: EvidenceId) => evidence.checks.find((c) => c.id === id)?.state;
  if (evidence.checks.some((c) => c.id !== "finance" && (c.state === "unknown" || c.state === "fail"))) return "unknowns to resolve";
  if (state("finance") === "fail") return "needs subsidy";
  return "unknowns to resolve";
}

const VERDICT_RANK: Record<Verdict, number> = { "by-right": 0, review: 1, variance: 2, prohibited: 3, unknown: 4 };

/** The proposal a lot is screened for: the Home type filter, else triage's best type, else the most permissive verdict. */
export function pickFinding(findings: Finding[], triage: TriageResult | null, typology: Typology | null): Finding {
  const want = typology ?? triage?.bestTypology ?? null;
  const hit = want ? findings.find((f) => f.typology === want) : undefined;
  if (hit) return hit;
  return findings.reduce((best, f) => (VERDICT_RANK[f.verdict] < VERDICT_RANK[best.verdict] ? f : best), findings[0]);
}

/** Pro forma for the screened proposal, falling back to the other revenue mode like triageLot does. */
export function proformaFor(lot: Lot, typology: Typology, comps: Comps | null, a: FinanceAssumptions = DEFAULT_FINANCE): Proforma | null {
  return runProforma(lot, typology, comps, a) ?? runProforma(lot, typology, comps, { ...a, mode: a.mode === "sale" ? "rent" : "sale" });
}

/** Evidence for one lot as the app shows it: the picked proposal and its pro forma. */
export function evidenceForLot(
  lot: Lot,
  findings: Finding[],
  triage: TriageResult | null,
  comps: Comps | null,
  assumptions: FinanceAssumptions,
  typology: Typology | null,
): Evidence {
  const f = pickFinding(findings, triage, typology);
  const pf = f.verdict === "unknown" || f.verdict === "prohibited" ? null : proformaFor(lot, f.typology, comps, assumptions);
  return deriveEvidence(lot, f, triage, pf, comps);
}
