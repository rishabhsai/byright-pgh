"use client";
import type { Triage } from "@/lib/types";
import CountUp from "../CountUp";
import Tooltip from "./Tooltip";
import { TIP } from "../verdict";
import { GREEN_POLICY } from "@/lib/triage";

/** Green requires a lot the City records as for sale (read off the policy text, so the copy follows the lib). */
export const GREEN_NEEDS_SALE = /available for sale/i.test(GREEN_POLICY);

/** The subset of the app's per-rule-set stats the funnel reads. */
export interface FunnelStats {
  byRightAny: number;
  unknown: number;
  lotsGaining?: number;
  triage: Record<Triage, number>;
}

export function funnelSteps(s: FunnelStats) {
  const total = s.triage.green + s.triage.yellow + s.triage.red + s.triage.gray;
  return [
    { key: "total", n: total, label: "vacant City lots" },
    { key: "evaluated", n: total - s.unknown, label: "evaluated" },
    { key: "allowed", n: s.byRightAny, label: "allowed, no hearing" },
    { key: "pays", n: s.triage.green, label: GREEN_NEEDS_SALE ? "pay for themselves, for sale" : "pay for themselves" },
  ] as const;
}

const N = ({ v }: { v: number }) => (
  <span className="font-semibold text-ink">
    <CountUp value={v} />
  </span>
);

/** One-line hero: "3,641 of 11,338 vacant City lots allow a small home with no hearing. 28 of those pay…" */
export function FunnelSentence({ s, className = "" }: { s: FunnelStats | null; className?: string }) {
  if (!s)
    return (
      <p className={`text-muted ${className}`}>
        <span className="inline-block h-[0.9em] w-[34ch] max-w-full animate-pulse rounded bg-surface align-middle" />
      </p>
    );
  const [total, , allowed, pays] = funnelSteps(s);
  return (
    <p className={`text-muted ${className}`}>
      <N v={allowed.n} /> of <N v={total.n} /> vacant City lots allow a small home with{" "}
      <Tooltip content={TIP.byRight}>no hearing</Tooltip>. <N v={pays.n} /> of those{" "}
      {GREEN_NEEDS_SALE ? "pay for themselves and are for sale." : "pay for themselves at today\u2019s prices."}
    </p>
  );
}

/** Compact text funnel for the header: 11,338 → 9,030 evaluated → 3,641 allowed → 28 pay */
export function FunnelLine({ s }: { s: FunnelStats | null }) {
  if (!s)
    return (
      <span className="flex h-[16px] items-center gap-2" aria-label="Evaluating lots">
        {[44, 70, 58, 36].map((w) => (
          <span key={w} className="inline-block h-2.5 animate-pulse rounded-sm bg-surface" style={{ width: w }} />
        ))}
      </span>
    );
  const steps = funnelSteps(s);
  const short = ["", "evaluated", "allowed", GREEN_NEEDS_SALE ? "pay, for sale" : "pay"];
  return (
    <ol aria-label="Lot funnel" className="flex items-center gap-1.5 text-[12px] whitespace-nowrap text-muted">
      {steps.map((st, i) => (
        <li key={st.key} className="flex items-center gap-1.5">
          {i > 0 && <Arrow />}
          <span className="tabular-nums text-ink">{st.n.toLocaleString("en-US")}</span>
          {short[i] && <span>{short[i]}</span>}
        </li>
      ))}
    </ol>
  );
}

/** Large funnel for the empty panel: one bar per step, width proportional to the count. */
export function FunnelBars({ s }: { s: FunnelStats }) {
  const steps = funnelSteps(s);
  const max = steps[0].n || 1;
  return (
    <ol aria-label="Lot funnel" className="space-y-2.5">
      {steps.map((st, i) => {
        const pct = Math.max((st.n / max) * 100, 0.8);
        const last = i === steps.length - 1;
        return (
          <li key={st.key}>
            <div className="flex items-baseline justify-between gap-3 text-[12px]">
              <span className={last ? "font-medium text-ink" : "text-muted"}>{st.label}</span>
              <span className="font-medium text-ink tabular-nums">
                <CountUp value={st.n} />
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface">
              <div
                className="funnel-grow h-full rounded-full"
                style={{
                  width: `${pct}%`,
                  background: last ? "var(--accent)" : i === 2 ? "#5f8d86" : "#b9c2bd",
                  animationDelay: `${i * 90}ms`,
                }}
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Arrow() {
  return (
    <svg width="12" height="8" viewBox="0 0 12 8" aria-hidden className="text-faint">
      <path d="M0 4h10M7.5 1.5L10 4 7.5 6.5" stroke="currentColor" fill="none" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
