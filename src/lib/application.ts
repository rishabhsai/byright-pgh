import type { Check, Comps, Finding, Lot, RuleSet, TriageResult, Typology, Verdict } from "./types";
import { TYPOLOGY_LABEL, VERDICT_LABEL } from "./types";
import { evaluateLot, lookupDistrict } from "./rules";
import { buildingSf, fmtUsd, UNIT_PLAN, type Proforma } from "./proforma";

/*
 * Application planner: turns structured findings into the filings a lot needs, pre-fills the
 * City's Request to Purchase form (page 2), and drafts a variance justification from facts only.
 * Pure functions. ByRight never submits anything; the applicant reviews, signs, and files.
 *
 * Sources (verbatim text in docs/sources/):
 *   city-request-to-purchase-application-individuals-v2018.txt
 *   city-zba-process-guide-2024-12.txt
 */

export const NEVER_SUBMITS =
  "Prepared from public records for your review. You file it; ByRight does not submit applications.";
export const DRAFT_LABEL = "DRAFT: edit before filing";

export const SOURCE = {
  purchaseForm: {
    title: "City of Pittsburgh, Request to Purchase Application – Individuals (V. 1/2018)",
    url: "https://www.pittsburghpa.gov/files/assets/city/v/1/finance/documents/real-estate-forms/8265_request_to_purchase_application_-_individuals.pdf",
  },
  zbaGuide: {
    title: "Pittsburgh Department of City Planning, Zoning Board of Adjustment process guide (Dec. 2024)",
    url: "https://www.pittsburghpa.gov/files/assets/city/v/1/dcp/documents/process-guides-and-handouts/process-guide-handout-zba-2024.pdf",
  },
  landBank: {
    title: "Pittsburgh Land Bank, How to buy vacant, blighted, or tax-delinquent property in Pittsburgh",
    url: "https://pghlandbank.org/how-to-buy-vacant-blighted-or-tax-delinquent-property-in-pittsburgh/",
  },
  abutting311: {
    title: "Pittsburgh 311 knowledge base, article 812 (abutting property owners list)",
    url: "https://pittsburghpa.qscend.com/311/knowledgebase/article/812",
  },
} as const;

/** Variance approval criteria, confirmed on ecode360 (docs/sources/ecode360-45479331-922.09-variances.txt). */
export const VARIANCE_CRITERIA = {
  section: "§ 922.09.E",
  title: "Variances, General Conditions for Approval",
  url: "https://ecode360.com/45479331",
  mirrors: "PA Municipalities Planning Code § 910.2(a)",
};

/** § 922.09.C: notice list the applicant must supply with a variance application. */
export const NOTICE_CITATION = { section: "§ 922.09.C", title: "Variances, Notice", url: "https://ecode360.com/45479331" };

export type ChipTone = "fee" | "time" | "place" | "warn";

export interface Step {
  id: "acquire" | "zoning" | "permit" | "bill";
  title: string;
  body: string[];
  chips: { label: string; tone: ChipTone }[];
  /** Status-specific caution or confirmation shown above the body. */
  callout?: { tone: "ok" | "warn"; text: string };
}

export interface PrefilledField {
  label: string;
  /** null for "You complete" items; never fabricated. */
  value: string | null;
  who: "prefilled" | "you";
  note?: string;
}

export interface ZbaFinding {
  n: number;
  title: string;
  text: string;
}

export interface ZbaDraft {
  requestTypes: string[];
  sections: { text: string; url: string }[];
  criteria: typeof VARIANCE_CRITERIA;
  findings: ZbaFinding[];
  label: typeof DRAFT_LABEL;
  note?: string;
}

export interface ApplicationPlan {
  lotId: string;
  address: string;
  typology: Typology;
  verdict: Verdict;
  ruleSet: RuleSet;
  banner: typeof NEVER_SUBMITS;
  steps: Step[];
  purchaseForm: PrefilledField[];
  /** The "detailed description" value, kept separately so the LLM polish can swap it. */
  description: string;
  zba: ZbaDraft | null;
  attachments: string[];
  sources: { title: string; url: string }[];
  /** Typologies that are by right on this lot under the same rule set. */
  byRightAlternatives: Typology[];
}

/* ---------- Parcel ID ---------- */

/**
 * County PARID (16 chars): 4-digit block, 1-letter map, 5-digit lot, 4 + 2 suffix.
 * `0043R00172000000` -> `43-R-172`. A non-zero suffix is appended as `43-R-172-0001-00`.
 */
export function formatBlockLot(parid: string): { text: string; note?: string } {
  const m = /^(\d{4})([A-Z])(\d{5})(\d{4})(\d{2})$/.exec(parid.trim().toUpperCase());
  if (!m) return { text: parid, note: "Parcel ID is not in the standard 16-character layout; copy it from the County site." };
  const [, block, map, lotNo, s1, s2] = m;
  const strip = (s: string) => s.replace(/^0+/, "") || "0";
  const base = `${strip(block)}-${map}-${strip(lotNo)}`;
  if (/^0+$/.test(s1 + s2)) return { text: base };
  return { text: `${base}-${s1}-${s2}`, note: "Parcel ID has a non-zero suffix, appended as the last two groups." };
}

/* ---------- Helpers ---------- */

const DIMENSIONAL = new Set(["lot-area", "lot-width", "lot-area-per-unit"]);
const DIM_NOUN: Record<string, string> = { "lot-area": "area", "lot-width": "frontage", "lot-area-per-unit": "area" };

const TYPOLOGY_NOUN: Record<Typology, string> = {
  single: "a single-unit detached house",
  single_adu: "a single-unit house with an accessory dwelling unit",
  duplex: "a two-unit building",
  triplex: "a three-unit building",
  townhome: "an attached townhome",
};

const standardName = (c: Check) => c.label.toLowerCase().replace(/ \(.*\)$/, "");
const fmt = (n: number) => n.toLocaleString("en-US");

type UseLetter = "P" | "A" | "S" | "N";

function letterOf(finding: Finding): UseLetter {
  if (finding.verdict === "prohibited") return "N";
  const m = finding.checks.find((c) => c.id === "use")?.measured ?? "";
  if (m.startsWith("Administrator")) return "A";
  if (m.startsWith("Special")) return "S";
  if (m.startsWith("Not listed")) return "N";
  return "P";
}

function failingDimensional(finding: Finding): Check[] {
  return finding.checks.filter((c) => DIMENSIONAL.has(c.id) && c.passed === false);
}

function requestTypes(finding: Finding): string[] {
  const types: string[] = [];
  if (failingDimensional(finding).length) types.push("Dimensional variance");
  const letter = letterOf(finding);
  if (letter === "N") types.push("Use variance");
  if (letter === "A") types.push("Administrator exception");
  if (letter === "S") types.push("Special exception");
  return types;
}

/** Checks from which relief is requested, deduplicated by section and title. */
function reliefChecks(finding: Finding): Check[] {
  const letter = letterOf(finding);
  const out: Check[] = [];
  const seen = new Set<string>();
  for (const c of finding.checks) {
    const isUse = c.id === "use" && letter !== "P";
    const isAdu = c.id === "adu-eligibility" && c.passed === false && letter === "N";
    const isDim = DIMENSIONAL.has(c.id) && c.passed === false;
    if (!isUse && !isAdu && !isDim) continue;
    const key = `${c.citation.section}|${c.citation.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

const reliefLine = (c: Check) =>
  `${c.citation.section} ${c.citation.title}: required ${c.required ?? "n/a"}, lot has ${c.measured ?? "not in record"}`;

function hazardList(lot: Lot): string[] {
  const h: string[] = [];
  if (lot.hazards.steepSlope) h.push("steep slope (25%+)");
  if (lot.hazards.undermined) h.push("undermined area");
  if (lot.hazards.floodZone) h.push("FEMA flood zone");
  return h;
}

function acquisitionCallout(lot: Lot): Step["callout"] {
  if (lot.status === "Available for Sale") return { tone: "ok", text: "Listed as available for sale." };
  const flagged =
    lot.inventoryType === "URA Transfer"
      ? "URA Transfer"
      : lot.status || lot.inventoryType || "not recorded";
  return {
    tone: "warn",
    text: `This lot's inventory status is ${flagged}; confirm availability with the Real Estate Division before applying.`,
  };
}


function describe(lot: Lot, typology: Typology, zoneName: string | null, pf: Proforma | null, comps: Comps | null): string {
  const units = UNIT_PLAN[typology].units;
  const sf = buildingSf(typology);
  const kind =
    typology === "single_adu"
      ? `${TYPOLOGY_NOUN[typology]} (${UNIT_PLAN[typology].note})`
      : TYPOLOGY_NOUN[typology];
  const zone = `${lot.zone}${zoneName ? ` (${zoneName})` : ""}`;
  const s1 = `Build ${kind} on this vacant ${lot.lotAreaSqFt != null ? `${fmt(lot.lotAreaSqFt)} sq ft ` : ""}lot in the ${zone} district${lot.lotAreaSqFt == null ? " (lot area not in the City inventory; needs survey)" : ""}.`;
  const s2 = `The plan is ${units === 1 ? "one unit" : `${units} units`}, about ${fmt(sf)} sf of living space${
    pf ? `, with an estimated total development cost of ${fmtUsd(pf.totalCost)} at our screening assumptions` : ""
  }.`;
  const s3 = pf
    ? pf.mode === "sale"
      ? "The home(s) would be sold to owner-occupants."
      : "The unit(s) would be offered as rentals."
    : comps
      ? "Financing and sale or rental terms to be confirmed by the applicant."
      : "Budget to be confirmed by the applicant; our screening had no neighborhood comps for this lot.";
  return [s1, s2, s3].join(" ");
}

/* ---------- Variance findings (facts only) ---------- */

function draftFindings(
  lot: Lot,
  finding: Finding,
  byRight: Typology[],
  zoneName: string | null,
): ZbaFinding[] {
  const relief = reliefChecks(finding);
  const dims = failingDimensional(finding);
  const letter = letterOf(finding);
  const hazards = hazardList(lot);
  const noun = TYPOLOGY_NOUN[finding.typology];
  const zone = `${lot.zone}${zoneName ? ` (${zoneName})` : ""}`;
  const frontage = lot.frontageFt != null ? `${fmt(lot.frontageFt)} ft of frontage` : "frontage not in the City inventory (needs survey)";

  const shortfalls = dims.map(
    (c) => `${DIM_NOUN[c.id]} is ${c.measured} against the ${c.required} ${standardName(c)} required (${c.citation.section})`,
  );

  const f1 = [
    `The subject property, ${lot.address || lot.id} (parcel ${lot.id}), is a vacant City-owned lot of record in the ${zone} district with ${lot.lotAreaSqFt != null ? `${fmt(lot.lotAreaSqFt)} sq ft of area` : "an unrecorded area (needs survey)"} and ${frontage}, per the City's property inventory.`,
    shortfalls.length ? `Its ${shortfalls.join("; its ")}.` : "",
    hazards.length
      ? `City screening layers also flag the lot for ${hazards.join(" and ")}, a physical condition to document with a survey.`
      : "",
    letter === "N"
      ? "Applicant to add: the physical conditions (shape, topography, size) that make this lot unlike others in the district; public records alone do not establish them."
      : "These are conditions of the lot itself, not of the proposed building.",
  ]
    .filter(Boolean)
    .join(" ");

  const f2 = dims.length
    ? [
        `Because the lot is below the ${dims.map((c) => `${c.required} ${standardName(c)}`).join(" and ")} set for ${lot.zone}, ${noun} cannot be built on it in strict conformity with the Zoning Code.`,
        byRight.length
          ? `Note: under the checks we ran, ${byRight.map((t) => TYPOLOGY_LABEL[t].toLowerCase()).join(", ")} ${byRight.length > 1 ? "are" : "is"} by right on this lot; the Board may ask why that option is not pursued.`
          : "None of the five small-home types we screened is by right on this lot, so without relief it would remain vacant.",
      ].join(" ")
    : [
        `${TYPOLOGY_LABEL[finding.typology]} is ${letter === "N" ? "not listed as a permitted use" : "allowed only by exception"} in ${lot.zone}.`,
        byRight.length
          ? `Under the checks we ran, ${byRight.map((t) => TYPOLOGY_LABEL[t].toLowerCase()).join(", ")} ${byRight.length > 1 ? "are" : "is"} by right here, which weakens this finding; the applicant must explain why a conforming use is not feasible.`
          : "None of the five small-home types we screened is by right on this lot.",
      ].join(" ");

  const f3 =
    `The lot's area and frontage are as recorded in the City's inventory (status: ${lot.status || "not recorded"}) before the applicant acquires it. ` +
    "The applicant has not subdivided, consolidated, or otherwise changed the lot's boundaries; the condition was not created by the applicant.";

  const f4 = [
    `The proposal is ${noun} of about ${fmt(buildingSf(finding.typology))} sf, a residential use on a vacant lot in ${lot.neighborhood}.`,
    letter === "N"
      ? `The ${lot.zone} district permits other residential uses; applicant to show how ${UNIT_PLAN[finding.typology].units} units fit the scale of the block.`
      : `Residential use of this kind is ${letter === "P" ? "permitted" : "allowed by exception"} in ${lot.zone}, and the building would return a vacant lot to residential use.`,
    "Applicant to add: photographs of the block, sizes of neighboring lots, and elevations showing the building's height and setbacks relative to adjacent houses.",
  ].join(" ");

  const f5 = [
    `Relief is requested only from ${relief.map((c) => c.citation.section).filter((s, i, a) => a.indexOf(s) === i).join(" and ")}.`,
    dims.length
      ? `The request is limited to the recorded ${dims.map((c) => `${standardName(c)} (${c.measured} of ${c.required})`).join(" and ")}; no other relief is sought under the checks we ran.`
      : "No dimensional relief is sought under the checks we ran.",
    finding.checks.some((c) => c.id === "parking" && c.passed === null)
      ? `Parking (${finding.checks.find((c) => c.id === "parking")!.citation.section}) requires ${finding.checks.find((c) => c.id === "parking")!.required}; the site plan must show the required parking or the request must add parking relief.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  return [
    { n: 1, title: "Unique physical circumstances or conditions of the lot", text: f1 },
    { n: 2, title: "No possibility the property can be developed in strict conformity", text: f2 },
    { n: 3, title: "Hardship not created by the applicant", text: f3 },
    { n: 4, title: "Will not alter the essential character of the neighborhood or impair adjacent property", text: f4 },
    { n: 5, title: "Minimum variance that affords relief", text: f5 },
  ];
}

/* ---------- Plan ---------- */

export function buildApplicationPlan(
  lot: Lot,
  findings: Finding[],
  ruleSet: RuleSet,
  _triage: TriageResult | null,
  proforma: Proforma | null,
  comps: Comps | null,
  typology: Typology,
): ApplicationPlan {
  const finding = findings.find((f) => f.typology === typology) ?? findings[0];
  const verdict = finding.verdict;
  const zoneName = lookupDistrict(ruleSet, lot.zone)?.name ?? null;
  const byRight = findings.filter((f) => f.verdict === "by-right").map((f) => f.typology);
  const pf = proforma && proforma.typology === typology ? proforma : null;
  const needsZba = verdict === "variance" || verdict === "review" || verdict === "prohibited";
  const relief = reliefChecks(finding);
  const letter = letterOf(finding);

  const steps: Step[] = [];

  steps.push({
    id: "acquire",
    title: "Acquire the lot from the City",
    callout: acquisitionCallout(lot),
    body: [
      "Complete the Request to Purchase Application – Individuals (V. 1/2018), both pages. Page 2 is pre-filled below.",
      "Send it to the Department of Finance, Real Estate Division, City-County Building, 414 Grant Street, Pittsburgh, PA 15219-2476, or email property.sales.3tb@pittsburghpa.gov (send encrypted).",
      "Qualified-buyer check: applicants must not have unresolved taxes, balances, permit violations, or unregistered businesses; the City runs a background check.",
      "Sales are subject to City Council approval. The application does not bind the City to a transaction.",
    ],
    chips: [
      { label: "Up to 6 weeks to process", tone: "time" },
      { label: "Deposit: $200 or 10% of price, whichever is greater", tone: "fee" },
      { label: "City Council approval", tone: "place" },
    ],
  });

  const rsNote =
    ruleSet === "bill-2025-1545"
      ? "This plan applies Bill 2025-1545, which is not law yet. Staff review your application under the code in force when you file."
      : null;

  if (verdict === "by-right") {
    steps.push({
      id: "zoning",
      title: "Zoning review",
      body: [
        "File a Building and Development Application (BDA) on OneStopPGH after you own the lot; staff zoning review only, no hearing expected under the checks we ran.",
        ...(rsNote ? [rsNote] : []),
      ],
      chips: [
        { label: "Base zoning review fees", tone: "fee" },
        { label: "OneStopPGH", tone: "place" },
      ],
    });
  } else {
    const body: string[] = [];
    if (verdict === "prohibited") {
      body.push(
        `${
          typology === "single_adu" && finding.checks.find((c) => c.id === "use")?.citation.section === "§ 912.08"
            ? "Under today's code an ADU is allowed only inside an ADU Overlay District (§ 912.08)"
            : "Use is not listed in this district"
        }; a use variance is required, which has a much higher bar. ${
          byRight.length
            ? `Consider a typology that is by right here instead: ${byRight.map((t) => TYPOLOGY_LABEL[t]).join(", ")}.`
            : "No small-home type we screened is by right here."
        }`,
      );
    }
    body.push("File a BDA on OneStopPGH; staff will schedule a Zoning Board of Adjustment hearing.");
    if (letter === "A" && failingDimensional(finding).length === 0) {
      body.push("Administrator exceptions are decided under § 922.08; staff will confirm whether a hearing is needed.");
    }
    body.push(
      "Hang the notice poster on the property at least 21 days before the hearing, readable from the primary street, and photograph it on the day you post it.",
      "Hearings are the first three Thursdays of the month, in the basement hearing room of 412 Boulevard of the Allies (in person or Zoom).",
      "The Board decides within 45 days after the record closes. The decision expires one year after mailing; get a permit and start construction within that year.",
      "If the lot is inside a Registered Community Organization's boundaries, a Development Activities Meeting may be required at least 30 days before the hearing.",
    );
    if (rsNote) body.push(rsNote);
    steps.push({
      id: "zoning",
      title: "Zoning review with a ZBA hearing",
      body,
      chips: [
        { label: "$400 ZBA fee + base zoning fees", tone: "fee" },
        { label: "21-day posted notice", tone: "time" },
        { label: "Decision ≤ 45 days after record closes", tone: "time" },
        { label: "412 Blvd of the Allies", tone: "place" },
      ],
    });
  }

  steps.push({
    id: "permit",
    title: "Building permit and inspections",
    body: [
      "After zoning approval, the City issues a Record of Zoning Approval (ROZA). Then apply for the building permit and schedule inspections with Permits, Licenses, and Inspections on OneStopPGH.",
    ],
    chips: [{ label: "After ROZA", tone: "time" }],
  });

  if (ruleSet === "current" && verdict !== "by-right") {
    const bill = evaluateLot(lot, "bill-2025-1545").find((f) => f.typology === typology);
    if (bill && bill.verdict !== verdict) {
      steps.push({
        id: "bill",
        title: "If Bill 2025-1545 passes",
        body: [
          bill.verdict === "by-right"
            ? "Council's pending bill would make this by right; consider timing."
            : `Council's pending bill would change this to "${VERDICT_LABEL[bill.verdict]}"; consider timing.`,
        ],
        chips: [{ label: "Pending in Council", tone: "warn" }],
      });
    }
  }

  const description = describe(lot, typology, zoneName, pf, comps);
  const blockLot = formatBlockLot(lot.id);
  const reliefSections = relief.map((c) => c.citation.section).filter((s, i, a) => a.indexOf(s) === i);

  const purchaseForm: PrefilledField[] = [
    {
      label: "Property to be Purchased Address",
      value: `${lot.address || "No street address on record"}, Pittsburgh, PA`,
      who: "prefilled",
      note: /^0+ /.test(lot.address)
        ? "House number 0 means the lot has no assigned number; the Block/Lot Number identifies it. Add the ZIP code from the County record."
        : "Add the ZIP code from the County record.",
    },
    { label: "Ward", value: lot.ward || null, who: lot.ward ? "prefilled" : "you" },
    { label: "Block/Lot Number", value: blockLot.text, who: "prefilled", note: blockLot.note },
    {
      label: "Property Proposed End Use",
      value:
        typology === "single_adu"
          ? "New Construction: Residential (house + accessory dwelling unit)"
          : "New Construction: Residential",
      who: "prefilled",
    },
    { label: "Detailed description of your proposed end use", value: description, who: "prefilled" },
    { label: "Will you need to seek a building permit?", value: "Yes", who: "prefilled" },
    {
      label: "Will you need to seek a variance or special exception?",
      value: needsZba ? `Yes: ${reliefSections.join(", ")}` : "No",
      who: "prefilled",
    },
    {
      label: "When will you apply for a permit (Approximately)?",
      value: `After closing; est. ${needsZba ? "9–12" : "6"} months`,
      who: "prefilled",
      note: "You may only build on a property after ownership.",
    },
    { label: "Have you verified the current condition of the property?", value: null, who: "you", note: "You must visit the site." },
    { label: "Applicant name and SSN (last four)", value: null, who: "you" },
    { label: "Spouse's name and SSN (last four), if buying jointly", value: null, who: "you" },
    { label: "Home address, email, and phone", value: null, who: "you" },
    { label: "Property owned in the City of Pittsburgh (page 1 list)", value: null, who: "you" },
    { label: "Payment plan with Jordan Tax Services (JTS)?", value: null, who: "you", note: "If yes, attach JTS certification." },
    { label: "Adjacent or nearby property owned within about 1/4 mile", value: null, who: "you" },
    { label: "Signature and date", value: null, who: "you" },
  ];

  const zba: ZbaDraft | null = needsZba
    ? {
        requestTypes: requestTypes(finding),
        sections: relief.map((c) => ({ text: reliefLine(c), url: c.citation.url })),
        criteria: VARIANCE_CRITERIA,
        findings: draftFindings(lot, finding, byRight, zoneName),
        label: DRAFT_LABEL,
        note:
          letter === "A" || letter === "S"
            ? `Exceptions are reviewed under ${letter === "A" ? "§ 922.08" : "§ 922.07"}, not the variance findings; adapt these paragraphs to those criteria.`
            : undefined,
      }
    : null;

  const attachments: string[] = ["Site plan detailing the proposal", "Photographs of the property"];
  if (needsZba) {
    attachments.push(
      "Photo of the posted notice showing its location on the property",
      "Names and mailing addresses of at least 6 nearest property owners, including all abutting owners and those across the street, from Allegheny County records (§ 922.09.C)",
      "Evidence for each approval criterion (the draft justification in this packet, edited)",
    );
  }
  attachments.push(
    "Proof of authorization, if you are not the owner when you file",
    "Jordan Tax Services (JTS) certification, if you are on a payment plan",
  );

  const sources: { title: string; url: string }[] = [SOURCE.purchaseForm, SOURCE.landBank];
  if (needsZba)
    sources.push(
      SOURCE.zbaGuide,
      SOURCE.abutting311,
      { title: `${VARIANCE_CRITERIA.section} ${VARIANCE_CRITERIA.title}`, url: VARIANCE_CRITERIA.url },
      { title: `${NOTICE_CITATION.section} ${NOTICE_CITATION.title}`, url: NOTICE_CITATION.url },
    );
  else sources.push(SOURCE.zbaGuide);
  const seen = new Set(sources.map((s) => s.url + s.title));
  for (const c of finding.checks) {
    const s = { title: `${c.citation.section} ${c.citation.title}`, url: c.citation.url };
    if (seen.has(s.url + s.title)) continue;
    seen.add(s.url + s.title);
    sources.push(s);
  }

  return {
    lotId: lot.id,
    address: lot.address,
    typology,
    verdict,
    ruleSet,
    banner: NEVER_SUBMITS,
    steps,
    purchaseForm,
    description,
    zba,
    attachments,
    sources,
    byRightAlternatives: byRight,
  };
}

/** Default typology for the picker: triage's best, else first by-right, else first not prohibited. */
export function defaultTypology(findings: Finding[], triage: TriageResult | null): Typology | null {
  if (triage?.bestTypology) return triage.bestTypology;
  return (
    findings.find((f) => f.verdict === "by-right")?.typology ??
    findings.find((f) => f.verdict !== "prohibited" && f.verdict !== "unknown")?.typology ??
    null
  );
}

/* ---------- Markdown ---------- */

export function renderApplicationMarkdown(plan: ApplicationPlan): string {
  const L: string[] = [];
  L.push(`# Application packet: ${plan.address || plan.lotId}`);
  L.push("");
  L.push(`> ${plan.banner}`);
  L.push("");
  L.push(`Parcel ${plan.lotId}. Proposed: ${TYPOLOGY_LABEL[plan.typology]} (${VERDICT_LABEL[plan.verdict]}${plan.ruleSet === "bill-2025-1545" ? ", if Bill 2025-1545 passes" : ", today's code"}).`);
  L.push("");
  L.push("## Steps");
  plan.steps.forEach((s, i) => {
    L.push("");
    L.push(`### ${i + 1}. ${s.title}`);
    if (s.callout) L.push(`**${s.callout.text}**`);
    for (const b of s.body) L.push(`- ${b}`);
    if (s.chips.length) L.push(`- _${s.chips.map((c) => c.label).join(" · ")}_`);
  });
  L.push("");
  L.push("## Pre-filled: Request to Purchase, page 2");
  L.push("");
  for (const f of plan.purchaseForm.filter((f) => f.who === "prefilled")) {
    L.push(`- **${f.label}:** ${f.value}${f.note ? ` _(${f.note})_` : ""}`);
  }
  L.push("");
  L.push("### You complete");
  for (const f of plan.purchaseForm.filter((f) => f.who === "you")) {
    L.push(`- [ ] ${f.label}${f.note ? `: ${f.note}` : ""}`);
  }
  if (plan.zba) {
    L.push("");
    L.push("## Zoning Board of Adjustment request");
    L.push("");
    L.push(`**${plan.zba.label}**`);
    L.push("");
    L.push(`- **Request type:** ${plan.zba.requestTypes.join("; ")}`);
    L.push("- **Sections from which relief is requested:**");
    for (const s of plan.zba.sections) L.push(`  - [${s.text}](${s.url})`);
    L.push("");
    L.push(`### Justification (${plan.zba.criteria.section}, ${plan.zba.criteria.title}; mirrors ${plan.zba.criteria.mirrors})`);
    if (plan.zba.note) L.push(`_${plan.zba.note}_`);
    for (const f of plan.zba.findings) {
      L.push("");
      L.push(`**${f.n}. ${f.title}.** ${f.text}`);
    }
  }
  L.push("");
  L.push("## Attachments checklist");
  for (const a of plan.attachments) L.push(`- [ ] ${a}`);
  L.push("");
  L.push("## Sources");
  for (const s of plan.sources) L.push(`- [${s.title}](${s.url})`);
  L.push("");
  L.push("_Decision support generated from public records. Not a zoning determination or legal advice. The City's Zoning Administrator interprets the code._");
  L.push("");
  return L.join("\n");
}
