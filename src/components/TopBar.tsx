"use client";
import { useEffect, useRef, useState } from "react";
import type { RuleSet } from "@/lib/types";
import CountUp from "./CountUp";
import type { RuleSetStats } from "./ByRightApp";
import {
  TIP,
  TRIAGE_ORDER,
  TRIAGE_SHORT,
  TRIAGE_WORD,
  TriageDot,
} from "./verdict";
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
    <header className="toolbar relative z-20 shrink-0 border-b border-hairline">
      <div className="flex min-h-16 items-center gap-4 px-panel py-3">
        <h1 className="shrink-0 text-title text-ink">
          ByRight <span className="text-muted">PGH</span>
        </h1>
        <p className="min-w-0 text-callout text-muted">Screening Pittsburgh&apos;s vacant City lots for small homes</p>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <ScenarioMenu ruleSet={ruleSet} onRuleSet={onRuleSet} />
          <button
            onClick={onAbout}
            className="button-secondary text-callout"
          >
            About the data
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-hairline px-panel py-4">
        <div className="min-w-0 flex-[1_1_660px]">
          <FunnelSentence s={s} className="hero-sentence" />
          <div className="mt-1">
            <FunnelLine s={s} />
          </div>
        </div>
        <div aria-label="Lots by triage" className="flex shrink-0 items-center gap-1">
          {TRIAGE_ORDER.map((t) => (
            <Tooltip key={t} content={TRIAGE_SHORT[t]} side="bottom" asChild>
              <span
                tabIndex={0}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-control px-3 py-1 text-caption font-medium text-ink tabular-nums"
              >
                <TriageDot triage={t} size={7} />
                <span className="text-caption font-normal text-muted">
                  {TRIAGE_WORD[t]}
                </span>
                <span className="sr-only">, {TRIAGE_SHORT[t]}: </span>
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
        className={`inline-flex min-h-9 items-center gap-2 rounded-full px-4 py-2 text-callout transition-colors ${
          bill ? "bg-warning-soft text-warning-ink" : "bg-control text-ink hover:bg-track"
        }`}
      >
        <span className="text-muted">Scenario</span>
        <span className="font-medium">{SCENARIO_LABEL[ruleSet]}</span>
        <svg width="16" height="16" viewBox="0 0 12 12" aria-hidden className={`transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Zoning scenario"
          className="pop absolute top-[calc(100%+6px)] right-0 w-[300px] surface-card overflow-hidden p-2 shadow-overlay"
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
                className={`flex w-full items-start gap-2.5 rounded-tooltip px-3 py-3 text-left hover:bg-surface ${on ? "bg-surface/70" : ""}`}
              >
                <span
                  aria-hidden
                  className="mt-[3px] h-3 w-3 shrink-0 rounded-full border"
                  style={
                    on
                      ? { borderColor: o === "current" ? "var(--color-accent)" : "var(--color-v-variance)", boxShadow: `inset 0 0 0 3px var(--color-panel)`, background: o === "current" ? "var(--color-accent)" : "var(--color-v-variance)" }
                      : { borderColor: "var(--color-hairline)" }
                  }
                />
                <span className="min-w-0">
                  <span className="block text-callout font-medium text-ink">{SCENARIO_LABEL[o]}</span>
                  <span className="mt-0.5 block text-caption text-muted">{SCENARIO_TIP[o]}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
