"use client";
import type { Triage } from "@/lib/types";
import CountUp from "../CountUp";
import Tooltip from "./Tooltip";
import { TIP } from "../verdict";
import { GREEN_POLICY } from "@/lib/triage";
import { NEW_CONSTRUCTION_PREMIUM } from "@/lib/proforma";

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
  /** Lots that would be Green with new homes valued at 1.3× the comp index. */
  clearAtPremium?: number;
  /** The hard cost the counts were screened at, $/sf. */
  hardCostPerSf?: number;
}

/** "at $225/sf", or "" when the stats do not carry the rate. */
const atRate = (s: FunnelStats) => (s.hardCostPerSf != null ? ` at $${s.hardCostPerSf.toLocaleString("en-US")}/sf` : "");

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

/** A count in the sentence; `minor` counts keep the text size where the hero scales the first sentence's up. */
const N = ({ v, minor = false }: { v: number; minor?: boolean }) => (
  <span className={`${minor ? "" : "funnel-number "}font-semibold text-ink`}>
    <CountUp value={v} />
  </span>
);

/**
 * One-line hero: "3,641 of 11,338 vacant City lots pass the use-table and lot-size screen. 0 clear the
 * cost-and-return screen at $225/sf; 7 would at a 1.3× new-construction premium."
 */
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
      {s.typeLabel ? ` for a ${s.typeLabel}` : ""}.{" "}
      <span className="funnel-second">
        <N v={pays.n} minor /> {pays.n === 1 ? "clears" : "clear"} the cost-and-return screen
        {atRate(s)}
        {s.clearAtPremium != null ? (
          <>
            ; <N v={s.clearAtPremium} minor /> would at a {NEW_CONSTRUCTION_PREMIUM}× new-construction premium.
          </>
        ) : (
          "."
        )}
      </span>
    </p>
  );
}

/**
 * The empty panel's hero: the two headline counts as stat blocks, then the full sentence in body text.
 * Same numbers and order as the top bar's hero.
 */
export function FunnelHero({ s }: { s: FunnelStats | null }) {
  if (!s)
    return (
      <div aria-label="Evaluating lots" className="space-y-3">
        <div className="flex gap-8">
          {[0, 1].map((k) => (
            <span key={k} className="inline-block h-10 w-24 animate-pulse rounded bg-surface" />
          ))}
        </div>
        <span className="block h-4 w-full animate-pulse rounded bg-surface" />
      </div>
    );
  const [, , allowed, pays] = funnelSteps(s);
  const blocks = [
    { key: "allowed", n: allowed.n, label: s.typeLabel ? `pass use table and lot size for a ${s.typeLabel}` : "pass use table and lot size" },
    {
      key: "pays",
      n: pays.n,
      label: `clear the cost screen${atRate(s)}${s.clearAtPremium != null ? `; ${s.clearAtPremium.toLocaleString("en-US")} at the ${NEW_CONSTRUCTION_PREMIUM}× premium` : ""}`,
    },
  ];
  return (
    <div>
      <StatBlocks blocks={blocks} />
      <FunnelSentence s={s} className="mt-4 text-body" />
    </div>
  );
}

/** Headline counts side by side: a display number over its caption label. */
export function StatBlocks({ blocks, className = "" }: { blocks: { key: string; n: number; label: string }[]; className?: string }) {
  return (
    <dl className={`grid grid-cols-2 gap-x-6 gap-y-2 ${className}`}>
      {blocks.map((b) => (
        <div key={b.key} className="flex min-w-0 flex-col">
          <dt className="order-2 mt-1 text-caption text-muted">{b.label}</dt>
          <dd className="order-1 text-display text-ink tabular-nums">
            <CountUp value={b.n} />
          </dd>
        </div>
      ))}
    </dl>
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
