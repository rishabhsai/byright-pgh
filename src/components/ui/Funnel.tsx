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
  /** With a Home type filter, the use-table count for that type (the triage counts already follow it). */
  byRightType?: number | null;
  typeLabel?: string | null;
}

export function funnelSteps(s: FunnelStats) {
  const total = s.triage.green + s.triage.yellow + s.triage.red + s.triage.gray;
  return [
    { key: "total", n: total, label: "vacant City lots" },
    { key: "evaluated", n: total - s.unknown, label: "evaluated" },
    {
      key: "allowed",
      n: s.byRightType ?? s.byRightAny,
      label: s.typeLabel ? `pass the use-table and lot-size screen for a ${s.typeLabel}` : "pass the use-table and lot-size screen",
    },
    { key: "pays", n: s.triage.green, label: GREEN_NEEDS_SALE ? "also clear the cost-and-return screen, for sale" : "also clear the cost-and-return screen" },
  ] as const;
}

const N = ({ v }: { v: number }) => (
  <span className="funnel-number font-semibold text-ink">
    <CountUp value={v} />
  </span>
);

/** One-line hero: "3,641 of 11,338 vacant City lots pass the use-table and lot-size screen. 9 also clear…" */
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
      <N v={allowed.n} /> of <N v={total.n} /> vacant City lots pass the{" "}
      <Tooltip content={TIP.byRight}>use-table and lot-size screen</Tooltip>
      {s.typeLabel ? ` for a ${s.typeLabel}` : ""}. <N v={pays.n} /> also clear the cost-and-return screen
      {GREEN_NEEDS_SALE ? " and are for sale." : "."}
    </p>
  );
}

/** Compact text funnel for the header: 11,338 → 9,030 evaluated → 3,641 pass use table → 9 clear screen */
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
  const short = ["", "evaluated", "pass use table", GREEN_NEEDS_SALE ? "clear cost screen, for sale" : "clear cost screen"];
  return (
    <ol aria-label="Lot funnel" className="flex flex-wrap items-center gap-1.5 text-caption text-muted">
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
export function FunnelBars({
  s,
  steps: given,
}: {
  s?: FunnelStats;
  steps?: readonly { key: string; n: number; label: string }[];
}) {
  const steps = given ?? (s ? funnelSteps(s) : []);
  if (!steps.length) return null;
  const max = steps[0].n || 1;
  return (
    <ol aria-label="Lot funnel" className="space-y-5">
      {steps.map((st, i) => {
        const pct = Math.max((st.n / max) * 100, 0.8);
        const last = i === steps.length - 1;
        return (
          <li key={st.key}>
            <div className="flex items-baseline justify-between gap-3 text-caption">
              <span className={last ? "font-medium text-ink" : "text-muted"}>{st.label}</span>
              <span className="shrink-0 text-display text-ink tabular-nums">
                <CountUp value={st.n} />
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface">
              <div
                className="funnel-grow h-full rounded-full"
                style={{
                  width: `${pct}%`,
                  background: last ? "var(--color-v-byright)" : i === 2 ? "var(--color-faint)" : "var(--color-control-edge)",
                  animationDelay: `${i * 20}ms`,
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
    <svg width="16" height="16" viewBox="0 0 12 8" aria-hidden className="text-faint">
      <path d="M0 4h10M7.5 1.5L10 4 7.5 6.5" stroke="currentColor" fill="none" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
