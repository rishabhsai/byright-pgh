import type { Triage, Typology, Verdict } from "@/lib/types";

export const TYPOLOGIES: Typology[] = ["single", "single_adu", "duplex", "triplex", "townhome"];

export const TYPOLOGY_SHORT: Record<Typology, string> = {
  single: "Single",
  single_adu: "Single + ADU",
  duplex: "Duplex",
  triplex: "Triplex",
  townhome: "Townhome",
};

export const VERDICT_COLOR: Record<Verdict, string> = {
  "by-right": "#16a34a",
  review: "#2563eb",
  variance: "#d97706",
  prohibited: "#e11d48",
  unknown: "#9ca3af",
};

export const VERDICT_SHORT: Record<Verdict, string> = {
  "by-right": "By right",
  review: "Review",
  variance: "Relief required",
  prohibited: "Not permitted",
  unknown: "Not evaluated",
};

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

export function VerdictChip({ verdict }: { verdict: Verdict }) {
  const c = VERDICT_COLOR[verdict];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap"
      style={{ background: `${c}18`, color: verdict === "unknown" ? "#5d6762" : c }}
    >
      <VerdictDot verdict={verdict} size={6} />
      {VERDICT_SHORT[verdict]}
    </span>
  );
}

export function ZoneChip({ zone }: { zone: string }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded border border-hairline bg-white px-1.5 py-px text-[11px] font-medium whitespace-nowrap text-ink">
      {zone || "none"}
    </span>
  );
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

export const TRIAGE_SHORT: Record<Triage, string> = {
  green: "Passes the preliminary screen",
  yellow: "Needs info, review, or a different scenario",
  red: "Major obstacle; specialist review",
  gray: "Not evaluated",
};

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
