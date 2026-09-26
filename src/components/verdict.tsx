import type { Triage, Typology, Verdict } from "@/lib/types";
import { TRIAGE_LABEL, VERDICT_LABEL } from "@/lib/types";
import Tooltip from "./ui/Tooltip";
import { districtName } from "./district";

export const TYPOLOGIES: Typology[] = ["single", "single_adu", "duplex", "triplex", "townhome"];

export const TYPOLOGY_SHORT: Record<Typology, string> = {
  single: "House",
  single_adu: "House + backyard",
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

export const VERDICT_SHORT: Record<Verdict, string> = {
  "by-right": "Allowed",
  review: "Staff approval",
  variance: "Needs a hearing",
  prohibited: "Not allowed",
  unknown: "Not checked",
};

/** Plain-language glossary for the terms that have to stay (UX copy pass, cycle 1). */
export const TIP = {
  byRight: "By right: the code permits this use and size outright. City staff review it; no public hearing.",
  review: "An administrator exception or special exception. Staff or the Board decide against written criteria.",
  hearing: "The Zoning Board of Adjustment must grant relief from a size rule at a public hearing.",
  notChecked: "ByRight only encodes residential, LNC and Hillside districts. Parks, industrial and downtown are out of scope.",
  adu: "ADU: accessory dwelling unit, a small second home on the same lot (garage apartment, cottage).",
  landValue: "The County's 2012-base assessment, not a market price.",
  frontage: "Parsed from the legal description. A survey governs.",
  cityStatus: "The City's own disposition status. Only 'Available for Sale' lots can be bought today.",
  bill: "Bill 2025-1545 (substitute, heard Sept 23 2026): citywide ADUs, no parking minimums, affordable bonus. Not yet voted.",
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

export function VerdictChip({ verdict, full = false }: { verdict: Verdict; full?: boolean }) {
  const c = VERDICT_COLOR[verdict];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-medium whitespace-nowrap"
      style={{ background: `${c}14`, color: VERDICT_INK[verdict] }}
    >
      <VerdictDot verdict={verdict} size={6} />
      {full ? VERDICT_LABEL[verdict] : VERDICT_SHORT[verdict]}
    </span>
  );
}

export function ZoneChip({ zone, tip = false }: { zone: string; tip?: boolean }) {
  const chip = (
    <span className="inline-flex shrink-0 items-center rounded border border-hairline bg-white px-1.5 py-px text-[11px] font-medium whitespace-nowrap text-ink">
      {zone || "none"}
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

export const TRIAGE_SHORT: Record<Triage, string> = TRIAGE_LABEL;

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
