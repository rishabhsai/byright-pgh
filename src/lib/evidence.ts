import type { Check, Citation, Comps, Finding, Lot, TriageResult, Typology, Verdict } from "./types";
import { lookupDistrict } from "./rules";
import { DEFAULT_FINANCE, fmtNum, fmtUsd, runProforma, type FinanceAssumptions, type Proforma } from "./proforma";

/*
 * The evidence row: six screening checks for one proposal on one lot, each Pass, Fail, Unknown or
 * Not checked. Only literal passes count as passes: "Not checked" is its own bucket, never folded into
 * the score. Fit passes only when every fit requirement is encoded and passes; setbacks, height and
 * coverage are never encoded, so Fit is at best Not checked (an LNC FAR pass included). Requirements
 * outside the six (required parking) are carried in `unresolved`, never dropped.
 * Copy follows research/07-brainstorm-product-cycle1.md § 3 and research/08-audit2-gpt6-astra.md § 1.
 */

/** Screening floor for a buildable footprint; the code sets no minimum in LNC or VH districts. */
export const MIN_PRACTICAL_LOT_SQFT = 1000;

export type EvidenceId = "use" | "lotSize" | "width" | "fit" | "site" | "finance";
export type EvidenceState = "pass" | "fail" | "unknown" | "notChecked";

export interface EvidenceCheck {
  id: EvidenceId;
  state: EvidenceState;
  label: string;
  detail: string;
  citation?: Citation;
}

export interface EvidenceCounts {
  pass: number;
  fail: number;
  unknown: number;
  notChecked: number;
}

/** A requirement the screen applies but cannot verify, outside the six checks (e.g. required parking). */
export interface UnresolvedRequirement {
  id: string;
  label: string;
  detail: string;
  citation?: Citation;
}

export interface Evidence {
  checks: EvidenceCheck[];
  /** How many of the six checks are in each state. */
  counts: EvidenceCounts;
  /** Literal passes only (counts.pass). Not checked is never a pass. */
  passed: number;
  total: 6;
  /** The use needs an exception, or a dimensional standard needs relief: a hearing or staff approval. */
  needsApproval: boolean;
  /** Required but unverified items outside the six checks, e.g. on-site parking. Empty when none. */
  unresolved: UnresolvedRequirement[];
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

const COUNT_ORDER: [keyof EvidenceCounts, string][] = [
  ["pass", "pass"],
  ["fail", "fail"],
  ["unknown", "unknown"],
  ["notChecked", "not checked"],
];

/** "4 pass · 1 fail · 1 not checked": every non-empty bucket, in that order. */
export function summary(evidence: Pick<Evidence, "counts">): string {
  return COUNT_ORDER.filter(([k]) => evidence.counts[k] > 0)
    .map(([k, word]) => `${evidence.counts[k]} ${word}`)
    .join(" · ");
}

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

/** The inventory's district and the City zoning map disagree at the inventory point: the use result rests on an unconfirmed district. */
export function zoneConflict(lot: Lot): string | null {
  if (lot.zoneAgrees !== false) return null;
  return `Inventory says ${lot.zone}; City zoning map says ${lot.zoneMap ?? "a different district"} at this point. Confirm district before relying on this.`;
}

function permittedUseCheck(lot: Lot, f: Finding): EvidenceCheck {
  const base = { id: "use" as const, label: EVIDENCE_LABEL.use };
  const c = find(f, "use");
  const conflict = zoneConflict(lot);
  if (conflict) return { ...base, state: "unknown", detail: conflict, ...(c ? { citation: c.citation } : {}) };
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
  // FAR is the only encoded fit requirement; setbacks, height and coverage are not, so a FAR pass stays Not checked.
  const sec = far.citation.section;
  const ratio = far.required?.match(/(\d+(?:\.\d+)?):1/)?.[1] ?? "";
  const proposed = far.measured?.replace(" sq ft proposed", " sf") ?? "";
  if (far.passed === null) {
    return { ...base, state: "unknown", detail: `FAR ${ratio}:1 · ${sec} cannot be checked: lot area not in the County record. Survey needed.`, citation: far.citation };
  }
  const cap = lot.lotAreaSqFt !== null ? `${fmtNum(Math.floor(Number(ratio) * lot.lotAreaSqFt))} sf` : "";
  return far.passed
    ? { ...base, state: "notChecked", detail: `FAR ${ratio}:1 passes; setbacks, height, coverage not modeled · ${sec}`, citation: far.citation }
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
    return { ...base, state: "unknown", detail: `No Zillow series for ${lot.neighborhood || "this lot"}; finance not screened.` };
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
    detail: `Modeled shortfall ${fmtUsd(pf.gap)} to a ${target}% return at $${psf}/sf. Target ${pf.mode === "sale" ? "sale" : "capitalized"} value ${fmtUsd(pf.breakEvenValue)}; ${comp}.`,
  };
}

/** Check ids the six evidence rows already account for. */
const COVERED = new Set(["use", "adu-eligibility", "lot-area", "lot-area-per-unit", "lot-width", "far", "building-fit"]);

function unresolvedRequirements(f: Finding): UnresolvedRequirement[] {
  return f.checks
    .filter((c) => c.passed === null && !COVERED.has(c.id))
    .map((c) =>
      c.id === "parking"
        ? {
            id: c.id,
            label: "Parking",
            detail: `${(c.required ?? "").replace(/ \(.*\)$/, "")} required · ${c.citation.section}. Must fit on the site plan; not verified by this screen.`,
            citation: c.citation,
          }
        : { id: c.id, label: c.label, detail: `${c.required ? `${c.required} required · ` : ""}${c.citation.section}. Not verified by this screen.`, citation: c.citation },
    );
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
  const counts: EvidenceCounts = { pass: 0, fail: 0, unknown: 0, notChecked: 0 };
  for (const c of checks) counts[c.state]++;
  const needsApproval =
    finding.verdict === "review" ||
    finding.verdict === "variance" ||
    finding.verdict === "prohibited" ||
    checks.some((c) => (c.id === "width" || c.id === "fit") && c.state === "fail");
  return { checks, counts, passed: counts.pass, total: 6, needsApproval, unresolved: unresolvedRequirements(finding) };
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
