"use client";
import { useMemo, useState } from "react";
import Segmented from "./ui/Segmented";
import type { Comps, Finding, Lot, Typology } from "@/lib/types";
import { TYPOLOGY_LABEL } from "@/lib/types";
import { verdictLabel } from "./ui/answer";
import {
  fmtUsd,
  proformaWithFallback,
  UNIT_PLAN,
  ZILLOW_DATA_URL,
  type FinanceAssumptions,
  type Proforma,
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
  /** The selected case's pro forma: the same numbers as the answer card and the exports. */
  proforma: Proforma | null;
  /** The selected case's assumptions, with this lot's land figure as `landOverride`. */
  assumptions: FinanceAssumptions;
  /** Shared assumptions changed (never carries the land figure). Applied to this lot at once. */
  onAssumptions: (a: FinanceAssumptions) => void;
  /** This lot's acquisition cost; null uses the assessed value. */
  onLandOverride: (v: number | null) => void;
  /** Send pending edits to the city-wide pass now (on blur). */
  onCommit?: () => void;
  /** Set when the finance data file failed to load; distinct from a neighborhood with no series. */
  compsError?: string | null;
  onRetryComps?: () => void;
  /** Why the answer card carries no finance line (use or fit fails, not for sale); the numbers below are then hypothetical. */
  blocked?: string | null;
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export const NO_COMPS = "No Zillow comps for this neighborhood; finance not assessed";

function CompsFailed({ onRetry }: { onRetry?: () => void }) {
  return (
    <p role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-[#e7c98a] bg-[#fff8e6] px-3 py-3 text-[13px] text-[#6b4a00]">
      <span>Finance data didn&apos;t load, so this lot is not assessed.</span>
      {onRetry && (
        <button onClick={onRetry} className="shrink-0 font-medium text-accent underline decoration-accent/30 underline-offset-[3px] hover:decoration-accent">
          Retry
        </button>
      )}
    </p>
  );
}

export default function ProForma({
  lot,
  comps,
  findings,
  typology,
  onTypology,
  proforma,
  assumptions,
  onAssumptions,
  onLandOverride,
  onCommit,
  compsError,
  onRetryComps,
  blocked = null,
}: Props) {
  // Controlled by the selected case: every edit rebuilds the case synchronously, so the headline,
  // the evidence row and these numbers always come from the same inputs. The app batches edits
  // for the city-wide pass on its own.
  const a = assumptions;
  const r = proforma;
  const update = (next: FinanceAssumptions) => {
    const { landOverride: land, ...shared } = next;
    if ((land ?? null) !== (a.landOverride ?? null)) onLandOverride(land ?? null);
    else onAssumptions(shared);
  };
  const altHard = a.hardCostPerSf + 10;
  const rAlt = useMemo(
    () => proformaWithFallback(lot, typology, comps, { ...a, hardCostPerSf: altHard }),
    [lot, typology, comps, a, altHard],
  );
  const set = <K extends keyof FinanceAssumptions>(k: K, v: FinanceAssumptions[K]) => update({ ...a, [k]: v });
  const mode: RevenueMode = a.mode;
  const verdictOf = (t: Typology) => findings.find((f) => f.typology === t)?.verdict ?? "unknown";
  const selectedVerdict = verdictOf(typology);
  const selectedFinding = findings.find((f) => f.typology === typology) ?? null;

  if (!comps) {
    if (compsError) return <CompsFailed onRetry={onRetryComps} />;
    return <p className="rounded-lg border border-dashed border-hairline px-3 py-3 text-[13px] text-muted">{NO_COMPS}.</p>;
  }

  const hasSale = comps.zhvi != null;
  const hasRent = comps.zori != null;
  const plan = UNIT_PLAN[typology];
  const target = a.targetMarginPct;
  const scale = r ? Math.max(r.totalCost, r.revenue) : 1;
  const mainLine = r
    ? r.pencils
      ? `Clears the cost-and-return screen: ${fmtUsd(r.margin - (r.totalCost * target) / 100)} above a ${target}% return`
      : `Modeled shortfall: ${fmtUsd(r.gap)} below a ${target}% return`
    : "";

  return (
    <div className="space-y-4">
      {r ? (
        <div>
          {blocked && (
            <p className="mb-1.5 text-[13px] leading-snug font-medium text-[#7a5400]">
              Finance not assessed: {TYPOLOGY_LABEL[typology].toLowerCase()} {blocked.replace(/^[^:]+:\s*/, "")}. The numbers below are hypothetical.
            </p>
          )}
          <p className={`font-serif text-[22px] leading-tight ${blocked ? "text-muted" : r.pencils ? "text-accent" : "text-[#9a3412]"}`}>
            {blocked ? `Hypothetically, ${lowerFirst(mainLine)}` : mainLine}
          </p>
          <p className="mt-1 text-[13px] leading-snug text-muted">
            {r.pencils
              ? `Against the ${r.mode === "rent" ? "ZIP rent index" : "neighborhood home-value index"}, a modeled ${TYPOLOGY_LABEL[typology].toLowerCase()} covers its costs and a ${target}% return. A reference index, not an appraisal or an achievable price.`
              : `Against the ${r.mode === "rent" ? "ZIP rent index" : "neighborhood home-value index"}, a modeled ${TYPOLOGY_LABEL[typology].toLowerCase()} falls short of a ${target}% return. A reference index, not an appraisal or a subsidy need.`}{" "}
            <span className="tabular-nums">
              Value needed for the target return {fmtUsd(r.breakEvenValue)}; at ${altHard}/sq ft{" "}
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
            Zoning: {selectedFinding ? verdictLabel(selectedFinding).toLowerCase() : "not checked"} for this type; these numbers assume it gets approved.
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

      <details className="group rounded-lg border border-hairline bg-white" onBlur={onCommit}>
        <summary className="flex cursor-pointer items-center justify-between px-3 py-2 text-[13px] font-medium text-ink select-none">
          Adjust assumptions
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className="text-muted transition-transform group-open:rotate-180">
            <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
          </svg>
        </summary>
        <div className="space-y-3 border-t border-hairline px-3 pt-3 pb-3">
          <div>
            <Segmented<RevenueMode>
              label="Revenue"
              equal
              value={r?.mode ?? mode}
              onChange={(m) => update({ ...a, mode: m })}
              options={[
                { value: "sale", label: "Sell at today's prices", disabled: !hasSale },
                { value: "rent", label: "Rent it out", disabled: !hasRent },
              ]}
            />
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
