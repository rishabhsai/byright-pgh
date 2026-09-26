import type { Typology } from "./types";

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
  hardCostPerSf: 185,
  softCostPct: 20,
  amiIncome: 75000,
  incomeMultiple: 3.5,
  fmrMonthly: 1300,
  capRate: 7,
  defaultLand: 5000,
};

export const UNIT_PLAN: Record<Typology, { units: number; sfPerUnit: number; note: string }> = {
  single: { units: 1, sfPerUnit: 1200, note: "1 × 1,200 sf" },
  single_adu: { units: 2, sfPerUnit: 900, note: "1,200 sf + 600 sf ADU" },
  duplex: { units: 2, sfPerUnit: 950, note: "2 × 950 sf" },
  triplex: { units: 3, sfPerUnit: 850, note: "3 × 850 sf" },
  townhome: { units: 1, sfPerUnit: 1400, note: "1 × 1,400 sf" },
};

export type RevenueMode = "sale" | "rent";

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
  const buildingSf = typology === "single_adu" ? 1800 : plan.units * plan.sfPerUnit;
  const land = landValue ?? a.defaultLand;
  const hard = buildingSf * a.hardCostPerSf;
  const soft = hard * (a.softCostPct / 100);
  const totalCost = land + hard + soft;
  let revenue: number;
  let revenueNote: string;
  if (mode === "sale") {
    const perUnit = a.amiIncome * a.incomeMultiple;
    const saleUnits = typology === "single_adu" ? 1 : plan.units;
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
    buildingSf,
    units: plan.units,
    land,
    landIsAssumed: landValue == null,
    hard,
    soft,
    totalCost,
    revenue,
    revenueNote,
    gap: revenue - totalCost,
  };
}

export function fmtUsd(n: number): string {
  const sign = n < 0 ? "−" : "";
  return `${sign}$${Math.round(Math.abs(n)).toLocaleString("en-US")}`;
}
