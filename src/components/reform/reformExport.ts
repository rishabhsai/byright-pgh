import { todayET } from "@/lib/dates";
import type { LeverResult, RuleParams, SubKey } from "./engine";

const cell = (v: string | number | boolean) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const fmt = (n: number) => n.toLocaleString("en-US");
const signed = (n: number) => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(Math.abs(n))}` : "±0");

/** Gained, lost and net against today for one count: net = scenario total − today's total = gained − lost. */
export interface Change {
  gained: number;
  lost: number;
  net: number;
}

/** "587 gained · 589 lost · net −2". */
export const changeText = (c: Change) => `${fmt(c.gained)} gained · ${fmt(c.lost)} lost · net ${signed(c.net)}`;

/** A lever's lot and candidate changes against today. Candidates lost is derived: gained − net. */
export function leverChanges(r: LeverResult, today: { allowed: number; candidates: number }): { lots: Change; candidates: Change } {
  const lotsNet = r.publicLotsAllowed - today.allowed;
  const candNet = r.candidates - today.candidates;
  return {
    lots: { gained: r.publicLotsNewlyAllowed, lost: r.publicLotsNoLongerAllowed, net: lotsNet },
    candidates: { gained: r.candidatesNewly, lost: r.candidatesNewly - candNet, net: candNet },
  };
}

/** A lot's outcome under one column's rules: at least one home type allowed, and a candidate for staff review. */
export interface LotOutcome {
  allowed: boolean;
  candidate: boolean;
}

export interface ScenarioMeta {
  /** The active scenario's preset id, or "custom". */
  presetId: string;
  params: RuleParams;
  generatedAt: Date;
}

/** "2026-09-27 06:10 ET". */
export function stampET(d: Date): string {
  const t = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  return `${todayET(d)} ${t} ET`;
}

const METRICS = ["allowed", "lots_gained", "lots_lost", "lots_net", "candidates", "candidates_gained", "candidates_lost", "candidates_net"] as const;

/**
 * Neighborhood × lever: per lever, allowed and candidates with gained, lost and net against today, one row
 * per neighborhood, then a citywide total. Built from per-lot screens (every neighborhood), not from the
 * engine's top-10 aggregates. Every row carries the active scenario's id, rules, time and hypothetical=true,
 * so a detached file still says what it is.
 */
export function scenarioCsv(lots: { neighborhood: string }[], columns: { label: string; lots: ArrayLike<LotOutcome> }[], base: ArrayLike<LotOutcome>, meta: ScenarioMeta): string {
  const names = [...new Set(lots.map((l) => l.neighborhood || "(no neighborhood)"))].sort((a, b) => a.localeCompare(b));
  const at = new Map(names.map((n, k) => [n, k]));
  const zero = () => METRICS.map(() => 0);
  const cells = columns.map(() => names.map(zero));
  const total = columns.map(zero);
  const bump = (row: number[], now: LotOutcome, then: LotOutcome) => {
    const a = +now.allowed - +then.allowed;
    const c = +now.candidate - +then.candidate;
    row[0] += +now.allowed;
    row[1] += +(a > 0);
    row[2] += +(a < 0);
    row[3] += a;
    row[4] += +now.candidate;
    row[5] += +(c > 0);
    row[6] += +(c < 0);
    row[7] += c;
  };
  lots.forEach((l, i) => {
    const k = at.get(l.neighborhood || "(no neighborhood)")!;
    columns.forEach((col, j) => {
      bump(cells[j][k], col.lots[i], base[i]);
      bump(total[j], col.lots[i], base[i]);
    });
  });
  const tail = [meta.presetId, paramsLine(meta.params), stampET(meta.generatedAt), true];
  const header = ["neighborhood", ...columns.flatMap((c) => METRICS.map((m) => `${c.label}: ${m}`)), "scenario_preset_id", "scenario_params", "generated_at_et", "hypothetical"];
  const body = names.map((n, k) => [n, ...columns.flatMap((_, j) => cells[j][k]), ...tail]);
  return [header, ...body, ["Citywide", ...total.flat(), ...tail]].map((r) => r.map(cell).join(",")).join("\n") + "\n";
}

const SUBS: SubKey[] = ["VL", "L", "M", "H", "VH"];
const sf = (v: number | null) => (v == null ? "none" : `${v.toLocaleString("en-US")} sf`);
const yes = (b: boolean) => (b ? "yes" : "no");

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

/** "House + backyard unit +3,619 · Duplex +2,128", nonzero types only; null when no home type changes. */
export function typologyText(r: LeverResult, labels: Record<string, string>): string | null {
  const parts = Object.entries(r.typologyDelta)
    .filter(([, n]) => n !== 0)
    .map(([t, n]) => `${labels[t] ?? t} ${signed(n)}`);
  return parts.length ? parts.join(" · ") : null;
}

/** "687 → 0", or "687 (unchanged)". */
export const parkingText = (now: number, today: number) => (now === today ? `${fmt(now)} (unchanged)` : `${fmt(today)} → ${fmt(now)}`);

export function scenarioSummary(
  r: LeverResult,
  p: RuleParams,
  total: number,
  hardCostPerSf: number,
  url: string,
  today: { allowed: number; candidates: number; parkingUnresolved: number },
  typeLabels: Record<string, string>,
): string {
  const ch = leverChanges(r, today);
  const top = [...r.byNeighborhood]
    .filter((h) => h.newlyAllowed > 0)
    .sort((a, b) => b.newlyAllowed - a.newlyAllowed)
    .slice(0, 5)
    .map((h) => `${h.name} ${signed(h.newlyAllowed)}`);
  const types = typologyText(r, typeLabels);
  return [
    `ByRight PGH, Reform scenario (hypothetical): ${r.label}`,
    `Rules: ${paramsLine(p)}.`,
    `${fmt(r.publicLotsAllowed)} of ${fmt(total)} City lots pass the use-table and lot-size screen (${changeText(ch.lots)} vs today's ${fmt(today.allowed)}); ${fmt(r.candidates)} candidates for staff review (${changeText(ch.candidates)} vs today's ${fmt(today.candidates)}); ${fmt(r.clearingCostScreen)} clear the cost screen at $${hardCostPerSf}/sf.`,
    `Home-type options: ${types ?? "no change"}. Parking to verify: ${parkingText(r.parkingUnresolved, today.parkingUnresolved)}.`,
    top.length ? `Newly allowed lots by neighborhood: ${top.join(", ")}.` : "No neighborhood gains a lot under this scenario.",
    "Allowed means the use table, minimum lot size and LNC FAR; setbacks and height are not modeled. Hypothetical; not a proposal.",
    url,
  ].join("\n");
}
