"use client";
import { useEffect, useRef, useState } from "react";
import type { RuleSet } from "@/lib/types";
import CountUp from "./CountUp";
import type { RuleSetStats } from "./ByRightApp";
import { TIP, TRIAGE_ORDER, TRIAGE_SHORT, TriageDot } from "./verdict";
import Tooltip from "./ui/Tooltip";
import { FunnelLine, FunnelSentence } from "./ui/Funnel";

interface Props {
  ruleSet: RuleSet;
  onRuleSet: (r: RuleSet) => void;
  stats: Record<RuleSet, RuleSetStats> | null;
  onAbout: () => void;
}

const SCENARIO_LABEL: Record<RuleSet, string> = {
  current: "Today's code",
  "bill-2025-1545": "If the housing bill passes",
};
const SCENARIO_TIP: Record<RuleSet, string> = {
  current: "Title Nine, the Zoning Code, as in force today.",
  "bill-2025-1545": TIP.bill,
};
const OPTIONS: RuleSet[] = ["current", "bill-2025-1545"];

export default function TopBar({ ruleSet, onRuleSet, stats, onAbout }: Props) {
  const s = stats?.[ruleSet] ?? null;

  return (
    <header className="relative z-20 shrink-0 border-b border-hairline bg-panel">
      <div className="flex h-[48px] items-center gap-4 px-5">
        <h1 className="shrink-0 font-serif text-[26px] leading-none tracking-[-0.01em] text-ink">
          ByRight <span className="italic text-accent">PGH</span>
        </h1>
        <p className="min-w-0 truncate pt-1 text-[13px] text-muted">Screening Pittsburgh&apos;s vacant public lots for small homes</p>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <ScenarioMenu ruleSet={ruleSet} onRuleSet={onRuleSet} />
          <button
            onClick={onAbout}
            className="rounded-full bg-ink px-3.5 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-accent active:scale-[0.98]"
          >
            About the data
          </button>
        </div>
      </div>

      <div className="flex h-[56px] items-center gap-6 border-t border-hairline/70 px-5">
        <div className="min-w-0 flex-1">
          <FunnelSentence s={s} className="truncate text-[13px] leading-tight whitespace-nowrap min-[1440px]:text-[14px]" />
          <div className="mt-1">
            <FunnelLine s={s} />
          </div>
        </div>
        <div aria-label="Lots by triage" className="flex shrink-0 items-center gap-1">
          {TRIAGE_ORDER.map((t) => (
            <Tooltip key={t} content={TRIAGE_SHORT[t]} side="bottom" asChild>
              <span
                tabIndex={0}
                className="inline-flex h-[22px] items-center gap-1.5 rounded-full border border-hairline bg-white px-2 text-[12px] font-medium text-ink tabular-nums"
              >
                <TriageDot triage={t} size={7} />
                <span className="sr-only">{TRIAGE_SHORT[t]}: </span>
                {s ? (
                  <CountUp value={s.triage[t]} />
                ) : (
                  <span aria-label="loading" className="inline-block h-2.5 w-7 animate-pulse rounded-sm bg-surface" />
                )}
              </span>
            </Tooltip>
          ))}
        </div>
      </div>
    </header>
  );
}

function ScenarioMenu({ ruleSet, onRuleSet }: { ruleSet: RuleSet; onRuleSet: (r: RuleSet) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const bill = ruleSet === "bill-2025-1545";

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`inline-flex h-[28px] items-center gap-2 rounded-full border px-3 text-[12px] transition-colors ${
          bill ? "border-gold/70 bg-gold-soft text-[#5c4400]" : "border-hairline bg-white text-ink hover:bg-surface"
        }`}
      >
        <span className="text-muted">Scenario</span>
        <span className="font-medium">{SCENARIO_LABEL[ruleSet]}</span>
        <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden className={`transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Zoning scenario"
          className="pop absolute top-[calc(100%+6px)] right-0 w-[300px] overflow-hidden rounded-xl border border-hairline bg-white p-1 shadow-[0_12px_32px_-12px_rgba(23,33,30,.35)]"
        >
          {OPTIONS.map((o) => {
            const on = o === ruleSet;
            return (
              <button
                key={o}
                role="menuitemradio"
                aria-checked={on}
                onClick={() => {
                  onRuleSet(o);
                  setOpen(false);
                }}
                className={`flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-surface ${on ? "bg-surface/70" : ""}`}
              >
                <span
                  aria-hidden
                  className="mt-[3px] h-3 w-3 shrink-0 rounded-full border"
                  style={
                    on
                      ? { borderColor: o === "current" ? "var(--ink)" : "var(--gold)", boxShadow: `inset 0 0 0 3px #fff`, background: o === "current" ? "var(--ink)" : "var(--gold)" }
                      : { borderColor: "var(--hairline)" }
                  }
                />
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-ink">{SCENARIO_LABEL[o]}</span>
                  <span className="mt-0.5 block text-[12px] leading-snug text-muted">{SCENARIO_TIP[o]}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
