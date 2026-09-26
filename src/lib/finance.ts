// Single import point for triage, the comps-driven pro forma, and comps.
import type { Comps, CompsFile, Lot, Triage, TriageResult } from "./types";
import { EMPTY_COMPS } from "./fixtures";
import { compsForLot, runProforma, DEFAULT_FINANCE, type FinanceAssumptions } from "./proforma";

export { triageLot } from "./triage";
export {
  runProforma,
  fmtUsd,
  DEFAULT_FINANCE,
  UNIT_PLAN,
  SIXTH_WARD_BENCHMARK,
  ZILLOW_DATA_URL,
  type FinanceAssumptions,
  type InputUsed,
  type Proforma,
  type RevenueMode,
} from "./proforma";

/** Comps used when /data/comps.json fails to load. */
export const FALLBACK_COMPS: CompsFile = EMPTY_COMPS;

/** Comps for a lot, or null when there is neither a neighborhood ZHVI nor a ZIP ZORI. */
export function compsFor(lot: Lot, file: CompsFile | null): Comps | null {
  const c = compsForLot(lot, file);
  return c && (c.zhvi != null || c.zori != null) ? c : null;
}

/** Counts over already-computed results (triage.ts's triageCounts re-evaluates every lot). */
export function countTriage(results: TriageResult[]): Record<Triage, number> {
  const c: Record<Triage, number> = { green: 0, yellow: 0, red: 0, gray: 0 };
  for (const r of results) c[r.triage]++;
  return c;
}

/** Dollar margin of the lot's best home type, or null when finance was not assessed. */
export function lotMargin(
  lot: Lot,
  t: TriageResult,
  comps: Comps | null,
  a: FinanceAssumptions = DEFAULT_FINANCE,
): number | null {
  if (!t.bestTypology) return null;
  return runProforma(lot, t.bestTypology, comps, a)?.margin ?? null;
}
