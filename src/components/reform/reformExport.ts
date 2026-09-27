import type { LeverResult, RuleParams, SubKey } from "./engine";

const cell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * Neighborhood × lever: allowed and newly allowed per lever, one row per neighborhood, then a citywide total.
 * Built from per-lot screens (every neighborhood), not from the engine's top-10 aggregates.
 */
export function scenarioCsv(
  lots: { neighborhood: string }[],
  columns: { label: string; allowed: ArrayLike<boolean> }[],
  base: ArrayLike<boolean>,
): string {
  const names = [...new Set(lots.map((l) => l.neighborhood || "(no neighborhood)"))].sort((a, b) => a.localeCompare(b));
  const at = new Map(names.map((n, k) => [n, k]));
  const cells = columns.map(() => names.map(() => [0, 0]));
  const total = columns.map(() => [0, 0]);
  lots.forEach((l, i) => {
    const k = at.get(l.neighborhood || "(no neighborhood)")!;
    columns.forEach((c, j) => {
      if (!c.allowed[i]) return;
      const gained = base[i] ? 0 : 1;
      cells[j][k][0]++;
      cells[j][k][1] += gained;
      total[j][0]++;
      total[j][1] += gained;
    });
  });
  const header = ["neighborhood", ...columns.flatMap((c) => [`${c.label}: allowed`, `${c.label}: +vs today`])];
  const body = names.map((n, k) => [n, ...columns.flatMap((_, j) => cells[j][k])]);
  return [header, ...body, ["Citywide", ...total.flat()]].map((r) => r.map(cell).join(",")).join("\n") + "\n";
}

const SUBS: SubKey[] = ["VL", "L", "M", "H", "VH"];
const sf = (v: number | null) => (v == null ? "none" : `${v.toLocaleString("en-US")} sf`);
const yes = (b: boolean) => (b ? "yes" : "no");
const signed = (n: number) => (n > 0 ? `+${n.toLocaleString("en-US")}` : n < 0 ? `−${Math.abs(n).toLocaleString("en-US")}` : "±0");

export function paramsLine(p: RuleParams): string {
  return [
    `minimum lot ${SUBS.map((k) => `${k} ${sf(p.minLotArea[k])}`).join(", ")}`,
    `hillside ${sf(p.hillsideMinLot)}`,
    `R1D attached width cap ${p.r1dAttachedWidthCap} ft`,
    `two-unit in R1 ${yes(p.twoUnitInR1)}`,
    `three-unit in R2 ${yes(p.threeUnitInR2)}`,
    `ADUs by right ${yes(p.aduByRight)}`,
    `parking minimums ${yes(p.parkingMinimums)}`,
  ].join("; ");
}

export function scenarioSummary(r: LeverResult, p: RuleParams, total: number, hardCostPerSf: number, url: string): string {
  const top = [...r.byNeighborhood]
    .filter((h) => h.newlyAllowed > 0)
    .sort((a, b) => b.newlyAllowed - a.newlyAllowed)
    .slice(0, 5)
    .map((h) => `${h.name} ${signed(h.newlyAllowed)}`);
  return [
    `ByRight PGH, Reform scenario: ${r.label}`,
    `Rules: ${paramsLine(p)}.`,
    `${r.publicLotsAllowed.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} City lots pass the use-table and lot-size screen (${signed(r.publicLotsNewlyAllowed)} vs today); ${r.candidates.toLocaleString("en-US")} candidates for staff review (${signed(r.candidatesNewly)}); ${r.clearingCostScreen.toLocaleString("en-US")} clear the cost screen at $${hardCostPerSf}/sf.`,
    top.length ? `Where it moves: ${top.join(", ")}.` : "No neighborhood gains a lot under this scenario.",
    "Allowed means the use table, minimum lot size and LNC FAR; setbacks and height are not modeled. Hypothetical; not a proposal.",
    url,
  ].join("\n");
}
