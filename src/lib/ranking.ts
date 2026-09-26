import type { Finding, Lot, Triage } from "./types";

export function scoreLot(lot: Lot, findings: Finding[]): number {
  let s = 0;
  for (const f of findings) {
    if (f.verdict === "by-right") s += 3;
    else if (f.verdict === "review") s += 1;
  }
  if (lot.hazards.steepSlope) s -= 2;
  if (lot.hazards.undermined) s -= 2;
  if (lot.hazards.floodZone) s -= 3;
  if (lot.status === "Available for Sale") s += 1;
  return s;
}

export function compareRanked(
  a: { score: number; lot: Lot },
  b: { score: number; lot: Lot },
): number {
  if (b.score !== a.score) return b.score - a.score;
  return (b.lot.lotAreaSqFt ?? 0) - (a.lot.lotAreaSqFt ?? 0);
}

const TRIAGE_RANK: Record<Triage, number> = { green: 0, yellow: 1, red: 2, gray: 3 };

export interface TriageRanked {
  score: number;
  lot: Lot;
  triage: Triage;
  /** Margin in dollars for the best home type; null when finance was not assessed. */
  margin: number | null;
}

/** Green first, then yellow, red, gray; within a color by score, then margin, then lot area. */
export function compareTriageRanked(a: TriageRanked, b: TriageRanked): number {
  const t = TRIAGE_RANK[a.triage] - TRIAGE_RANK[b.triage];
  if (t) return t;
  if (b.score !== a.score) return b.score - a.score;
  const am = a.margin ?? -Infinity;
  const bm = b.margin ?? -Infinity;
  if (am !== bm) return bm > am ? 1 : -1;
  return (b.lot.lotAreaSqFt ?? 0) - (a.lot.lotAreaSqFt ?? 0);
}
