import type { LabelInput, Triage, Typology, Verdict } from "@/lib/types";
import { TRIAGE_LABEL, VERDICT_SHORT_LABEL, verdictShort } from "@/lib/types";
import { ALLOWED_TIP, nb, verdictLabel } from "./ui/answer";
import Tooltip from "./ui/Tooltip";
import { districtName } from "./district";

export const TYPOLOGIES: Typology[] = ["single", "single_adu", "duplex", "triplex", "townhome"];

export const TYPOLOGY_SHORT: Record<Typology, string> = {
  single: "House",
  single_adu: "House + backyard unit",
  duplex: "Duplex",
  triplex: "Triplex",
  townhome: "Townhouse",
};

export const VERDICT_COLOR: Record<Verdict, string> = {
  "by-right": "#16a34a",
  review: "#2563eb",
  variance: "#d97706",
  prohibited: "#e11d48",
  unknown: "#9ca3af",
};

/** Generic short labels (legend). For one finding use verdictShort(finding), which names the approval route. */
export const VERDICT_SHORT: Record<Verdict, string> = VERDICT_SHORT_LABEL;

/** The day the bill's status was last checked; shown as "status checked Sept 26, 2026". */
export const BILL_STATUS_CHECKED = "2026-09-26";

/** "Sept 26, 2026" from an ISO date, in AP month style. */
export function checkedDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const MONTH = [
    "Jan.",
    "Feb.",
    "March",
    "April",
    "May",
    "June",
    "July",
    "Aug.",
    "Sept",
    "Oct.",
    "Nov.",
    "Dec.",
  ];
  return `${MONTH[m - 1]} ${d}, ${y}`;
}

/** Plain-language glossary for the terms that have to stay (UX copy pass, cycle 1). */
export const TIP = {
  byRight: `${ALLOWED_TIP}. Staff zoning review still applies.`,
  review:
    "Administrator exception (§\u00a0922.08): zoning staff decide. Special exception (§\u00a0922.07): the Zoning Board of Adjustment decides after a hearing. Both apply written criteria.",
  hearing:
    "A size rule fails. Relief may be a dimensional variance (Zoning Board hearing) or, for a qualifying nonconforming lot, a §\u00a0921.04 exception; for floor area, a smaller building. Zoning staff determine the path.",
  notChecked:
    "ByRight only encodes residential, LNC and Hillside districts. Parks, industrial and downtown are out of scope.",
  adu: "ADU: accessory dwelling unit, a small second home on the same lot (garage apartment, cottage).",
  landValue: "The County's 2012-base assessment, not a market price.",
  frontage:
    "Parsed from the County legal description; approximate. A survey governs.",
  cityStatus:
    "The City's own recorded disposition status. 'Available for Sale' is a listing, not proof a sale can close; confirm with the City or URA.",
  bill: `Bill 2025-1545 (substitute, heard Sept 23, 2026): citywide ADUs, no parking minimums, affordable bonus. Not yet voted; status checked ${checkedDate(BILL_STATUS_CHECKED)}.`,
  capRate: "Yield a buyer expects from rent; lower means a higher value.",
} as const;

export const VERDICT_TIP: Record<Verdict, string | null> = {
  "by-right": TIP.byRight,
  review: TIP.review,
  variance: TIP.hearing,
  prohibited: null,
  unknown: TIP.notChecked,
};

/** "R1A-VH = single-unit attached residential, very-high density" */
export function zoneTip(zone: string): string | null {
  const name = districtName(zone);
  return name ? `${zone} = ${name.toLowerCase().replace("local neighborhood commercial", "neighborhood commercial")}` : null;
}

export const VERDICT_ORDER: Verdict[] = ["by-right", "review", "variance", "prohibited", "unknown"];

export function VerdictDot({ verdict, size = 8, title }: { verdict: Verdict; size?: number; title?: string }) {
  return (
    <span
      title={title}
      aria-label={title}
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, background: VERDICT_COLOR[verdict] }}
    />
  );
}

/** Text-safe shade of each verdict color. */
const VERDICT_INK: Record<Verdict, string> = {
  "by-right": "#15803d",
  review: "#1d4ed8",
  variance: "#b45309",
  prohibited: "#be123c",
  unknown: "#5d6762",
};

/** Pass `finding` so the chip names the approval route (staff vs Board approval, FAR vs lot-size relief). */
export function VerdictChip({ verdict, full = false, finding }: { verdict: Verdict; full?: boolean; finding?: LabelInput }) {
  const c = VERDICT_COLOR[verdict];
  const f: LabelInput = finding ?? { verdict };
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-medium whitespace-nowrap"
      style={{ background: `${c}14`, color: VERDICT_INK[verdict] }}
    >
      <VerdictDot verdict={verdict} size={6} />
      {full ? nb(verdictLabel(f)) : verdictShort(f)}
    </span>
  );
}

/** Chip text: the district code, spelled out where the code alone reads as blank (a lone "H" is Hillside). */
export function zoneLabel(zone: string): string {
  const z = zone.trim();
  if (!z) return "none";
  return z.length === 1 ? (districtName(z) ?? z) : z;
}

export function ZoneChip({ zone, tip = false }: { zone: string; tip?: boolean }) {
  const chip = (
    <span className="inline-flex shrink-0 items-center rounded border border-hairline bg-white px-1.5 py-px text-[11px] font-medium whitespace-nowrap text-ink">
      {zoneLabel(zone)}
    </span>
  );
  const t = tip ? zoneTip(zone) : null;
  return t ? <Tooltip content={t}>{chip}</Tooltip> : chip;
}

export function VerdictLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
      {VERDICT_ORDER.map((v) => (
        <span key={v} className="inline-flex items-center gap-1.5">
          <VerdictDot verdict={v} size={7} />
          {VERDICT_SHORT[v]}
        </span>
      ))}
    </div>
  );
}

export const TRIAGE_COLOR: Record<Triage, string> = {
  green: "#16a34a",
  yellow: "#f59e0b",
  red: "#e11d48",
  gray: "#9ca3af",
};

/** Text-safe shade of each triage color for words set on light backgrounds. */
export const TRIAGE_INK: Record<Triage, string> = {
  green: "#15803d",
  yellow: "#a16207",
  red: "#be123c",
  gray: "#5d6762",
};

export const TRIAGE_WORD: Record<Triage, string> = {
  green: "Green",
  yellow: "Yellow",
  red: "Red",
  gray: "Gray",
};

export const TRIAGE_SHORT: Record<Triage, string> = { ...TRIAGE_LABEL, yellow: TRIAGE_LABEL.yellow.replace(/\bsubsidy\b/, "a modeled shortfall") };

export const TRIAGE_ORDER: Triage[] = ["green", "yellow", "red", "gray"];

export function TriageDot({ triage, size = 8, title }: { triage: Triage; size?: number; title?: string }) {
  return (
    <span
      title={title}
      aria-label={title}
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, background: TRIAGE_COLOR[triage] }}
    />
  );
}

export function TriageChip({ triage }: { triage: Triage }) {
  return (
    <span
      title={TRIAGE_SHORT[triage]}
      className="inline-flex w-[18px] items-center justify-center rounded-[4px] text-[10px] leading-[16px] font-bold text-white"
      style={{ background: TRIAGE_COLOR[triage] }}
    >
      {triage === "gray" ? "–" : TRIAGE_WORD[triage][0]}
      <span className="sr-only">{TRIAGE_WORD[triage]}</span>
    </span>
  );
}

export function TriageLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
      {TRIAGE_ORDER.map((t) => (
        <span key={t} className="inline-flex items-center gap-1.5">
          <TriageDot triage={t} size={7} />
          {TRIAGE_SHORT[t]}
        </span>
      ))}
    </div>
  );
}
