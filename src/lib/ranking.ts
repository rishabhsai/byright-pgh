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
  if (isAvailable(lot)) s += 1;
  return s;
}

export function compareRanked(
  a: { score: number; lot: Lot },
  b: { score: number; lot: Lot },
): number {
  if (b.score !== a.score) return b.score - a.score;
  return (b.lot.lotAreaSqFt ?? 0) - (a.lot.lotAreaSqFt ?? 0);
}

export interface TriageRanked {
  score: number;
  lot: Lot;
  triage: Triage;
  /** Margin in dollars for the best home type; null when finance was not assessed. */
  margin: number | null;
  /** The ranked proposal (or any home type, with no Home type filter) is allowed by right. */
  byRight: boolean;
  /** Modeled shortfall to the target return; 0 when it pencils, null when finance was not assessed. */
  gap: number | null;
}

export const AVAILABLE_FOR_SALE = "Available for Sale";

export const isAvailable = (lot: Pick<Lot, "status">) => lot.status === AVAILABLE_FOR_SALE;

/** Any slope, undermining or flood flag at the inventory point (missing flood data is not a flag). */
export const hasHazardFlag = (lot: Lot) => lot.hazards.steepSlope || lot.hazards.undermined || lot.hazards.floodZone === true;

/** Inventory types that are never disposition candidates; hidden from the default view. */
export const PARK_TYPES = ["Park", "Greenway", "Legislated Greenway", "Infrastructure Protection"] as const;
const PARK_SET = new Set<string>(PARK_TYPES);
export const isParkOrGreenway = (inventoryType: string) => PARK_SET.has(inventoryType);

export const PRIVATELY_OWNED = "Privately Owned";

/**
 * The one disposition-eligibility policy (plan candidates, ranking, Green): the record is not a
 * protected-purpose inventory type (park, greenway, legislated greenway, infrastructure protection) and
 * not marked Privately Owned. Ineligible records stay searchable and exportable; they never enter the
 * housing candidate cohort or the shortfall total. Recorded availability is a separate test (isAvailable).
 */
export function isDispositionEligible(lot: Pick<Lot, "status" | "inventoryType">): boolean {
  return !isParkOrGreenway(lot.inventoryType) && lot.status.trim().toLowerCase() !== PRIVATELY_OWNED.toLowerCase();
}

export const STATUS_GROUPS = ["Available for Sale", "Sale Pending", "Hold for Study", "Permanent City Ownership", "other"] as const;
export type StatusGroup = (typeof STATUS_GROUPS)[number];

/** Status filter bucket; the inventory spells Hold for Study two ways. */
export function statusGroup(status: string): StatusGroup {
  const s = status.trim().toLowerCase();
  const hit = STATUS_GROUPS.find((g) => g !== "other" && g.toLowerCase() === s);
  return hit ?? "other";
}

const MIN_READY_SQFT = 1000;

/**
 * Disposition order: eligible (isDispositionEligible), then available for sale, then by right, then no hazard flag, then at least 1,000 sf,
 * then lowest modeled shortfall (unassessed last), then score, then lot area.
 */
export function compareTriageRanked(a: TriageRanked, b: TriageRanked): number {
  const keys = (r: TriageRanked) => [
    isDispositionEligible(r.lot) ? 0 : 1,
    isAvailable(r.lot) ? 0 : 1,
    r.byRight ? 0 : 1,
    hasHazardFlag(r.lot) ? 1 : 0,
    (r.lot.lotAreaSqFt ?? 0) >= MIN_READY_SQFT ? 0 : 1,
  ];
  const ka = keys(a);
  const kb = keys(b);
  for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
  const ag = a.gap ?? Infinity;
  const bg = b.gap ?? Infinity;
  if (ag !== bg) return ag < bg ? -1 : 1;
  if (b.score !== a.score) return b.score - a.score;
  return (b.lot.lotAreaSqFt ?? 0) - (a.lot.lotAreaSqFt ?? 0);
}
