import type { Comps, CompsFile, Lot, Typology } from "./types";

/*
 * Screening pro forma: "does it pencil?" for one typology on one lot.
 * Pure functions only. Costs come from editable assumptions calibrated to Pittsburgh
 * evidence (docs/comps-and-proforma.md); revenue comes from Zillow comps (public/data/comps.json).
 */

export type RevenueMode = "sale" | "rent";

export interface FinanceAssumptions {
  /** Hard construction cost, $ per gross sf. Assumption for small wood-frame infill. */
  hardCostPerSf: number;
  /** Soft costs (professional fees, construction loan fees, holding, other) as % of hard cost. */
  softCostPct: number;
  /** Developer fee + overhead as % of hard cost. */
  devFeePct: number;
  /** Land cost override in $. null uses the county assessed land value. */
  landOverride: number | null;
  /** Land cost used when the lot has no assessed value and no override. */
  defaultLand: number;
  mode: RevenueMode;
  /** Size of the "typical home" ZHVI describes; sale value is scaled by unit sf / this. */
  typicalHomeSf: number;
  /** Cap rate, % (rent mode). */
  capRate: number;
  /** Operating expenses + vacancy as % of gross rent (rent mode). */
  opexPct: number;
  /** Required margin over total cost, % of cost, for a deal to pencil. */
  targetMarginPct: number;
}

export const DEFAULT_FINANCE: FinanceAssumptions = {
  hardCostPerSf: 185,
  softCostPct: 22,
  devFeePct: 13,
  landOverride: null,
  defaultLand: 5000,
  mode: "sale",
  typicalHomeSf: 1400,
  capRate: 7,
  opexPct: 35,
  targetMarginPct: 10,
};

export const SALE_SCALE_MIN = 0.6;
export const SALE_SCALE_MAX = 1.3;

export const UNIT_PLAN: Record<Typology, { units: number; sfPerUnit: number; note: string }> = {
  single: { units: 1, sfPerUnit: 1200, note: "1 × 1,200 sf" },
  single_adu: { units: 2, sfPerUnit: 900, note: "1,200 sf + 600 sf ADU" },
  duplex: { units: 2, sfPerUnit: 950, note: "2 × 950 sf" },
  triplex: { units: 3, sfPerUnit: 850, note: "3 × 850 sf" },
  townhome: { units: 1, sfPerUnit: 1400, note: "1 × 1,400 sf" },
};

/** How each typology is sold: an ADU is sold with its house, so single_adu is one 1,800 sf sale. */
const SALE_PLAN: Record<Typology, { saleUnits: number; sfPerSale: number }> = {
  single: { saleUnits: 1, sfPerSale: 1200 },
  single_adu: { saleUnits: 1, sfPerSale: 1800 },
  duplex: { saleUnits: 2, sfPerSale: 950 },
  triplex: { saleUnits: 3, sfPerSale: 850 },
  townhome: { saleUnits: 1, sfPerSale: 1400 },
};

export function buildingSf(typology: Typology): number {
  const plan = UNIT_PLAN[typology];
  return typology === "single_adu" ? 1800 : plan.units * plan.sfPerUnit;
}

export const ZILLOW_DATA_URL = "https://www.zillow.com/research/data/";
export const ASSESSMENTS_URL = "https://data.wprdc.org/dataset/property-assessments";
export const SIXTH_WARD_SOURCE =
  "Action Housing, Sixth Ward Flats development budget (35 LIHTC units, $16.4M), presented to Pro-Housing Pittsburgh";

/**
 * Sixth Ward Flats (Action Housing, 35 LIHTC units, $16.4M total), shares of total development cost.
 * The default soft cost and developer fee are derived from these; see docs/comps-and-proforma.md.
 */
export const SIXTH_WARD_BENCHMARK = {
  totalCost: 16_400_000,
  units: 35,
  usesPct: {
    construction: 67,
    land: 3,
    professionalFees: 5,
    syndication: 1,
    constructionLoanFees: 4,
    holdingAndLeaseUp: 2,
    reserves: 5,
    developerFeeAndOverhead: 9,
    other: 4,
  },
  sourcesPct: {
    taxCreditEquity: 71,
    ura: 9,
    phfaPhare: 8,
    ahp: 1,
    sponsorLoan: 6,
    deferredDeveloperFee: 4,
  },
  note:
    "A typical affordable deal is mostly subsidy: in Sixth Ward Flats, tax-credit equity alone is 71% of sources, and with URA, PHFA PHARE and FHLB AHP grants 89% of the budget is equity or public money. Only the sponsor loan and deferred fee (10%) are repaid from the project.",
} as const;

export interface InputUsed {
  key: string;
  label: string;
  value: number;
  display: string;
  source: string;
  url?: string;
  /** true when the number is an editable assumption rather than observed data. */
  assumed: boolean;
  /** Data month for observed comps. */
  date?: string | null;
}

export type LandSource = "override" | "assessed" | "default";

export interface Proforma {
  typology: Typology;
  mode: RevenueMode;
  units: number;
  buildingSf: number;
  land: number;
  landSource: LandSource;
  landIsAssumed: boolean;
  hard: number;
  soft: number;
  devFee: number;
  totalCost: number;
  /** Sale proceeds (sale mode) or capitalized value (rent mode). */
  revenue: number;
  /** Gross annual rent, rent mode only. */
  grossAnnualRent: number | null;
  revenueNote: string;
  margin: number;
  marginPct: number;
  pencils: boolean;
  /** Subsidy needed to reach the target margin; 0 when the deal pencils. */
  gap: number;
  inputsUsed: InputUsed[];
}

/** Comps for one lot: neighborhood ZHVI and ZIP ZORI. null when the comps file is missing. */
export function compsForLot(lot: Lot, file: CompsFile | null): Comps | null {
  if (!file) return null;
  const zip = file.lotZip[lot.id] ?? null;
  const n = file.byNeighborhood[lot.neighborhood];
  const z = zip ? file.byZip[zip] : undefined;
  return {
    neighborhood: lot.neighborhood,
    zip,
    zhvi: n?.zhvi ?? null,
    zhviDate: n?.zhviDate ?? null,
    zori: z?.zori ?? null,
    zoriDate: z?.zoriDate ?? null,
  };
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const month = (d: string | null) => (d ? d.slice(0, 7) : "latest");

export function saleScale(sf: number, typicalHomeSf: number): number {
  return clamp(sf / typicalHomeSf, SALE_SCALE_MIN, SALE_SCALE_MAX);
}

interface CostStack {
  buildingSf: number;
  land: number;
  landSource: LandSource;
  hard: number;
  soft: number;
  devFee: number;
  totalCost: number;
}

function costStack(
  typology: Typology,
  landValue: number | null,
  a: Pick<FinanceAssumptions, "hardCostPerSf" | "softCostPct" | "devFeePct" | "landOverride" | "defaultLand">,
): CostStack {
  const sf = buildingSf(typology);
  const landSource: LandSource = a.landOverride != null ? "override" : landValue != null ? "assessed" : "default";
  const land = a.landOverride ?? landValue ?? a.defaultLand;
  const hard = sf * a.hardCostPerSf;
  const soft = hard * (a.softCostPct / 100);
  const devFee = hard * (a.devFeePct / 100);
  return { buildingSf: sf, land, landSource, hard, soft, devFee, totalCost: land + hard + soft + devFee };
}

/**
 * Pro forma for one typology on one lot. Returns null when comps are missing, or when the
 * comp the chosen revenue mode needs (ZHVI for sale, ZORI for rent) is unavailable.
 */
export function runProforma(
  lot: Lot,
  typology: Typology,
  comps: Comps | null,
  assumptions: Partial<FinanceAssumptions> = {},
): Proforma | null {
  const a = { ...DEFAULT_FINANCE, ...assumptions };
  if (!comps) return null;
  const plan = UNIT_PLAN[typology];
  const c = costStack(typology, lot.landValue, a);

  const inputs: InputUsed[] = [
    {
      key: "land",
      label: "Land",
      value: c.land,
      display: fmtUsd(c.land),
      source:
        c.landSource === "override"
          ? "User override"
          : c.landSource === "assessed"
            ? "Allegheny County assessed land value (FAIRMARKETLAND, 2012 base year; not market value)"
            : "Default land cost; lot has no assessed land value",
      url: c.landSource === "assessed" ? ASSESSMENTS_URL : undefined,
      assumed: c.landSource !== "assessed",
    },
    {
      key: "hardCostPerSf",
      label: "Hard cost per sf",
      value: a.hardCostPerSf,
      display: `${fmtUsd(a.hardCostPerSf)}/sf × ${fmtNum(c.buildingSf)} sf`,
      source: "Assumption for small wood-frame infill in Pittsburgh; editable",
      assumed: true,
    },
    {
      key: "softCostPct",
      label: "Soft cost",
      value: a.softCostPct,
      display: `${a.softCostPct}% of hard`,
      source: `${SIXTH_WARD_SOURCE}: professional fees, loan fees, holding and other are 15% of total cost, 22% of hard`,
      assumed: true,
    },
    {
      key: "devFeePct",
      label: "Developer fee + overhead",
      value: a.devFeePct,
      display: `${a.devFeePct}% of hard`,
      source: `${SIXTH_WARD_SOURCE}: 9% of total cost, 13% of hard`,
      assumed: true,
    },
  ];

  let revenue: number;
  let grossAnnualRent: number | null = null;
  let revenueNote: string;
  if (a.mode === "sale") {
    if (comps.zhvi == null) return null;
    const { saleUnits, sfPerSale } = SALE_PLAN[typology];
    const scale = saleScale(sfPerSale, a.typicalHomeSf);
    const perUnit = comps.zhvi * scale;
    revenue = perUnit * saleUnits;
    revenueNote = `${saleUnits} × ${fmtUsd(perUnit)} (${comps.neighborhood} ZHVI ${fmtUsd(comps.zhvi)} × ${scale.toFixed(2)} size scale)${
      typology === "single_adu" ? "; ADU sold with the house" : ""
    }`;
    inputs.push(
      {
        key: "zhvi",
        label: `Typical home value, ${comps.neighborhood}`,
        value: comps.zhvi,
        display: fmtUsd(comps.zhvi),
        source: `Zillow Home Value Index (mid tier, smoothed, seasonally adjusted), ${month(comps.zhviDate)}`,
        url: ZILLOW_DATA_URL,
        assumed: false,
        date: comps.zhviDate,
      },
      {
        key: "saleScale",
        label: "Size scale",
        value: scale,
        display: `${fmtNum(sfPerSale)} sf ÷ ${fmtNum(a.typicalHomeSf)} sf typical home = ${scale.toFixed(2)} (clamped ${SALE_SCALE_MIN}–${SALE_SCALE_MAX})`,
        source: "Assumption: sale price scales with unit size relative to a typical home",
        assumed: true,
      },
    );
  } else {
    if (comps.zori == null) return null;
    grossAnnualRent = comps.zori * 12 * plan.units;
    const noi = grossAnnualRent * (1 - a.opexPct / 100);
    revenue = noi / (a.capRate / 100);
    revenueNote = `${plan.units} × ${fmtUsd(comps.zori)}/mo ZIP ${comps.zip} rent = ${fmtUsd(grossAnnualRent)}/yr gross, less ${a.opexPct}% opex, capitalized at ${a.capRate}%`;
    inputs.push(
      {
        key: "zori",
        label: `Typical rent, ZIP ${comps.zip}`,
        value: comps.zori,
        display: `${fmtUsd(comps.zori)}/mo per unit`,
        source: `Zillow Observed Rent Index (all homes plus multifamily, smoothed), ${month(comps.zoriDate)}`,
        url: ZILLOW_DATA_URL,
        assumed: false,
        date: comps.zoriDate,
      },
      {
        key: "opexPct",
        label: "Operating expenses + vacancy",
        value: a.opexPct,
        display: `${a.opexPct}% of gross rent`,
        source: "Assumption; editable",
        assumed: true,
      },
      {
        key: "capRate",
        label: "Cap rate",
        value: a.capRate,
        display: `${a.capRate}%`,
        source: "Assumption for small multifamily; editable",
        assumed: true,
      },
    );
  }
  inputs.push({
    key: "targetMarginPct",
    label: "Required margin",
    value: a.targetMarginPct,
    display: `${a.targetMarginPct}% of total cost`,
    source: "Assumption: builder return needed to take the risk; editable",
    assumed: true,
  });

  const margin = revenue - c.totalCost;
  const required = c.totalCost * (a.targetMarginPct / 100);
  const pencils = margin >= required;
  return {
    typology,
    mode: a.mode,
    units: plan.units,
    ...c,
    landIsAssumed: c.landSource !== "assessed",
    revenue,
    grossAnnualRent,
    revenueNote,
    margin,
    marginPct: c.totalCost > 0 ? (margin / c.totalCost) * 100 : 0,
    pencils,
    gap: pencils ? 0 : required - margin,
    inputsUsed: inputs,
  };
}

/* ---------- Legacy API (affordable sale at AMI / HUD FMR). Kept for existing UI callers. ---------- */

export interface ProformaAssumptions {
  hardCostPerSf: number;
  softCostPct: number;
  amiIncome: number;
  incomeMultiple: number;
  fmrMonthly: number;
  capRate: number;
  defaultLand: number;
}

export const DEFAULT_ASSUMPTIONS: ProformaAssumptions = {
  hardCostPerSf: DEFAULT_FINANCE.hardCostPerSf,
  softCostPct: DEFAULT_FINANCE.softCostPct,
  amiIncome: 75000,
  incomeMultiple: 3.5,
  fmrMonthly: 1300,
  capRate: DEFAULT_FINANCE.capRate,
  defaultLand: DEFAULT_FINANCE.defaultLand,
};

export interface ProformaResult {
  buildingSf: number;
  units: number;
  land: number;
  landIsAssumed: boolean;
  hard: number;
  soft: number;
  totalCost: number;
  revenue: number;
  revenueNote: string;
  gap: number;
}

export function computeProforma(
  typology: Typology,
  landValue: number | null,
  a: ProformaAssumptions,
  mode: RevenueMode,
): ProformaResult {
  const plan = UNIT_PLAN[typology];
  const c = costStack(typology, landValue, { ...a, devFeePct: 0, landOverride: null });
  let revenue: number;
  let revenueNote: string;
  if (mode === "sale") {
    const perUnit = a.amiIncome * a.incomeMultiple;
    const saleUnits = SALE_PLAN[typology].saleUnits;
    revenue = perUnit * saleUnits;
    revenueNote =
      typology === "single_adu"
        ? `${fmtUsd(perUnit)} affordable sale price; ADU sold with the house`
        : `${saleUnits} × ${fmtUsd(perUnit)} affordable sale price`;
  } else {
    const annual = a.fmrMonthly * 12 * plan.units;
    revenue = annual / (a.capRate / 100);
    revenueNote = `${plan.units} × ${fmtUsd(a.fmrMonthly)}/mo FMR, capitalized at ${a.capRate}%`;
  }
  return {
    buildingSf: c.buildingSf,
    units: plan.units,
    land: c.land,
    landIsAssumed: landValue == null,
    hard: c.hard,
    soft: c.soft,
    totalCost: c.totalCost,
    revenue,
    revenueNote,
    gap: revenue - c.totalCost,
  };
}

// One shared formatter: Number#toLocaleString builds a new Intl.NumberFormat per call, which made
// the city-wide triage (tens of thousands of pro formas) roughly 25x slower in Chrome.
const NUM = new Intl.NumberFormat("en-US");

/** Same output as n.toLocaleString("en-US"). */
export function fmtNum(n: number): string {
  return NUM.format(n);
}

export function fmtUsd(n: number): string {
  const sign = n < 0 ? "−" : "";
  return `${sign}$${NUM.format(Math.round(Math.abs(n)))}`;
}
