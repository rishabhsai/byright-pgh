import type { Finding, Lot } from "./types";

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
