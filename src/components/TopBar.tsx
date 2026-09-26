"use client";
import type { RuleSet } from "@/lib/types";
import CountUp from "./CountUp";
import type { RuleSetStats } from "./ByRightApp";

interface Props {
  ruleSet: RuleSet;
  onRuleSet: (r: RuleSet) => void;
  stats: Record<RuleSet, RuleSetStats> | null;
  onAbout: () => void;
  usingFixtures: boolean;
}

const OPTIONS: RuleSet[] = ["current", "bill-2025-1545"];
const TOGGLE_LABEL: Record<RuleSet, string> = {
  current: "Today's code",
  "bill-2025-1545": "If Bill 2025-1545 passes",
};

export default function TopBar({ ruleSet, onRuleSet, stats, onAbout, usingFixtures }: Props) {
  const s = stats?.[ruleSet];
  const delta = stats ? stats["bill-2025-1545"].lotsGaining : 0;
  const bill = ruleSet === "bill-2025-1545";

  return (
    <header className="relative z-20 shrink-0 border-b border-hairline bg-panel">
      <div className="flex h-[52px] items-center gap-4 px-5">
        <h1 className="shrink-0 font-serif text-[28px] leading-none tracking-[-0.01em] text-ink">
          ByRight <span className="italic text-accent">PGH</span>
        </h1>
        <p className="min-w-0 truncate pt-1 text-[13px] text-muted">
          Which small homes fit Pittsburgh&apos;s vacant public lots
        </p>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {usingFixtures && (
            <span className="rounded-full bg-[#fde8ec] px-2.5 py-1 text-[11px] font-medium text-[#9f1239]">
              Sample data
            </span>
          )}
          <span className="rounded-full border border-hairline px-2.5 py-1 text-[11px] text-muted">
            Decision support, not zoning advice
          </span>
          <button
            onClick={onAbout}
            className="rounded-full bg-ink px-3.5 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-accent"
          >
            About the data
          </button>
        </div>
      </div>

      <div className="flex h-[60px] items-center gap-6 border-t border-hairline/70 px-5">
        <div
          role="radiogroup"
          aria-label="Zoning rule set"
          className="relative grid shrink-0 grid-cols-2 rounded-full border border-hairline bg-surface p-1 text-[13px] font-medium"
        >
          <span
            aria-hidden
            className="absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full shadow-[0_1px_2px_rgba(23,33,30,.12),0_0_0_1px_rgba(23,33,30,.06)] transition-[transform,background-color] duration-300 ease-[cubic-bezier(.2,.8,.2,1)]"
            style={{
              transform: bill ? "translateX(100%)" : "translateX(0)",
              background: bill ? "var(--gold)" : "#fff",
            }}
          />
          {OPTIONS.map((o) => (
            <button
              key={o}
              role="radio"
              aria-checked={ruleSet === o}
              onClick={() => onRuleSet(o)}
              className={`relative z-10 rounded-full px-4 py-1.5 whitespace-nowrap transition-colors ${
                ruleSet === o ? "text-ink" : "text-muted hover:text-ink"
              }`}
            >
              {TOGGLE_LABEL[o]}
            </button>
          ))}
        </div>

        <div className="flex min-w-0 items-center gap-6">
          <Stat label="lots by right for at least one home type" value={s?.byRightAny} tone="var(--v-byright)" />
          <Stat label="by-right home options across all lots" value={s?.byRightPairs} tone="var(--v-byright)" ring />
          <Stat label="lots need a variance" value={s?.variance} tone="var(--v-variance)" />
          <Stat label="lots in districts not encoded" value={s?.unknown} tone="var(--v-unknown)" />
        </div>
        {bill && delta > 0 && (
          <span
            key={delta}
            className="pop inline-flex h-7 shrink-0 items-center rounded-full bg-gold-soft px-3 text-[12px] font-semibold whitespace-nowrap text-[#7a5a00] ring-1 ring-gold/60"
          >
            +{delta.toLocaleString("en-US")} lots unlock a by-right home type
          </span>
        )}
      </div>
    </header>
  );
}

function Stat({ label, value, tone, ring }: { label: string; value?: number; tone: string; ring?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span
        className="inline-block h-2 w-2 shrink-0 rounded-full"
        style={ring ? { boxShadow: `inset 0 0 0 1.5px ${tone}` } : { background: tone }}
      />
      <span className="font-serif text-[28px] leading-none text-ink">
        {value == null ? <span className="text-faint">—</span> : <CountUp value={value} />}
      </span>
      <span className="w-[104px] text-[11px] leading-[1.25] text-muted">{label}</span>
    </div>
  );
}
