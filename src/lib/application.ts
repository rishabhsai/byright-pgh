import type { Check, Comps, Finding, Lot, RuleSet, TriageResult, Typology, Verdict } from "./types";
import { TYPOLOGY_LABEL, verdictLabel } from "./types";
import { evaluateLot, lookupDistrict } from "./rules";
import { buildingSf, fmtUsd, UNIT_PLAN, type Proforma } from "./proforma";
import { districtAction, districtUnconfirmed } from "./evidence";

/*
 * Application planner: turns structured findings into the filings a lot needs, pre-fills the
 * City's Request to Purchase form (page 2), and builds a ZBA review worksheet: what the public record
 * shows about the lot, and the questions the applicant must answer with evidence. It never asserts
 * facts the record does not establish (lot of record, boundary history, who created a hardship).
 * Pure functions. ByRight never submits anything; the applicant reviews, signs, and files.
 *
 * Sources (verbatim text in docs/sources/):
 *   city-request-to-purchase-application-individuals-v2018.txt
 *   city-zba-process-guide-2024-12.txt
 */

export const NEVER_SUBMITS =
  "Prepared from public records for your review. You file it; ByRight does not submit applications.";
export const WORKSHEET_LABEL = "ZBA review worksheet (DRAFT)";
export const BY_RIGHT_VARIANCE_ANSWER = "Not under the checks we ran; zoning staff confirm";
/** The variance answer while the inventory district and the zoning map disagree: nothing else can be answered yet. */
export const DISTRICT_FIRST_ANSWER = "Confirm district first (inventory vs map disagree)";
/** What a by-right result establishes, and what it does not. */
export const BY_RIGHT_SCOPE = "allowed by the use table and lot-size standards; other standards not checked";
/** Label on any model-suggested rewording of the proposed-use description. */
export const SUGGESTION_LABEL = "Suggested wording, unverified; edit before filing";
export const PERMIT_TIMING_ANSWER = "You estimate; typically after closing";

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
  uraContact: {
    title: "Urban Redevelopment Authority of Pittsburgh, property questions (propertyquestions@ura.org)",
    url: "mailto:propertyquestions@ura.org",
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

/** § 921.04: nonconforming lots, the alternative relief path for an undersized lot. */
export const NONCONFORMING_LOTS = { section: "§ 921.04", title: "Nonconforming Lots", url: "https://ecode360.com/45478977" };

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
  /** The § 922.09.E criterion, named neutrally. */
  title: string;
  /** What the record shows: parcel facts with their source, never inferences. */
  record: string[];
  /** What you must establish: questions and evidence prompts for the applicant. */
  establish: string[];
}

export interface ZbaDraft {
  requestTypes: string[];
  sections: { text: string; url: string }[];
  criteria: typeof VARIANCE_CRITERIA;
  findings: ZbaFinding[];
  label: typeof WORKSHEET_LABEL;
  note?: string;
}

export type AcquisitionChannel = "city-form" | "ura" | "confirm";

export interface ApplicationPlan {
  lotId: string;
  address: string;
  typology: Typology;
  verdict: Verdict;
  /** verdictLabel(finding): the verdict with its approval route (staff vs Board approval, FAR vs lot-size relief). */
  verdictLabel: string;
  ruleSet: RuleSet;
  banner: typeof NEVER_SUBMITS;
  steps: Step[];
  purchaseForm: PrefilledField[];
  /** The "detailed description" value; the only text a model may suggest rewording for. */
  description: string;
  /** How the lot is acquired: City purchase form, URA transfer, or confirm with the City first. */
  acquisition: AcquisitionChannel;
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

/** Standards where a § 921.04 nonconforming-lot exception is an alternative to a variance. */
const LOT_STANDARDS = new Set(["lot-area", "lot-width", "lot-area-per-unit"]);

const STANDARD_NAME: Record<string, string> = {
  "lot-area": "minimum lot size",
  "lot-area-per-unit": "minimum lot area per unit",
  "lot-width": "minimum lot width",
  far: "FAR",
};

const TYPOLOGY_NOUN: Record<Typology, string> = {
  single: "a single-unit detached house",
  single_adu: "a single-unit house with an accessory dwelling unit",
  duplex: "a two-unit building",
  triplex: "a three-unit building",
  townhome: "an attached townhome",
};

const NUM = new Intl.NumberFormat("en-US");
const fmt = (n: number) => NUM.format(n);

type UseLetter = "P" | "A" | "S" | "N";

function letterOf(finding: Finding): UseLetter {
  if (finding.verdict === "prohibited") return "N";
  if (finding.reviewKind === "administrator") return "A";
  if (finding.reviewKind === "special") return "S";
  const m = finding.checks.find((c) => c.id === "use")?.measured ?? "";
  if (m.startsWith("Administrator")) return "A";
  if (m.startsWith("Special")) return "S";
  if (m.startsWith("Not listed")) return "N";
  return "P";
}

/** Every failed standard on the finding (anything but the use and ADU rows). Relief is derived from this, not a list. */
function failingDimensional(finding: Finding): Check[] {
  return finding.checks.filter((c) => c.passed === false && c.id !== "use" && c.id !== "adu-eligibility");
}

const standardName = (c: Check) => STANDARD_NAME[c.id] ?? c.label.toLowerCase();

/** "≤ 518 sq ft" from an FAR check's "at most 518 sq ft (2:1 × 259 sq ft lot)". */
const farCap = (c: Check) => `≤ ${c.required?.match(/at most ([\d,]+ sq ft)/)?.[1] ?? c.required ?? "the FAR cap"}`;

/** The relief options for one failed standard. */
function reliefOptions(c: Check): string {
  if (c.id === "far") return `a smaller building (${farCap(c)}) or a dimensional variance under § 922.09; zoning staff determine the path`;
  if (LOT_STANDARDS.has(c.id)) return `a dimensional variance under § 922.09 or a nonconforming-lot exception under ${NONCONFORMING_LOTS.section}; zoning staff determine which`;
  return "a dimensional variance under § 922.09; zoning staff determine the path";
}

const measuredText = (c: Check) => (c.id === "far" ? `proposal is ${(c.measured ?? "not in record").replace(" proposed", "")}` : `lot has ${c.measured ?? "not in record"}`);

/** One line per failed standard; lot standards get their options from DIM_PATH, printed once after them. */
const reliefNeeded = (c: Check) =>
  `Relief needed: ${standardName(c)} (${c.citation.section} ${c.citation.title}): required ${c.required ?? "n/a"}, ${measuredText(c)}.${
    LOT_STANDARDS.has(c.id) ? "" : ` Options: ${reliefOptions(c)}.`
  }`;

const DIM_PATH =
  `Relief path determined by zoning staff: dimensional variance under § 922.09 or nonconforming-lot exception under ${NONCONFORMING_LOTS.section} (${NONCONFORMING_LOTS.url}).`;
const ADMIN_PATH = "Administrator Exception, staff review under § 922.08, no ZBA hearing or $400 ZBA fee.";
const SPECIAL_PATH = "Special Exception hearing under § 922.07.";

function requestTypes(finding: Finding): string[] {
  const types: string[] = [];
  const failed = failingDimensional(finding);
  if (failed.some((c) => LOT_STANDARDS.has(c.id)))
    types.push(`Dimensional variance (§ 922.09) or nonconforming-lot exception (${NONCONFORMING_LOTS.section}); zoning staff determine which`);
  for (const c of failed.filter((x) => x.id === "far"))
    types.push(`Smaller building (${farCap(c)}) or dimensional variance (§ 922.09) for FAR (${c.citation.section})`);
  for (const c of failed.filter((x) => !LOT_STANDARDS.has(x.id) && x.id !== "far"))
    types.push(`Dimensional variance (§ 922.09) for ${standardName(c)} (${c.citation.section})`);
  const letter = letterOf(finding);
  if (letter === "N") types.push("Use variance");
  if (letter === "A") types.push("Administrator exception (§ 922.08)");
  if (letter === "S") types.push("Special exception (§ 922.07)");
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
    const isDim = c.passed === false && c.id !== "use" && c.id !== "adu-eligibility";
    if (!isUse && !isAdu && !isDim) continue;
    const key = `${c.citation.section}|${c.citation.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

const reliefLine = (c: Check) => `${c.citation.section} ${c.citation.title}: required ${c.required ?? "n/a"}, ${measuredText(c)}`;

function hazardList(lot: Lot): string[] {
  const h: string[] = [];
  if (lot.hazards.steepSlope) h.push("steep slope (25%+)");
  if (lot.hazards.undermined) h.push("undermined area");
  if (lot.hazards.floodZone) h.push("FEMA flood zone");
  return h;
}

const URA_CALLOUT =
  "Listed for transfer to the URA; contact propertyquestions@ura.org, purchases are subject to URA Board approval";

function acquisitionChannel(lot: Lot): AcquisitionChannel {
  if (lot.status !== "Available for Sale") return "confirm";
  if (lot.inventoryType === "URA Transfer") return "ura";
  if (lot.inventoryType === "Public Sale") return "city-form";
  return "confirm";
}

function acquireStep(lot: Lot, channel: AcquisitionChannel): Step {
  const guide = `How City and Land Bank sales work: ${SOURCE.landBank.url}`;
  const forms = [
    "The Request to Purchase Application – Individuals (V. 1/2018) is for individuals; businesses and nonprofits use the City's Request to Purchase Application – Businesses form.",
  ];
  if (channel === "ura") {
    return {
      id: "acquire",
      title: "Acquire the lot through the URA",
      callout: { tone: "warn", text: URA_CALLOUT },
      body: [
        "The City inventory lists this lot for transfer to the Urban Redevelopment Authority (URA), so the City's Request to Purchase form is not the channel. Email propertyquestions@ura.org with the parcel ID.",
        guide,
      ],
      chips: [{ label: "URA Board approval", tone: "place" }],
    };
  }
  const cityBody = [
    "Complete the Request to Purchase Application – Individuals (V. 1/2018), both pages. Page 2 is pre-filled below.",
    ...forms,
    "Send it to the Department of Finance, Real Estate Division, City-County Building, 414 Grant Street, Pittsburgh, PA 15219-2476, or email property.sales.3tb@pittsburghpa.gov (send encrypted).",
    "Qualified-buyer check: applicants must not have unresolved taxes, balances, permit violations, or unregistered businesses; the City runs a background check.",
    "Sales are subject to City Council approval. The application does not bind the City to a transaction.",
    guide,
  ];
  const chips: Step["chips"] = [
    { label: "Up to 6 weeks to process", tone: "time" },
    { label: "Deposit: $200 or 10% of price, whichever is greater", tone: "fee" },
    { label: "City Council approval", tone: "place" },
  ];
  if (channel === "city-form") {
    return {
      id: "acquire",
      title: "Acquire the lot from the City",
      callout: { tone: "ok", text: "Listed as available for sale (Public Sale) in the City inventory." },
      body: cityBody,
      chips,
    };
  }
  const flagged =
    lot.status === "Available for Sale"
      ? `This lot's inventory type is ${lot.inventoryType || "not recorded"}.`
      : `This lot's inventory status is ${lot.status || "not recorded"}.`;
  return {
    id: "acquire",
    title: "Acquire the lot from the City",
    callout: { tone: "warn", text: `${flagged} Confirm availability with the Real Estate Division before applying.` },
    body: cityBody,
    chips,
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
      ? "Our screen valued the home(s) for sale; buyer terms and any occupancy restrictions are for the applicant to state."
      : "Our screen valued the unit(s) as rentals; rental terms are for the applicant to state."
    : comps
      ? "Financing and sale or rental terms to be confirmed by the applicant."
      : "Budget to be confirmed by the applicant; our screening had no neighborhood comps for this lot.";
  return [s1, s2, s3].join(" ");
}

/* ---------- ZBA review worksheet (§ 922.09.E): record facts and applicant questions ---------- */

/** The first thing to establish when the district is unconfirmed: which district governs. */
/** Street suffixes as the City inventory abbreviates them (St, Av, Wy, Bo, ...) and spelled out. */
const STREET_SUFFIX =
  /^(st|street|ave?|avenue|wa?y|wa|rd|road|rdwy|blvd|boulevard|bv|bl|bo|pl|place|dr|drive|ln|lane|ct|court|ter|terrace|sq|square|pike|path|aly|alley|cir|circle|hwy|pkwy|row|commons)$/i;

/** True when the address ends in a street suffix, ignoring a trailing direction, "Ext" or "Rear". */
export function hasStreetSuffix(address: string): boolean {
  const words = address.trim().split(/\s+/);
  while (words.length > 1 && /^(n|s|e|w|ext|rear)$/i.test(words[words.length - 1])) words.pop();
  return words.length > 1 && STREET_SUFFIX.test(words[words.length - 1]);
}

/** The purchase form's address: the inventory address as-is, with the ZIP when the parcel-to-ZIP table has it. */
function purchaseAddress(lot: Lot, zip: string | null): PrefilledField {
  const address = lot.address.trim();
  const notes: string[] = [];
  if (/^0+ /.test(address)) notes.push("House number 0 means the lot has no assigned number; the Block/Lot Number identifies it.");
  if (address && !hasStreetSuffix(address)) notes.push("Street name as recorded in the City inventory, which gives no street suffix.");
  if (!zip) notes.push("Add the ZIP code from the County record.");
  return {
    label: "Property to be Purchased Address",
    value: `${address || "No street address on record"}, Pittsburgh, PA${zip ? ` ${zip}` : ""}`,
    who: "prefilled",
    note: notes.length ? notes.join(" ") : undefined,
  };
}

function districtQuestion(lot: Lot): string {
  const map = lot.zoneMap ? `the City zoning map says ${lot.zoneMap}` : "no City zoning map district contains the inventory point";
  return `Which district governs this lot? The inventory says ${lot.zone || "no district"}; ${map}. Get zoning staff's determination before relying on anything below.`;
}

/**
 * § 921.04 eligibility turns on the lot's history, not on the deed alone: separate ownership from abutting
 * land at the applicable date, and vacancy. Asked as questions; staff determine eligibility.
 */
const NONCONFORMING_QUESTIONS = [
  `For a ${NONCONFORMING_LOTS.section} nonconforming-lot exception: was this lot held in separate ownership from all abutting land on the date the standard it fails took effect, and has it stayed separately owned since?`,
  "Has the lot been vacant, and if so, how long has it been vacant?",
  "Attach the chain of title for this lot and each abutting parcel, including any publicly held neighbor.",
];

function worksheet(lot: Lot, finding: Finding, byRight: Typology[], zoneName: string | null): ZbaFinding[] {
  const dims = failingDimensional(finding);
  const letter = letterOf(finding);
  const hazards = hazardList(lot);
  const noun = TYPOLOGY_NOUN[finding.typology];
  const useCheck = finding.checks.find((c) => c.id === "use");

  const zoneFact = `Zone: ${lot.zone}${zoneName ? ` (${zoneName})` : ""}, from the City inventory's zoned_as field.`;
  const areaFact =
    lot.lotAreaSqFt != null
      ? `Lot area: ${fmt(lot.lotAreaSqFt)} sq ft (Allegheny County assessment).`
      : "Lot area: not in the record (needs survey).";
  const frontageFact =
    lot.frontageFt != null
      ? `Frontage: ${fmt(lot.frontageFt)} ft as parsed from the county legal description (approximate; a survey governs).`
      : "Frontage: not in the record (needs survey).";
  const statusFact = `City inventory status: ${lot.status || "not recorded"}; inventory type: ${lot.inventoryType || "not recorded"}. Inventory listing is not proof of current ownership or availability.`;
  const hazardFact = hazards.length
    ? `Hazard screening: ${hazards.join(", ")} flagged at the inventory point (screening layer tested at one point, not the parcel polygon or a site survey).`
    : `Hazard screening: no hazard found at the inventory point${lot.hazards.floodZone == null ? "; flood zone not checked" : ""}.`;
  const standardFacts = dims.map((c) => `Failing standard: ${reliefLine(c)}.`);
  const useFact =
    letter !== "P" && useCheck
      ? `Use: ${TYPOLOGY_LABEL[finding.typology]} is ${useCheck.measured ?? "not listed"} in ${lot.zone} (${useCheck.citation.section}).`
      : null;
  const scope = "(use, lot area, lot width, and floor area where encoded; parking, setbacks, height, and overlays not verified)";
  const screened = byRight.length
    ? `Under the checks we ran ${scope}, ${byRight.map((t) => TYPOLOGY_LABEL[t].toLowerCase()).join(", ")} did not fail on this lot.`
    : `Under the checks we ran ${scope}, none of the five small-home types we screened is allowed by right on this lot.`;

  const parking = finding.checks.find((c) => c.id === "parking");

  return [
    {
      n: 1,
      title: "Unique physical circumstances or conditions of the lot",
      record: [zoneFact, areaFact, frontageFact, ...standardFacts, hazardFact],
      establish: [
        ...(districtUnconfirmed(lot) ? [districtQuestion(lot)] : []),
        "What physical condition (narrowness, shallowness, irregular shape, topography) is peculiar to this lot rather than common in the district? Attach a survey.",
        ...(hazards.length ? [`Does the flagged ${hazards.join(" and ")} affect this parcel? Attach a site survey or engineer's letter.`] : []),
        "Is this a lot of record? Attach the deed and recorded plat.",
        ...(dims.some((c) => LOT_STANDARDS.has(c.id)) ? NONCONFORMING_QUESTIONS : []),
      ],
    },
    {
      n: 2,
      title: "Whether the property can be developed in strict conformity",
      record: [...standardFacts, ...(useFact ? [useFact] : []), screened],
      establish: [
        "What conforming development did you consider, and why is none feasible? Attach a site sketch.",
        ...(byRight.length ? ["Our screen found a type that passed the checks we ran; explain why it does not work for you."] : []),
      ],
    },
    {
      n: 3,
      title: "Whether the hardship was created by the appellant",
      record: [statusFact],
      establish: [
        "Has the lot been subdivided or consolidated since the standard was adopted? Attach the deed history and recorded plat.",
        "Did you, or anyone acting for you, create the condition you are asking relief from? Explain.",
      ],
    },
    {
      n: 4,
      title: "Effect on the essential character of the neighborhood and adjacent property",
      record: [
        zoneFact,
        `Neighborhood: ${lot.neighborhood || "not recorded"} (City inventory).`,
        `Proposal in this packet: ${noun}, about ${fmt(buildingSf(finding.typology))} sf (our planning assumption, not a design).`,
      ],
      establish: [
        "How does the proposal fit adjacent lot sizes and heights? Attach photos and a block survey.",
        "Attach elevations showing the building's height and setbacks next to the neighboring houses.",
      ],
    },
    {
      n: 5,
      title: "Minimum variance that will afford relief",
      record: [
        ...(dims.length ? standardFacts : ["No failing dimensional standard under the checks we ran."]),
        ...(useFact ? [useFact] : []),
        ...(parking && parking.passed === null
          ? [`Parking (${parking.citation.section}): requires ${parking.required ?? "n/a"}; not verified by this screen.`]
          : []),
      ],
      establish: [
        "Is this the smallest departure from the standard that makes the proposal work? Show the alternatives you considered.",
        ...(parking && parking.passed === null
          ? ["Does your site plan provide the required parking, or do you need parking relief too?"]
          : []),
      ],
    },
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
  const needsRelief = verdict === "variance" || verdict === "review" || verdict === "prohibited";
  const relief = reliefChecks(finding);
  const letter = letterOf(finding);

  const channel = acquisitionChannel(lot);
  const steps: Step[] = [acquireStep(lot, channel)];

  const rsNote =
    ruleSet === "bill-2025-1545"
      ? "This plan applies Bill 2025-1545, which is not law yet. Staff review your application under the code in force when you file."
      : null;

  const dimsFail = failingDimensional(finding).length > 0;
  /** Administrator exception with nothing else to relieve: staff review, no Board hearing. */
  const adminOnly = letter === "A" && !dimsFail;

  const disputed = districtUnconfirmed(lot);
  const districtLead = disputed
    ? [
        `${districtAction(lot)}. The City zoning map ${lot.zoneMap ? `names ${lot.zoneMap}` : "names no district"} at the inventory point, not the inventory's ${lot.zone || "district"}. Ask zoning staff which district governs before filing; everything below assumes the inventory district.`,
      ]
    : [];

  if (verdict === "by-right") {
    steps.push({
      id: "zoning",
      title: disputed ? "Zoning review: confirm the district first" : "Zoning review",
      body: [
        ...districtLead,
        `File a Building and Development Application (BDA) on OneStopPGH after you own the lot. Under ${disputed ? "the inventory district" : "the checks we ran"} the proposal is ${BY_RIGHT_SCOPE}; zoning staff review decides whether any approval is needed.`,
        ...(rsNote ? [rsNote] : []),
      ],
      chips: [
        { label: "Base zoning review fees", tone: "fee" },
        { label: "OneStopPGH", tone: "place" },
      ],
    });
  } else if (adminOnly) {
    steps.push({
      id: "zoning",
      title: disputed ? "Zoning review: confirm the district first" : "Zoning review: Administrator Exception",
      body: [
        ...districtLead,
        ADMIN_PATH,
        "File a Building and Development Application (BDA) on OneStopPGH; staff confirm the review path.",
        ...(rsNote ? [rsNote] : []),
      ],
      chips: [
        { label: "Base zoning review fees", tone: "fee" },
        { label: "OneStopPGH", tone: "place" },
      ],
    });
  } else {
    const body: string[] = [...districtLead];
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
    const failed = failingDimensional(finding);
    for (const c of failed) body.push(reliefNeeded(c));
    if (failed.some((c) => LOT_STANDARDS.has(c.id))) body.push(DIM_PATH);
    if (letter === "S") body.push(SPECIAL_PATH);
    if (letter === "A") body.push("The use also needs an Administrator Exception under § 922.08; staff confirm how the two reviews combine.");
    body.push("File a BDA on OneStopPGH; staff determine whether a Zoning Board of Adjustment hearing is required and schedule it.");
    body.push(
      "If there is a hearing: hang the notice poster on the property at least 21 days before it, readable from the primary street, and photograph it on the day you post it.",
      "Hearings are the first three Thursdays of the month, in the basement hearing room of 412 Boulevard of the Allies (in person or Zoom).",
      "The Board decides within 45 days after the record closes. The decision expires one year after mailing; get a permit and start construction within that year.",
      "If the lot is inside a Registered Community Organization's boundaries, a Development Activities Meeting may be required at least 30 days before the hearing.",
    );
    if (rsNote) body.push(rsNote);
    steps.push({
      id: "zoning",
      title: disputed
        ? "Zoning review: confirm the district first"
        : letter === "S" && !dimsFail
          ? "Zoning review: Special Exception hearing"
          : "Zoning review: relief needed",
      body,
      chips: [
        { label: "$400 ZBA fee if heard + base zoning fees", tone: "fee" },
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
            : `Council's pending bill would change this to "${verdictLabel(bill)}"; consider timing.`,
        ],
        chips: [{ label: "Pending in Council", tone: "warn" }],
      });
    }
  }

  const description = describe(lot, typology, zoneName, pf, comps);
  const blockLot = formatBlockLot(lot.id);
  // What the applicant would seek: every failed standard, then the use route. Derived, never a fixed list.
  const seek: string[] = failingDimensional(finding).map((c) => `${standardName(c)} (${c.citation.section})`);
  if (letter === "N") seek.push(`use variance (§ 922.09; use not listed, ${finding.checks.find((c) => c.id === "use")?.citation.section ?? "§ 911.02"})`);
  if (letter === "A") seek.push(`administrator exception (§ 922.08)${seek.length ? "" : ", decided by zoning staff"}`);
  if (letter === "S") seek.push(`special exception (§ 922.07)${seek.length ? "" : ", Zoning Board hearing"}`);
  const seekItems = seek.filter((x, i, a) => a.indexOf(x) === i);

  const purchaseForm: PrefilledField[] = [purchaseAddress(lot, comps?.zip ?? null),
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
      value: disputed ? DISTRICT_FIRST_ANSWER : needsRelief && seekItems.length ? `Yes: ${seekItems.join("; ")}` : BY_RIGHT_VARIANCE_ANSWER,
      who: "prefilled",
    },
    {
      label: "When will you apply for a permit (Approximately)?",
      value: PERMIT_TIMING_ANSWER,
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

  const variancePossible = dimsFail || letter === "N";
  const zba: ZbaDraft | null =
    needsRelief && !adminOnly
      ? {
          requestTypes: requestTypes(finding),
          sections: relief.map((c) => ({ text: reliefLine(c), url: c.citation.url })),
          criteria: VARIANCE_CRITERIA,
          findings: variancePossible ? worksheet(lot, finding, byRight, zoneName) : [],
          label: WORKSHEET_LABEL,
          note: !variancePossible
            ? "Special exceptions are decided under § 922.07 criteria, not the § 922.09.E variance conditions; ask staff for the criteria that apply."
            : failingDimensional(finding).some((c) => LOT_STANDARDS.has(c.id))
              ? `These § 922.09.E questions apply if staff route this as a variance. Whether ${NONCONFORMING_LOTS.section} (nonconforming lots) applies instead depends on the lot's ownership and vacancy history; answer those questions under criterion 1. This is an eligibility investigation, not an assurance that the exception applies.`
              : dimsFail
                ? "These § 922.09.E questions apply if you seek a variance rather than reducing the building to the permitted size."
                : undefined,
        }
      : null;

  const attachments: string[] = ["Site plan detailing the proposal", "Photographs of the property"];
  if (zba) {
    attachments.push(
      "Photo of the posted notice showing its location on the property",
      "Names and mailing addresses of at least 6 nearest property owners, including all abutting owners and those across the street, from Allegheny County records (§ 922.09.C)",
      "Evidence for each approval criterion (answer the questions in the ZBA review worksheet)",
    );
  }
  attachments.push(
    "Proof of authorization, if you are not the owner when you file",
    "Jordan Tax Services (JTS) certification, if you are on a payment plan",
  );

  const sources: { title: string; url: string }[] =
    channel === "ura" ? [SOURCE.uraContact, SOURCE.landBank] : [SOURCE.purchaseForm, SOURCE.landBank];
  if (failingDimensional(finding).some((c) => LOT_STANDARDS.has(c.id)))
    sources.push({ title: `${NONCONFORMING_LOTS.section} ${NONCONFORMING_LOTS.title}`, url: NONCONFORMING_LOTS.url });
  if (zba)
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
    verdictLabel: verdictLabel(finding),
    ruleSet,
    banner: NEVER_SUBMITS,
    steps,
    purchaseForm,
    description,
    acquisition: channel,
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
  L.push(`Parcel ${plan.lotId}. Proposed: ${TYPOLOGY_LABEL[plan.typology]} (${plan.verdictLabel}${plan.ruleSet === "bill-2025-1545" ? ", if Bill 2025-1545 passes" : ", today's code"}).`);
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
  if (plan.acquisition === "ura") L.push("_This lot is listed for transfer to the URA; the City form below is for reference only._\n");
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
    L.push(`## ${plan.zba.label}`);
    L.push("");
    L.push("_Questions and evidence prompts, not a completed justification. The record lines are public-record facts; everything else is yours to establish._");
    L.push("");
    L.push(`- **Request type:** ${plan.zba.requestTypes.join("; ")}`);
    L.push("- **Sections from which relief is requested:**");
    for (const s of plan.zba.sections) L.push(`  - [${s.text}](${s.url})`);
    L.push("");
    L.push(`### Criteria (${plan.zba.criteria.section}, ${plan.zba.criteria.title}; mirrors ${plan.zba.criteria.mirrors})`);
    if (plan.zba.note) L.push(`_${plan.zba.note}_`);
    for (const f of plan.zba.findings) {
      L.push("");
      L.push(`**${f.n}. ${f.title}**`);
      L.push("");
      L.push("What the record shows:");
      for (const r of f.record) L.push(`- ${r}`);
      L.push("");
      L.push("What you must establish:");
      for (const q of f.establish) L.push(`- [ ] ${q}`);
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
