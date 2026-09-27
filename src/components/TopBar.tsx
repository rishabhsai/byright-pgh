"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
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
import { funnelSteps } from "./ui/Funnel";
import { NEW_CONSTRUCTION_PREMIUM } from "@/lib/proforma";

/** The Reform tab's scenario, shown in place of the rule-set line while that tab is open. */
export interface ReformHeader {
  label: string;
  pending: boolean;
  totals: {
    total: number;
    allowed: number;
    candidates: number;
    clearing: number;
    hardCostPerSf: number;
    lots: { gained: number; lost: number; net: number };
  } | null;
}

/** The status strip scoped to the neighborhood filter, read off the plan: "Hazelwood: 285 of 797 pass …". */
export interface ScopeLine {
  label: string;
  total: number;
  allowed: number;
  candidates: number;
  clearing: number;
  hardCostPerSf: number;
  /** "duplex" with a Home type filter. */
  typeLabel: string | null;
  /** The plan lags the inputs. */
  pending: boolean;
}

interface Props {
  ruleSet: RuleSet;
  onRuleSet: (r: RuleSet) => void;
  stats: Record<RuleSet, RuleSetStats> | null;
  onAbout: () => void;
  /** Set while the Reform tab is open: one scenario on screen, the menu read-only. */
  reform?: ReformHeader | null;
  /** The search and Ask field, with its sheet: the toolbar centers it. */
  search: ReactNode;
  /** Set with a neighborhood filter: the strip counts that scope, not the city. Null while the plan builds. */
  scope?: ScopeLine | null;
  /** A neighborhood filter is set, so the strip is scoped (a skeleton until `scope` arrives). */
  scoped?: boolean;
}

const fmt = (n: number) => n.toLocaleString("en-US");
const signed = (n: number) => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(Math.abs(n))}` : "±0");

const SCENARIO_LABEL: Record<RuleSet, string> = {
  current: "Today's code",
  "bill-2025-1545": "If the housing bill passes",
};
const SCENARIO_TIP: Record<RuleSet, string> = {
  current: "Title Nine, the Zoning Code, as in force today.",
  "bill-2025-1545": TIP.bill,
};
const OPTIONS: RuleSet[] = ["current", "bill-2025-1545"];

/**
 * One 48px toolbar (wordmark, the search and Ask field, scenario and About) over a 28px status strip that
 * carries the headline counts in one line. The big-number hero lives only in the right panel's empty state.
 */
export default function TopBar({ ruleSet, onRuleSet, stats, onAbout, reform = null, search, scope = null, scoped = false }: Props) {
  const s = stats?.[ruleSet] ?? null;

  return (
    <header className="relative z-30 shrink-0">
      <div className="toolbar grid h-12 grid-cols-[minmax(0,1fr)_minmax(0,480px)_minmax(0,1fr)] items-center gap-4 border-b border-hairline px-4">
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 className="shrink-0 text-headline text-ink">
            ByRight <span className="text-muted">PGH</span>
          </h1>
          <p className="hidden min-w-0 truncate text-caption text-muted min-[1440px]:block">Screening Pittsburgh&apos;s vacant City lots for small homes</p>
        </div>
        {/* The Ask sheet anchors to this cell, below the status strip (see AskSheet). */}
        <div className="relative flex h-full min-w-0 items-center">
          <div className="w-full">{search}</div>
        </div>
        <div className="flex min-w-0 items-center justify-end gap-2">
          {reform ? (
            <Tooltip content="Set on the Reform tab. Leave Reform to choose today's code or the bill here." side="bottom" asChild>
              <span tabIndex={0} className="inline-flex h-8 min-w-0 max-w-[340px] items-center gap-2 rounded-full bg-accent-soft px-3 text-callout text-accent">
                <span className="sr-only shrink-0 text-muted min-[1440px]:not-sr-only">Scenario</span>
                <span className="truncate font-medium">{reform.label}</span>
              </span>
            </Tooltip>
          ) : (
            <ScenarioMenu ruleSet={ruleSet} onRuleSet={onRuleSet} />
          )}
          <button onClick={onAbout} className="button-secondary h-8 min-h-8 shrink-0 px-3 py-0 text-callout">
            About the data
          </button>
        </div>
      </div>

      <div className="flex h-7 items-center gap-4 border-b border-hairline bg-panel px-4 text-caption">
        {reform ? <ScenarioLine r={reform} /> : scoped ? <ScopedLine l={scope} /> : <CountsLine s={s} />}
        {reform ? (
          <span className="shrink-0 text-faint">Hypothetical; not a proposal</span>
        ) : (
          <div aria-label="Lots by triage" className="flex shrink-0 items-center gap-1">
            {TRIAGE_ORDER.map((t) => (
              <Tooltip key={t} content={TRIAGE_SHORT[t]} side="bottom" asChild>
                <span tabIndex={0} className="inline-flex h-5 items-center gap-1.5 rounded-full bg-control px-2 text-caption font-medium text-ink tabular-nums">
                  <TriageDot triage={t} size={6} />
                  <span className="font-normal text-muted">{TRIAGE_WORD[t]}</span>
                  <span className="sr-only">, {TRIAGE_SHORT[t]}: </span>
                  {s ? <CountUp value={s.triage[t]} /> : <span aria-label="loading" className="inline-block h-2 w-6 animate-pulse rounded-sm bg-surface" />}
                </span>
              </Tooltip>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}

/** "3,641 of 11,338 pass the use-table and lot-size screen · 0 clear the cost screen at $225/sf · 7 at a 1.3× premium" */
function CountsLine({ s }: { s: RuleSetStats | null }) {
  if (!s)
    return (
      <p aria-label="Evaluating lots" className="min-w-0 flex-1">
        <span className="inline-block h-2.5 w-[46ch] max-w-full animate-pulse rounded-sm bg-surface align-middle" />
      </p>
    );
  const [total, , allowed, pays] = funnelSteps(s);
  const b = (n: number) => (
    <span className="font-semibold text-ink tabular-nums">
      <CountUp value={n} />
    </span>
  );
  return (
    <p className="min-w-0 flex-1 truncate text-muted">
      {b(allowed.n)} of {b(total.n)} pass the <Tooltip content={TIP.byRight}>use-table and lot-size screen</Tooltip>
      {s.typeLabel ? ` for a ${s.typeLabel}` : ""}
      <span className="text-faint"> · </span>
      {b(pays.n)} {pays.n === 1 ? "clears" : "clear"} the cost screen at ${fmt(s.hardCostPerSf)}/sf
      <span className="text-faint"> · </span>
      {b(s.clearAtPremium)} at a {NEW_CONSTRUCTION_PREMIUM}× premium
    </p>
  );
}

/** "Hazelwood: 285 of 797 pass the use-table and lot-size screen · 106 candidates · 0 clear the cost screen at $225/sf" */
function ScopedLine({ l }: { l: ScopeLine | null }) {
  if (!l)
    return (
      <p aria-label="Counting the neighborhood" className="min-w-0 flex-1">
        <span className="inline-block h-2.5 w-[46ch] max-w-full animate-pulse rounded-sm bg-surface align-middle" />
      </p>
    );
  const b = (n: number) => <span className="font-semibold text-ink tabular-nums">{fmt(n)}</span>;
  return (
    <p aria-busy={l.pending || undefined} className={`min-w-0 flex-1 truncate text-muted transition-opacity duration-200 ${l.pending ? "opacity-60" : ""}`}>
      <span className="font-medium text-ink">{l.label}:</span> {b(l.allowed)} of {b(l.total)} pass the{" "}
      <Tooltip content={TIP.byRight}>use-table and lot-size screen</Tooltip>
      {l.typeLabel ? ` for a ${l.typeLabel}` : ""}
      <span className="text-faint"> · </span>
      {b(l.candidates)} {l.candidates === 1 ? "candidate" : "candidates"}
      <span className="text-faint"> · </span>
      {b(l.clearing)} {l.clearing === 1 ? "clears" : "clear"} the cost screen at ${fmt(l.hardCostPerSf)}/sf
    </p>
  );
}

/** "Scenario: L 3,000 → 1,800 · 4,228 pass · net +587 · 1,213 candidates": the scenario's totals, never today's. */
function ScenarioLine({ r }: { r: ReformHeader }) {
  const t = r.totals;
  return (
    <p aria-busy={r.pending || undefined} className="min-w-0 flex-1 truncate text-muted">
      <span className="text-accent">
        Scenario: <span className="font-medium">{r.label}</span>
      </span>
      {t ? (
        <span className={`transition-opacity duration-200 ${r.pending ? "opacity-60" : ""}`}>
          <span className="text-faint"> · </span>
          <span className="font-semibold text-ink tabular-nums">
            <CountUp value={t.allowed} />
          </span>{" "}
          of {fmt(t.total)} pass
          <span className="text-faint"> · </span>
          <span
            title={`Against today's code: ${fmt(t.lots.gained)} gained, ${fmt(t.lots.lost)} lost`}
            className={`font-medium tabular-nums ${t.lots.net > 0 ? "text-success-ink" : t.lots.net < 0 ? "text-danger-ink" : "text-ink"}`}
          >
            net {signed(t.lots.net)}
          </span>
          <span className="text-faint"> · </span>
          <span className="font-semibold text-ink tabular-nums">{fmt(t.candidates)}</span> candidates
          <span className="text-faint"> · </span>
          <span className="font-semibold text-ink tabular-nums">{fmt(t.clearing)}</span> {t.clearing === 1 ? "clears" : "clear"} the cost screen at ${fmt(t.hardCostPerSf)}/sf
        </span>
      ) : (
        <span className="ml-2 inline-block h-2.5 w-[34ch] max-w-full animate-pulse rounded-sm bg-surface align-middle" />
      )}
      {r.pending && <span className="text-muted"> · Recomputing…</span>}
    </p>
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
        className={`inline-flex h-8 items-center gap-2 rounded-full px-3 text-callout whitespace-nowrap transition-colors ${
          bill ? "bg-warning-soft text-warning-ink" : "bg-control text-ink hover:bg-track"
        }`}
      >
        <span className="sr-only text-muted min-[1440px]:not-sr-only">Scenario</span>
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
