"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Comps, Finding, Lot, Typology } from "@/lib/types";
import { TYPOLOGY_LABEL, VERDICT_LABEL } from "@/lib/types";
import {
  fmtUsd,
  proformaWithFallback,
  UNIT_PLAN,
  ZILLOW_DATA_URL,
  type FinanceAssumptions,
  type RevenueMode,
} from "@/lib/finance";
import { acceptedValue, FINANCE_RANGES } from "@/lib/proforma";
import { TIP, TYPOLOGIES, VERDICT_SHORT } from "./verdict";
import Tooltip from "./ui/Tooltip";

type RangedKey = keyof typeof FINANCE_RANGES;

interface Props {
  lot: Lot;
  comps: Comps | null;
  findings: Finding[];
  /** The selected proposal, owned by the app so zoning, finance and the worksheet agree. */
  typology: Typology;
  onTypology: (t: Typology) => void;
  /** This lot's acquisition cost override; null uses the assessed value. */
  landOverride: number | null;
  onLandOverride: (v: number | null) => void;
  assumptions: FinanceAssumptions;
  onAssumptions: (a: FinanceAssumptions) => void;
  /** Reports whether an edit is waiting to be committed to the city-wide triage. */
  onPending?: (pending: boolean) => void;
}

/** Edits reach the city-wide triage this long after the last keystroke (or on blur). */
const COMMIT_DELAY_MS = 500;

export const NO_COMPS = "No Zillow comps for this neighborhood; finance not assessed";

export default function ProForma({
  lot,
  comps,
  findings,
  typology,
  onTypology,
  landOverride,
  onLandOverride,
  assumptions,
  onAssumptions,
  onPending,
}: Props) {
  // The inputs and this lot's numbers run off a local draft so typing never waits on the
  // city-wide recompute; the draft is committed to the app after a pause or on blur.
  // The land override rides in the draft but is committed to this lot only, never to the shared assumptions.
  const [draft, setDraft] = useState<FinanceAssumptions>({ ...assumptions, landOverride });
  const [seen, setSeen] = useState(assumptions);
  if (assumptions !== seen) {
    setSeen(assumptions);
    setDraft((d) => ({ ...assumptions, landOverride: d.landOverride }));
  }
  const latest = useRef(draft);
  const timer = useRef<number | null>(null);

  const commit = useCallback(() => {
    if (timer.current == null) return;
    window.clearTimeout(timer.current);
    timer.current = null;
    onPending?.(false);
    const { landOverride: land, ...shared } = latest.current;
    onAssumptions(shared);
    onLandOverride(land ?? null);
  }, [onAssumptions, onLandOverride, onPending]);

  useEffect(() => commit, [commit]);

  const update = (next: FinanceAssumptions, immediate = false) => {
    latest.current = next;
    setDraft(next);
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(commit, COMMIT_DELAY_MS);
    onPending?.(true);
    if (immediate) commit();
  };

  const a = draft;
  const r = useMemo(() => proformaWithFallback(lot, typology, comps, a), [lot, typology, comps, a]);
  const altHard = a.hardCostPerSf + 10;
  const rAlt = useMemo(
    () => proformaWithFallback(lot, typology, comps, { ...a, hardCostPerSf: altHard }),
    [lot, typology, comps, a, altHard],
  );
  const set = <K extends keyof FinanceAssumptions>(k: K, v: FinanceAssumptions[K]) => update({ ...a, [k]: v });
  const mode: RevenueMode = a.mode;
  const verdictOf = (t: Typology) => findings.find((f) => f.typology === t)?.verdict ?? "unknown";
  const selectedVerdict = verdictOf(typology);

  if (!comps) {
    return <p className="rounded-lg border border-dashed border-hairline px-3 py-3 text-[13px] text-muted">{NO_COMPS}.</p>;
  }

  const hasSale = comps.zhvi != null;
  const hasRent = comps.zori != null;
  const plan = UNIT_PLAN[typology];
  const target = a.targetMarginPct;
  const scale = r ? Math.max(r.totalCost, r.revenue) : 1;

  return (
    <div className="space-y-4">
      {r ? (
        <div>
          <p className={`font-serif text-[22px] leading-tight ${r.pencils ? "text-accent" : "text-[#9a3412]"}`}>
            {r.pencils
              ? `Pays for itself: ${fmtUsd(r.margin - (r.totalCost * target) / 100)} left after costs and a ${target}% return`
              : `Short by ${fmtUsd(r.gap)} at today's prices`}
          </p>
          <p className="mt-1 text-[13px] leading-snug text-muted">
            {r.pencils
              ? `A ${TYPOLOGY_LABEL[typology].toLowerCase()} here is worth more than it costs to build.`
              : `A ${TYPOLOGY_LABEL[typology].toLowerCase()} here costs more to build than it would be worth, after a ${target}% return.`}{" "}
            <span className="tabular-nums">
              Break-even value {fmtUsd(r.breakEvenValue)}; at ${altHard}/sq ft{" "}
              {rAlt ? (rAlt.pencils ? `${Math.round(rAlt.marginPct)}% margin` : `short by ${fmtUsd(rAlt.gap)}`) : "n/a"}.
            </span>
          </p>
          {r.mode !== mode && (
            <p className="mt-1 text-[12px] text-[#7a5400]">
              No {mode === "sale" ? "home price" : "rent"} data here, so {r.mode === "sale" ? "the neighborhood home price" : "the ZIP rent"} was used.
            </p>
          )}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-hairline px-3 py-3 text-[13px] text-muted">{NO_COMPS}.</p>
      )}

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
        <span className="text-muted">Modeled for</span>
        <select
          value={typology}
          onChange={(e) => onTypology(e.target.value as Typology)}
          aria-label="Home type"
          className="max-w-[210px] rounded-md border border-hairline bg-white px-2 py-1 text-[13px] text-ink"
        >
          {TYPOLOGIES.map((t) => (
            <option key={t} value={t}>
              {TYPOLOGY_LABEL[t]}
              {verdictOf(t) === "by-right" ? "" : ` (${VERDICT_SHORT[verdictOf(t)].toLowerCase()})`}
            </option>
          ))}
        </select>
        <span className="text-muted tabular-nums">{plan.note}</span>
        {selectedVerdict !== "by-right" && (
          <span className="block w-full text-[12px] text-[#7a5400]">
            Zoning: {VERDICT_LABEL[selectedVerdict].toLowerCase()} for this type; these numbers assume it gets approved.
          </span>
        )}
      </div>

      {r && (
        <div>
          <div aria-hidden className="mb-3 space-y-1.5">
            <div className="flex h-2.5 overflow-hidden rounded-full bg-surface">
              <span className="h-full bg-[#8a938e]" style={{ width: `${(r.land / scale) * 100}%` }} />
              <span className="h-full bg-[#5d6762]" style={{ width: `${(r.hard / scale) * 100}%` }} />
              <span className="h-full bg-[#aeb6b1]" style={{ width: `${((r.soft + r.devFee) / scale) * 100}%` }} />
            </div>
            <div className="flex h-2.5 overflow-hidden rounded-full bg-surface">
              <span
                className="h-full rounded-full"
                style={{ width: `${(r.revenue / scale) * 100}%`, background: r.pencils ? "var(--accent)" : "#d9a441" }}
              />
            </div>
          </div>
          <dl className="divide-y divide-hairline border-y border-hairline text-[13px]">
            <Row
              label={
                r.landSource === "assessed" ? (
                  <Tooltip content={TIP.landValue}>Land, County land value</Tooltip>
                ) : r.landSource === "override" ? (
                  "Land, your figure"
                ) : (
                  "Land, assumed (no assessment)"
                )
              }
              swatch="#8a938e"
              value={fmtUsd(r.land)}
            />
            <Row label={`Construction, ${r.buildingSf.toLocaleString()} sq ft × $${a.hardCostPerSf}`} swatch="#5d6762" value={fmtUsd(r.hard)} />
            <Row label="Fees, design and developer's fee" swatch="#aeb6b1" value={fmtUsd(r.soft + r.devFee)} />
            <Row
              label={
                <Tooltip content={<CompsTip comps={comps} mode={r.mode} />}>
                  {r.mode === "rent" ? "Value as a rental (rent ÷ cap rate)" : "Value at today's prices"}
                </Tooltip>
              }
              swatch={r.pencils ? "var(--accent)" : "#d9a441"}
              value={fmtUsd(r.revenue)}
            />
            <div className="flex items-baseline justify-between gap-3 py-2.5">
              <dt className="min-w-0">
                <span className="font-medium text-ink">{r.pencils ? "Margin" : `Short of a ${target}% return`}</span>
                <span className="block text-[12px] text-muted tabular-nums">
                  {r.pencils
                    ? `${Math.round(r.marginPct)}% on ${fmtUsd(r.totalCost)} total cost`
                    : `Value minus ${fmtUsd(r.totalCost)} total cost, minus the ${target}% return`}
                </span>
              </dt>
              <dd className={`shrink-0 font-serif text-[20px] leading-none tabular-nums ${r.pencils ? "text-accent" : "text-[#9a3412]"}`}>
                {r.pencils ? fmtUsd(r.margin) : `−${fmtUsd(r.gap)}`}
              </dd>
            </div>
          </dl>
          <p className="mt-2 text-[12px] leading-snug text-muted">
            Sources: Zillow {comps.zhvi != null ? `home price ${comps.neighborhood} (${comps.zhviDate?.slice(0, 7) ?? "latest"})` : ""}
            {comps.zhvi != null && comps.zori != null ? ", " : ""}
            {comps.zori != null ? `rent ZIP ${comps.zip} (${comps.zoriDate?.slice(0, 7) ?? "latest"})` : ""}; Allegheny County assessment (2012 base).{" "}
            <a href={ZILLOW_DATA_URL} target="_blank" rel="noreferrer" className="text-accent underline decoration-accent/30 underline-offset-2">
              Zillow Research
            </a>
          </p>
        </div>
      )}

      <details className="group rounded-lg border border-hairline bg-white" onBlur={commit}>
        <summary className="flex cursor-pointer items-center justify-between px-3 py-2 text-[13px] font-medium text-ink select-none">
          Adjust assumptions
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className="text-muted transition-transform group-open:rotate-180">
            <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
          </svg>
        </summary>
        <div className="space-y-3 border-t border-hairline px-3 pt-3 pb-3">
          <div>
            <div role="radiogroup" aria-label="Revenue" className="flex rounded-md border border-hairline bg-surface p-0.5 text-[12px]">
              {(["sale", "rent"] as RevenueMode[]).map((m) => {
                const available = m === "sale" ? hasSale : hasRent;
                const on = (r?.mode ?? mode) === m;
                return (
                  <button
                    key={m}
                    role="radio"
                    aria-checked={on}
                    disabled={!available}
                    onClick={() => update({ ...a, mode: m }, true)}
                    className={`flex-1 rounded px-2 py-1 transition-colors disabled:cursor-not-allowed disabled:text-faint ${
                      on ? "bg-white font-medium text-ink shadow-sm" : "text-muted"
                    }`}
                  >
                    {m === "sale" ? "Sell at today's prices" : "Rent it out"}
                  </button>
                );
              })}
            </div>
            {(!hasSale || !hasRent) && (
              <p className="mt-1 text-[12px] text-muted">
                {!hasSale
                  ? `Selling is unavailable: Zillow has no home price series for ${comps.neighborhood}.`
                  : `Renting is unavailable: Zillow has no rent series for ${comps.zip ? `ZIP ${comps.zip}` : "this ZIP"}.`}
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
            <Num k="hardCostPerSf" label="Construction $/sq ft" value={a.hardCostPerSf} onChange={(v) => set("hardCostPerSf", v)} />
            <Num k="softCostPct" label="Fees & design (% of construction)" value={a.softCostPct} onChange={(v) => set("softCostPct", v)} />
            <Num k="devFeePct" label="Developer's fee (%)" value={a.devFeePct} onChange={(v) => set("devFeePct", v)} />
            <Num k="targetMarginPct" label="Required return (%)" value={a.targetMarginPct} onChange={(v) => set("targetMarginPct", v)} />
            {(r?.mode ?? mode) === "sale" &&
              (typology === "single" ? (
                <Num k="typicalHomeSf" label="Typical home size (sq ft)" value={a.typicalHomeSf} onChange={(v) => set("typicalHomeSf", v)} step={50} />
              ) : (
                <div>
                  <span className="mb-1 block text-[12px] text-muted">Home size</span>
                  <span className="block py-1.5 text-[13px] text-ink tabular-nums">
                    {plan.units} × {plan.sfPerUnit.toLocaleString()} sq ft
                  </span>
                </div>
              ))}
            <label className="block">
              <span className="mb-1 block text-[12px] text-muted">Land cost, this lot only ($)</span>
              <input
                type="number"
                min={0}
                step={1000}
                value={a.landOverride ?? ""}
                placeholder={lot.landValue != null ? `${lot.landValue} county` : `${a.defaultLand} default`}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  set("landOverride", e.target.value === "" || !Number.isFinite(n) ? null : Math.max(0, n));
                }}
                className="w-full rounded-md border border-hairline bg-white px-2 py-1.5 text-[13px] tabular-nums"
              />
            </label>
            {(r?.mode ?? mode) === "rent" && (
              <>
                <Num k="opexPct" label="Operating costs (% of rent)" value={a.opexPct} onChange={(v) => set("opexPct", v)} />
                <Num k="capRate" label={<Tooltip content={TIP.capRate}>Cap rate (%)</Tooltip>} value={a.capRate} onChange={(v) => set("capRate", v)} step={0.25} />
              </>
            )}
          </div>
          {r && (
            <details className="text-[12px]">
              <summary className="cursor-pointer text-accent select-none">Where each number comes from</summary>
              <ul className="mt-2 space-y-1.5">
                {r.inputsUsed.map((x) => (
                  <li key={x.key} className="leading-snug">
                    <span className="text-ink">{x.label}: </span>
                    <span className="text-ink tabular-nums">{x.display}</span>
                    <span className="block text-muted">
                      {x.url ? (
                        <a href={x.url} target="_blank" rel="noreferrer" className="underline decoration-hairline underline-offset-2 hover:decoration-muted">
                          {x.source}
                        </a>
                      ) : (
                        x.source
                      )}
                      {x.assumed ? ", editable assumption" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </details>
    </div>
  );
}

function CompsTip({ comps, mode }: { comps: Comps; mode: RevenueMode }) {
  return (
    <span className="block space-y-1">
      <span className={`block ${mode === "sale" ? "" : "text-white/70"}`}>
        Typical home price in {comps.neighborhood}: {comps.zhvi != null ? fmtUsd(comps.zhvi) : "not available"}
        {comps.zhviDate ? ` (${comps.zhviDate.slice(0, 7)})` : ""}
      </span>
      <span className={`block ${mode === "rent" ? "" : "text-white/70"}`}>
        Typical rent in {comps.zip ?? "this ZIP"}: {comps.zori != null ? `${fmtUsd(comps.zori)}/mo` : "not available"}
        {comps.zoriDate ? ` (${comps.zoriDate.slice(0, 7)})` : ""}
      </span>
      <span className="block text-white/70">Zillow Research. {mode === "sale" ? "Scaled by home size." : "Less operating costs, divided by the cap rate."}</span>
    </span>
  );
}

/**
 * A numeric assumption. The typed text stays as typed; the committed number is the value the model
 * accepts (clamped to range, or the default for blanks), and a note says when the two differ.
 */
function Num({
  k,
  label,
  value,
  onChange,
  step = 1,
}: {
  k: RangedKey;
  label: React.ReactNode;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  const [text, setText] = useState(String(value));
  const parsed = text.trim() === "" ? NaN : Number(text);
  const used = acceptedValue(k, parsed);
  if (used !== value) setText(String(value));
  const { min, max } = FINANCE_RANGES[k];
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] text-muted">{label}</span>
      <input
        type="number"
        value={text}
        step={step}
        min={min}
        max={max}
        aria-invalid={used !== parsed}
        onChange={(e) => {
          setText(e.target.value);
          const n = e.target.value.trim() === "" ? NaN : Number(e.target.value);
          onChange(acceptedValue(k, n));
        }}
        className={`w-full rounded-md border bg-white px-2 py-1.5 text-[13px] tabular-nums ${used !== parsed ? "border-[#d97706]" : "border-hairline"}`}
      />
      {used !== parsed && (
        <span className="mt-0.5 block text-[12px] leading-tight text-[#a16207]">
          Outside the accepted range ({min}–{max}), using {used}
        </span>
      )}
    </label>
  );
}

function Row({ label, value, swatch }: { label: React.ReactNode; value: string; swatch: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <dt className="flex min-w-0 items-baseline gap-2 text-muted">
        <span aria-hidden className="inline-block h-2 w-2 shrink-0 translate-y-[-1px] rounded-full" style={{ background: swatch }} />
        <span className="min-w-0">{label}</span>
      </dt>
      <dd className="shrink-0 text-ink tabular-nums">{value}</dd>
    </div>
  );
}
